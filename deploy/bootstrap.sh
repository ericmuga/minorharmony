#!/usr/bin/env bash
# deploy/bootstrap.sh — one-time setup for Serviam on an Ubuntu VPS.
#
# This box is SHARED with other production sites, so this script is deliberately
# conservative: it never removes or downgrades system packages (especially Node —
# every other app here runs on the same system Node), and it only ever adds a
# vhost/unit scoped to serviam.
#
# Prereqs (manual, one-time per box):
#   1. Create the deploy user and put your laptop's SSH key in their authorized_keys.
#   2. Give that user sudo privileges (will be narrowed at end of this script).
#   3. Clone the repo: git clone https://github.com/ericmuga/minorharmony.git /var/www/serviam
#   4. cd /var/www/serviam && sudo bash deploy/bootstrap.sh
#
# Re-running this script is safe — it's idempotent.

set -euo pipefail

# This box has nvm installed for root with an old default (v16.13.2). Interactive
# shells source it and get that Node; non-interactive ones — CI over ssh, and the
# systemd units, which hardcode /usr/bin/node — get v22. better-sqlite3 is a native
# module bound to the ABI it was compiled against, so we must always build with the
# same Node the service will run. Pin PATH to /usr/bin, whatever the caller's shell.
export PATH="/usr/bin:$PATH"
hash -r

REPO_DIR="/var/www/serviam"
DOMAIN="serviam.minorharmony.com"
VHOST="$DOMAIN.conf"                                  # matches this box's naming convention
DEPLOY_USER="${DEPLOY_USER:-serviam_deploy_user}"
APP_RUN_USER="www-data"                               # who systemd launches node as

if [[ "$(pwd)" != "$REPO_DIR" ]]; then
  echo "ERROR: run from $REPO_DIR (currently: $(pwd))" >&2
  exit 1
fi

echo "==> [1/9] Required tooling (install only what's missing)"
need=()
for pkg in nginx git curl build-essential; do
  dpkg -s "$pkg" >/dev/null 2>&1 || need+=("$pkg")
done
if ((${#need[@]})); then
  echo "    Installing: ${need[*]}"
  sudo apt-get update -qq
  sudo apt-get install -y -qq "${need[@]}"
else
  echo "    All present."
fi
command -v certbot >/dev/null || echo "    WARNING: certbot not found — install it before requesting TLS."

echo "==> [2/9] Node version check (never modified — shared with other sites)"
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/' || true)
if [[ -z "$NODE_MAJOR" || "$NODE_MAJOR" -lt 20 ]]; then
  echo "    FATAL: need Node >= 20, found ${NODE_MAJOR:-none}." >&2
  echo "    Install it yourself and re-run — this script will NOT touch system Node," >&2
  echo "    because other apps on this box depend on it." >&2
  exit 1
fi
echo "    node $(node -v) at $(command -v node) / npm $(npm -v) — OK, leaving untouched."

echo "==> [3/9] Production .env"
if [[ ! -f .env ]]; then
  cp .env.example .env
  SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$SECRET|" .env
  sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" .env
  sed -i "s|^APP_ORIGIN=.*|APP_ORIGIN=https://$DOMAIN|" .env
  # Stays false until certbot has issued a cert, otherwise the browser drops the
  # session cookie over plain HTTP and login silently fails.
  sed -i "s|^SECURE_COOKIES=.*|SECURE_COOKIES=false|" .env
  echo "    Created .env with a random SESSION_SECRET (SECURE_COOKIES=false until TLS)."
else
  echo "    .env already exists, leaving it alone."
fi

echo "==> [4/9] Install dependencies and build"
(cd server && npm install)
(cd web && npm install && npm run build)

echo "==> [5/9] Ownership"
# Repo owned by deploy user (so CI can git pull / npm ci without sudo)
sudo chown -R "$DEPLOY_USER:$DEPLOY_USER" "$REPO_DIR"
# Except the SQLite data dir, which the systemd-launched node process writes to
sudo mkdir -p "$REPO_DIR/server/data"
sudo chown -R "$APP_RUN_USER:$APP_RUN_USER" "$REPO_DIR/server/data"
# nginx (www-data) must be able to traverse into web/dist
sudo chmod o+x "$REPO_DIR" "$REPO_DIR/web"

echo "==> [6/9] systemd units (symlinked from repo so future changes auto-flow)"
for unit in serviam.service serviam-sync.service serviam-sync.timer \
            serviam-digest.service serviam-digest.timer; do
  sudo ln -sf "$REPO_DIR/deploy/$unit" "/etc/systemd/system/$unit"
done
sudo systemctl daemon-reload
sudo systemctl enable --now serviam serviam-sync.timer serviam-digest.timer
sudo systemctl status serviam --no-pager | head -5 || true

echo "==> [7/9] nginx vhost (symlinked)"
sudo ln -sf "$REPO_DIR/deploy/nginx.conf" "/etc/nginx/sites-available/$VHOST"
sudo ln -sf "/etc/nginx/sites-available/$VHOST" "/etc/nginx/sites-enabled/$VHOST"
sudo nginx -t
sudo systemctl reload nginx

echo "==> [8/9] Narrow sudoers for $DEPLOY_USER (lets CI reload services)"
sudo tee /etc/sudoers.d/serviam-deploy >/dev/null <<EOF
$DEPLOY_USER ALL=(root) NOPASSWD: /bin/systemctl daemon-reload, /bin/systemctl restart serviam, /bin/systemctl reload nginx, /usr/sbin/nginx -t
EOF
sudo chmod 440 /etc/sudoers.d/serviam-deploy
sudo visudo -c >/dev/null

echo "==> [9/9] Done. Remaining manual steps:"
cat <<EOF

  (a) Create your login (interactive — sets your password):
        cd $REPO_DIR/server && sudo -u $APP_RUN_USER npm run create-user

  (b) Get TLS (only after DNS for $DOMAIN points to this box):
        sudo certbot --nginx -d $DOMAIN
      Then flip the cookie to Secure and restart:
        sudo sed -i 's|^SECURE_COOKIES=.*|SECURE_COOKIES=true|' $REPO_DIR/.env
        sudo systemctl restart serviam

  (c) Generate the GitHub Actions deploy key:
        ssh-keygen -t ed25519 -f ~/.ssh/serviam_deploy -N "" -C "github-actions"
        cat ~/.ssh/serviam_deploy.pub >> ~/.ssh/authorized_keys
        cat ~/.ssh/serviam_deploy    # paste into GitHub -> production env -> DEPLOY_SSH_KEY
        rm ~/.ssh/serviam_deploy ~/.ssh/serviam_deploy.pub

  Then: https://$DOMAIN
EOF
