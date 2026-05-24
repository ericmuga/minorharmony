#!/usr/bin/env bash
# deploy/bootstrap.sh — one-time setup on a fresh Ubuntu VPS.
#
# Prereqs (manual, one-time per box):
#   1. Create the deploy user and put your laptop's SSH key in their authorized_keys.
#   2. Give that user sudo privileges (will be narrowed at end of this script).
#   3. Clone the repo: git clone https://github.com/ericmuga/minorharmony.git /var/www/serviam
#   4. cd /var/www/serviam && bash deploy/bootstrap.sh
#
# Re-running this script is safe — it's idempotent.

set -euo pipefail

REPO_DIR="/var/www/serviam"
DOMAIN="serviam.minorharmony.com"
DEPLOY_USER="${DEPLOY_USER:-$USER}"
APP_RUN_USER="www-data"   # who systemd launches node as

if [[ "$(pwd)" != "$REPO_DIR" ]]; then
  echo "ERROR: run from $REPO_DIR (currently: $(pwd))" >&2
  exit 1
fi

echo "==> [1/9] OS packages"
sudo apt-get update -qq
sudo apt-get install -y -qq nginx git curl certbot python3-certbot-nginx build-essential

echo "==> [2/9] Node 20"
NODE_MAJOR=0
if command -v node >/dev/null; then
  NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
fi
if [[ "$NODE_MAJOR" != "20" ]]; then
  echo "    Installing Node 20 (current: ${NODE_MAJOR:-none})"
  sudo apt-get remove -y nodejs npm libnode-dev 2>/dev/null || true
  sudo apt-get autoremove -y
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
echo "    node $(node -v) / npm $(npm -v)"

echo "==> [3/9] Production .env"
if [[ ! -f .env ]]; then
  cp .env.example .env
  SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$SECRET|" .env
  sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" .env
  sed -i "s|^SECURE_COOKIES=.*|SECURE_COOKIES=true|" .env
  sed -i "s|^APP_ORIGIN=.*|APP_ORIGIN=https://$DOMAIN|" .env
  echo "    Created .env with a random SESSION_SECRET."
  echo
  echo "    PAUSE: edit .env now if you want to add ANTHROPIC_API_KEY, then press Enter."
  read -r _
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

echo "==> [6/9] systemd units (symlinked from repo so future changes auto-flow)"
for unit in serviam.service serviam-sync.service serviam-sync.timer \
            serviam-digest.service serviam-digest.timer; do
  sudo ln -sf "$REPO_DIR/deploy/$unit" "/etc/systemd/system/$unit"
done
sudo systemctl daemon-reload
sudo systemctl enable --now serviam serviam-sync.timer
sudo systemctl status serviam --no-pager | head -5 || true

echo "==> [7/9] nginx vhost (symlinked)"
sudo ln -sf "$REPO_DIR/deploy/nginx.conf" /etc/nginx/sites-available/serviam
sudo ln -sf /etc/nginx/sites-available/serviam /etc/nginx/sites-enabled/serviam
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
        cd $REPO_DIR/server && npm run create-user

  (b) Get TLS (only after DNS for $DOMAIN points to this box):
        sudo certbot --nginx -d $DOMAIN

  (c) Generate the GitHub Actions deploy key:
        ssh-keygen -t ed25519 -f ~/.ssh/serviam_deploy -N "" -C "github-actions"
        cat ~/.ssh/serviam_deploy.pub >> ~/.ssh/authorized_keys
        cat ~/.ssh/serviam_deploy    # paste into GitHub -> production env -> DEPLOY_SSH_KEY
        rm ~/.ssh/serviam_deploy ~/.ssh/serviam_deploy.pub

  Then: https://$DOMAIN
EOF
