# Deploying Serviam

Target box: the **Hostinger VPS `46.202.160.133`** (`srv423233`, Ubuntu 22.04, Node 22).
It is **shared** with ~20 other production vhosts (`prime-till.com`, `primehubonline.com`, …),
so nothing here may touch system-wide packages. In particular: **never downgrade Node** —
`bootstrap.sh` will refuse to, and CI only checks for Node >= 20.

Domain: `serviam.minorharmony.com`, registered via **hostblast / GoCheapWeb**
(nameservers `NS1.GOCHEAPWEB.COM`, `NS2.GOCHEAPWEB.COM`).

---

## 1. DNS — point the subdomain at the VPS

> **Current state (checked 2026-08-29): the whole `minorharmony.com` zone is broken.**
> Both nameservers answer `REFUSED` for the zone, so *nothing* under the domain resolves —
> not just `serviam`. The registration itself is fine (active, expires 2027-04-30).
> That means the zone is missing on the DNS servers, so you must **recreate the zone before
> the A record will do anything**.

In the hostblast control panel:

1. Log in → find **DNS Zone Editor** (sometimes under "Domains" → "Manage DNS", or via cPanel).
2. Check whether a zone for `minorharmony.com` exists.
   - **If it does not** — create it. That is the actual fix; the A record alone won't help.
   - **If it does but nothing resolves** — the domain isn't attached to the DNS service on
     that account. Raise a ticket: *"minorharmony.com is delegated to NS1/NS2.GOCHEAPWEB.COM
     but both return REFUSED for the zone. Please (re)create and activate the zone."*
3. Add the record:

   | Field | Value |
   |---|---|
   | Type | `A` |
   | Name / Host | `serviam` (some panels want the FQDN: `serviam.minorharmony.com`) |
   | Points to / Value | `46.202.160.133` |
   | TTL | `300` (raise to 3600 once it's stable) |

4. Save, then verify from your laptop — **do not skip this**, certbot will fail otherwise:

   ```bash
   nslookup serviam.minorharmony.com 8.8.8.8
   # expect: Address: 46.202.160.133
   ```

   Your local resolver is an internal one (`100.100.2.22`) that currently SERVFAILs on this
   domain, so always query `8.8.8.8` or `1.1.1.1` explicitly when checking.

5. Propagation at TTL 300 is usually minutes, but a fresh zone can take up to a few hours.

**Later: moving to Hostinger.** Do the transfer *after* the site is up and stable. Order:
create the zone at Hostinger with the same `serviam` A record first, let it sit, then switch
the nameservers at the registrar. That way the record already exists when delegation flips
and there's no outage.

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

### Smoke-test before DNS exists

You can prove the whole stack works without waiting for the A record:

```bash
curl -s http://127.0.0.1:8787/api/health                                   # {"ok":true}
curl -sI -H 'Host: serviam.minorharmony.com' http://46.202.160.133/         # 200 from nginx
```

Login won't work over plain HTTP while `SECURE_COOKIES=true`, which is why bootstrap leaves
it `false` until TLS is in place (step 3).

---

## 3. TLS — only once DNS resolves

```bash
sudo certbot --nginx -d serviam.minorharmony.com
sudo sed -i 's|^SECURE_COOKIES=.*|SECURE_COOKIES=true|' /var/www/serviam/.env
sudo systemctl restart serviam
```

certbot rewrites the vhost in place to add the 443 block and the redirect. Because the vhost
is a **symlink into the repo**, certbot's edits land in `deploy/nginx.conf` in the working
tree — commit them, or the next `git reset --hard` in CI will revert your TLS config.

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
