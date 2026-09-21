# Deploying Serviam

Target box: the **Hostinger VPS `46.202.160.133`** (`srv423233`, Ubuntu 22.04, Node 22).
It is **shared** with ~20 other production vhosts (`prime-till.com`, `primehubonline.com`, …),
so nothing here may touch system-wide packages. In particular: **never downgrade Node** —
`bootstrap.sh` will refuse to, and CI only checks for Node >= 20.

Domain: **`serviam.minorharmony.com`** — the app's home. `minorharmony.com` and `www` 301
to it. Registered via **hostblast / GoCheapWeb**, but DNS is *not* served there.

---

## 1. DNS

The zone is served by **Namecheap FreeDNS** (`ns1/ns2/ns3.dnsowl.com`) — edit records in the
Namecheap account (Domain List → Manage → Advanced DNS), *not* at HostBlast/GoCheapWeb, whose
nameservers answer `REFUSED` and whose zone nothing queries.

| Name | Type | Value | Status (2026-09-21) |
|---|---|---|---|
| `minorharmony.com` | A | `46.202.160.133` | ✅ |
| `www` | A | `46.202.160.133` | ✅ |
| `serviam` | A | `46.202.160.133` | ✅ |

Your local resolver is an internal one that SERVFAILs on this domain at times, so check with
`8.8.8.8` explicitly — certbot fails on a name that doesn't resolve publicly:

```bash
nslookup serviam.minorharmony.com 8.8.8.8      # expect: 46.202.160.133
```

> If you ever see **Prime Till** (or its certificate) at one of these names, that name has
> fallen through to nginx's default vhost: either the symlink in `sites-enabled` is gone, or
> the name is missing from a `server_name` in `deploy/nginx.conf`. That is exactly what
> happened when `serviam.` first resolved — it was in the `:80` block only, so HTTPS landed on
> Prime Till's cert.

**Later: moving to Hostinger.** Do the transfer *after* the site is stable. Create the zone at
Hostinger with the apex, `www` and `serviam` records first, let it sit, then switch the
nameservers at the registrar, so the records exist before delegation flips.

---

## 2. One-time box setup

Already partly done — `/var/www/serviam` is cloned and owned by `serviam_deploy_user`.
Finish it with the bootstrap script, which is idempotent and safe to re-run:

```bash
ssh root@46.202.160.133
cd /var/www/serviam
git pull
bash deploy/bootstrap.sh
```

> **Node on this box is two different things.** root has nvm installed with
> **v16.13.2** as its default, so an *interactive* ssh session gets Node 16, while
> non-interactive sessions (GitHub Actions) and the systemd units (`/usr/bin/node`)
> get **v22.22.3**. Running `npm install` under the wrong one leaves `better-sqlite3`
> compiled for an ABI the service can't load. `bootstrap.sh` pins `PATH=/usr/bin`
> to avoid this, but if you're running npm by hand, first do:
>
> ```bash
> nvm deactivate && hash -r && node -v    # must print v22.x
> ```

It installs only missing packages, refuses to touch Node, builds `web/dist`, symlinks the
systemd units and the nginx vhost (`/etc/nginx/sites-available/serviam.minorharmony.com.conf`,
matching this box's naming convention), enables the API + both timers, and writes a narrow
sudoers rule so CI can reload services without full root.

Then create your login:

```bash
cd /var/www/serviam/server
PATH=/usr/bin npm run create-user                     # interactive: sets your password
PATH=/usr/bin npm run seed                            # activities + briefing topics
chown -R www-data:www-data /var/www/serviam/server/data
```

Run these as root, then hand the DB back to `www-data` — running npm *as* `www-data`
fails on this box because that user has no writable `HOME` for the npm cache.

The `PATH=/usr/bin` prefix is what makes these work in an interactive root shell, where
nvm's Node 16 is on PATH. Without it `create-user` dies immediately:

```
Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:readline/promises
```

`node:readline/promises` arrived in Node 17. Same root cause as the `better-sqlite3` ABI
trap above, different symptom — see the Node warning in this section.

### Smoke-test without touching DNS

Proves the whole stack works regardless of which name you're serving:

```bash
curl -s http://127.0.0.1:8787/api/health                                   # {"ok":true}
curl -sI -H 'Host: serviam.minorharmony.com' http://46.202.160.133/         # 301 → https://serviam.…
```

Login won't work over plain HTTP while `SECURE_COOKIES=true`, which is why bootstrap leaves
it `false` until TLS is in place (step 3).

---

## 3. TLS — certbot issues, git owns the config

> **Do not use `certbot --nginx` on this box.** Its *installer* parses every vhost's TLS
> config, and one of the ~20 other sites here references a 1024-bit RSA key, which modern
> certbot refuses to load:
>
> ```
> Could not install certificate
> Unsupported RSA key length: 1024
> ```
>
> Our cert is fine — only the install step fails. (`certbot --nginx` will still *issue*
> happily, which is why the first attempt left a valid cert behind and only errored at the
> end.) So the 443 block is written by hand in `deploy/nginx.conf`, and certbot runs in
> `certonly --webroot` mode. That also fixes a second problem: the vhost is a **symlink into
> the repo**, so anything certbot wrote into it would be destroyed by the next deploy's
> `git reset --hard`.

Issue (or re-point an existing cert to webroot renewal) — this also drops the broken nginx
installer from the renewal config, so unattended renewals stop failing:

```bash
sudo mkdir -p /var/www/certbot/.well-known/acme-challenge
sudo chown -R www-data:www-data /var/www/certbot

sudo certbot certonly --webroot -w /var/www/certbot \
  --cert-name minorharmony.com \
  -d minorharmony.com -d www.minorharmony.com -d serviam.minorharmony.com \
  --deploy-hook "systemctl reload nginx"
```

One cert (`--cert-name minorharmony.com`) covers all three names; to add a name later, rerun
this with `--expand` and **every** name listed, not just the new one.

Then reload nginx and flip the app to HTTPS:

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo sed -i 's|^SECURE_COOKIES=.*|SECURE_COOKIES=true|' /var/www/serviam/.env
sudo sed -i 's|^APP_ORIGIN=.*|APP_ORIGIN=https://serviam.minorharmony.com|' /var/www/serviam/.env
sudo systemctl restart serviam
```

Verify renewal actually works unattended — **don't skip this**, it's the whole point of the
webroot switch:

```bash
sudo certbot renew --dry-run
```

### What "well configured" means here

Shared TLS settings are in `deploy/nginx-tls.conf`, included by both 443 blocks:
Mozilla *intermediate* (TLS 1.2/1.3, ECDHE + AEAD ciphers only), no session tickets. The
box-wide `nginx.conf` still allows TLS 1.0/1.1 for the other sites — ours overrides it per
server. No OCSP stapling: Let's Encrypt retired OCSP in 2025.

`serviam.` also sends HSTS (host-only, **no** `includeSubDomains` — other names under
`minorharmony.com` may not have certs), plus `nosniff`, `X-Frame-Options: DENY` and
`Referrer-Policy: same-origin`. HSTS starts at one week; bump `max-age` to `31536000` once
it has run clean. Check from outside with:

```bash
curl -sI https://serviam.minorharmony.com | grep -i strict
# or: https://www.ssllabs.com/ssltest/analyze.html?d=serviam.minorharmony.com
```

### Bootstrapping TLS on a *fresh* box

Chicken-and-egg: the webroot challenge needs nginx serving `:80`, but `nginx -t` fails while
the 443 blocks point at a cert that doesn't exist yet. `bootstrap.sh` detects this and tells
you. To break the loop, comment out both `listen 443` blocks in `deploy/nginx.conf`,
reload, issue the cert, then uncomment and reload again.

---

## 4. Deploying changes

Pushing to `main` deploys automatically. To deploy on demand:

```bash
gh workflow run deploy.yml          # trigger
gh run watch                        # follow it
```

…or use the **Run workflow** button on the Actions → Deploy page.

The job requires Node >= 20 on the box, pulls, runs `npm ci` + `vite build`, reloads nginx,
restarts the service, and then **polls `/api/health` for 15s** — a deploy is only green once
the API actually answers. Secrets live in the repo's `production` environment:
`DEPLOY_HOST`, `DEPLOY_USER` (`serviam_deploy_user`), `DEPLOY_SSH_KEY`.

> Every deploy before 2026-08-29 failed at the same guard: the workflow hard-required
> `node -v` to start with `v20`, and this box runs v22. That check is now a `>= 20` comparison.

---

## 5. Calendars

- **Google (Primehub):** Google Calendar → calendar *Settings* → *Integrate calendar* →
  copy the **Secret address in iCal format**.
- **Outlook (Farmers Choice):** Outlook → *Settings → Calendar → Shared calendars → Publish* →
  copy the **ICS** link. If FCL's tenant has publishing disabled that link won't appear, and
  we'd need the Microsoft Graph provider in `services/calendarSync.js` instead.

Add each via `POST /api/calendars`. `serviam-sync.timer` refreshes both every 15 min.

## 6. Daily briefing

`serviam-digest.timer` runs `src/scripts/run-digest.js` at 06:00 daily and needs
`ANTHROPIC_API_KEY` in `/var/www/serviam/.env`. Generate one immediately to test:

```bash
cd /var/www/serviam/server && node src/scripts/run-digest.js
```

The Briefing tab reads the latest per topic; "Refresh" calls `POST /api/briefings/generate`.
