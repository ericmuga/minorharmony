# Deploying Serviam

Target box: the **Hostinger VPS `46.202.160.133`** (`srv423233`, Ubuntu 22.04, Node 22).
It is **shared** with ~20 other production vhosts (`prime-till.com`, `primehubonline.com`, …),
so nothing here may touch system-wide packages. In particular: **never downgrade Node** —
`bootstrap.sh` will refuse to, and CI only checks for Node >= 20.

Domain: **`minorharmony.com`** (apex + `www`) for now; `serviam.minorharmony.com` later —
see §1. Registered via **hostblast / GoCheapWeb**, but DNS is *not* served there.

---

## 1. DNS — we're live on the apex, not the subdomain

> **Current state (checked 2026-09-06).** The zone recovered, but it **moved**. Delegation is
> now `ns1/ns2/ns3.dnsowl.com` (Namecheap FreeDNS); the old `NS*.GOCHEAPWEB.COM` still answer
> `REFUSED`. So the apex works and the subdomain does not:
>
> | Query | Answer |
> |---|---|
> | `minorharmony.com` @8.8.8.8 | `46.202.160.133` ✅ |
> | `www.minorharmony.com` @ns1.dnsowl.com | `46.202.160.133` ✅ |
> | `serviam.minorharmony.com` @ns1.dnsowl.com | **NXDOMAIN** ❌ |
>
> HostBlast support did add the `serviam` A record on 2026-09-06, but in *their* zone — which
> nothing queries, because delegation points at dnsowl. Their record will never take effect
> while the NS records stay as they are.

**Therefore: Serviam is served on the apex.** `deploy/nginx.conf` claims
`minorharmony.com www.minorharmony.com serviam.minorharmony.com`, and the cert covers the
first two. Nothing is blocked on DNS.

> Note that before this vhost existed, `minorharmony.com` did resolve but had no server block,
> so nginx fell through to the default vhost and served **Prime Till** under a mismatched cert.
> If you ever see Prime Till at minorharmony.com again, the symlink in `sites-enabled` is gone.

### Adding `serviam.` later

1. Add the record where the zone actually lives — the **Namecheap account** holding
   `minorharmony.com` (Domain List → Manage → Advanced DNS; `dnsowl` is Namecheap FreeDNS):

   | Type | Host | Value | TTL |
   |---|---|---|---|
   | `A` | `serviam` | `46.202.160.133` | `300` |

   Doing it at HostBlast/GoCheapWeb accomplishes nothing unless the nameservers move back —
   and their zone is empty, so moving them would take the apex down too. Don't.

2. Verify — **do not skip this**, certbot fails on a name that doesn't resolve:

   ```bash
   nslookup serviam.minorharmony.com 8.8.8.8      # expect: 46.202.160.133
   ```

   Your local resolver is an internal one that SERVFAILs on this domain, so always query
   `8.8.8.8` explicitly.

3. nginx already answers for the name — just add it to the cert (§3).

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
npm run create-user                                   # interactive: sets your password
npm run seed                                          # activities + briefing topics
chown -R www-data:www-data /var/www/serviam/server/data
```

Run these as root, then hand the DB back to `www-data` — running npm *as* `www-data`
fails on this box because that user has no writable `HOME` for the npm cache.

### Smoke-test without touching DNS

Proves the whole stack works regardless of which name you're serving:

```bash
curl -s http://127.0.0.1:8787/api/health                                   # {"ok":true}
curl -sI -H 'Host: minorharmony.com' http://46.202.160.133/                 # 200 from nginx
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
  -d minorharmony.com -d www.minorharmony.com \
  --deploy-hook "systemctl reload nginx"
```

Then reload nginx and flip the app to HTTPS:

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo sed -i 's|^SECURE_COOKIES=.*|SECURE_COOKIES=true|' /var/www/serviam/.env
sudo sed -i 's|^APP_ORIGIN=.*|APP_ORIGIN=https://minorharmony.com|' /var/www/serviam/.env
sudo systemctl restart serviam
```

Verify renewal actually works unattended — **don't skip this**, it's the whole point of the
webroot switch:

```bash
sudo certbot renew --dry-run
```

### Adding `serviam.` to the cert later

Once it resolves (§1), expand the **same** cert — `--expand` needs every name listed, not
just the new one — then add the name to the 443 `server_name` in `deploy/nginx.conf` and
commit:

```bash
sudo certbot certonly --webroot -w /var/www/certbot --expand \
  --cert-name minorharmony.com \
  -d minorharmony.com -d www.minorharmony.com -d serviam.minorharmony.com
```

### Bootstrapping TLS on a *fresh* box

Chicken-and-egg: the webroot challenge needs nginx serving `:80`, but `nginx -t` fails while
the 443 block points at a cert that doesn't exist yet. `bootstrap.sh` detects this and tells
you. To break the loop, comment out the second `server { ... }` block in `deploy/nginx.conf`,
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
