# Deploying Serviam to your VPS

Assumes Ubuntu 22.04+, a domain, and root/sudo.

## 1. DNS
Point an A record `serviam.minorharmony.com` → your VPS IP. Wait for it to resolve.

## 2. Box prep
```bash
sudo apt update && sudo apt install -y nginx git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -   # Node 20 LTS
sudo apt install -y nodejs
```

## 3. Get the code
```bash
sudo mkdir -p /var/www/serviam && sudo chown -R $USER /var/www/serviam
git clone <YOUR_REPO_URL> /var/www/serviam
cd /var/www/serviam
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # paste into SESSION_SECRET
nano .env    # set SESSION_SECRET, SECURE_COOKIES=true, APP_ORIGIN
```

## 4. Build + install
```bash
cd /var/www/serviam/server && npm install
npm run create-user          # create YOUR login (and later wife/director, role spouse/director)
node -e "import('better-sqlite3')" >/dev/null 2>&1 || true   # native build sanity
cd ../web && npm install && npm run build     # outputs web/dist
sudo chown -R www-data:www-data /var/www/serviam
```

## 5. Service + nginx + TLS
```bash
sudo cp deploy/serviam.service deploy/serviam-sync.service deploy/serviam-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now serviam serviam-sync.timer

sudo cp deploy/nginx.conf /etc/nginx/sites-available/serviam
sudo ln -s /etc/nginx/sites-available/serviam /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d serviam.minorharmony.com    # auto-configures HTTPS + renewal
```
Open https://serviam.minorharmony.com and sign in. Install it to your phone via the browser's "Add to Home Screen" (it's a PWA).

## 6. Connect your two calendars (no OAuth needed for v1)
- **Google (Primehub):** Google Calendar → that calendar's *Settings* → *Integrate calendar* → copy the **Secret address in iCal format**.
- **Outlook (Farmers Choice):** Outlook → *Settings → Calendar → Shared calendars → Publish* → copy the **ICS** link. *If FCL's tenant has publishing disabled, that link won't appear* — then we add the Microsoft Graph provider (see hand-off below).
- Add each via the app (Sync calendars button calls `POST /api/calendars` — or add a small settings screen). The systemd timer refreshes both every 15 min.

---

# Hand-off prompts for Claude Code

Paste these one at a time once the repo is open in Claude Code:

1. **Settings screen for calendars:** "Add a `/settings` Vue view that lists external_calendars from `GET /api/calendars` and lets me add one (label, lane, color, paste iCal URL) via `POST /api/calendars`, and delete. Wire a 'Sync now' button to `POST /api/calendars/sync'."
2. **Finish Today + Goals:** "Port the Today (plan-of-life norms, bricks, nightly examen) and Goals (domains with Spirituality as foundation) screens from `serviam-life-os.html` into Vue views backed by new `/api/norms`, `/api/goals`, `/api/struggles`, `/api/examen` routes following the existing route pattern and schema."
3. **Convert capture → block:** "In the Planner, let me drag or click a capture-inbox item to pre-fill the Add-block form, then mark it processed via `POST /api/capture/:id/process`."
4. **Day templates:** "Add UI to save the current day's blocks as a day_template (workday/weekend/holiday) and an 'Apply template' button using `POST /api/planner/apply-template`."
5. **Microsoft Graph provider (only if Outlook iCal is blocked):** "Implement a `graph` provider in `services/calendarSync.js` using MS Graph delegated auth (device-code flow, store refresh token), normalising events to the same shape as the iCal provider."
6. **AI strategist endpoint:** "Add `POST /api/counsel` that calls the Anthropic API server-side with the user's goals + current struggles as context, plus a weekly job using web search for a 'trends in my field' digest."

## 7. Seed your activities + briefing topics (after create-user)
```bash
cd /var/www/serviam/server
npm run seed     # gym/swim/piano/hiking + the 5 briefing topics (all editable in-app later)
```

## 8. Daily briefing (current affairs, tech, finance, politics, on-this-day)
The briefing uses Claude server-side with web search.
- Add `ANTHROPIC_API_KEY` to `.env` (from console.anthropic.com). Optionally set `ANTHROPIC_MODEL`.
- Install the timer so it writes a fresh briefing each morning:
```bash
sudo cp deploy/serviam-digest.service deploy/serviam-digest.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now serviam-digest.timer
node src/scripts/run-digest.js     # generate one now to test
```
The Briefing tab reads the latest per topic; "Refresh" calls `POST /api/briefings/generate` on demand.

---

# Extra hand-off prompts for Claude Code

7. **Activities settings screen:** "Add a `/settings` section listing recurring_activities from `GET /api/activities` with add/edit/delete (title, lane, weekday picker for `dow`, start time, duration, offering). They auto-materialise onto the planner via the existing /day endpoint."
8. **Briefing preferences:** "Add UI backed by `GET /api/briefings/topics` to enable/disable topics, edit each topic's prompt, and toggle `use_web`."
9. **Strategist endpoint:** "Add `POST /api/counsel` using `lib/anthropic.js` (askClaude) with the user's goals + current struggles as context; surface it as a Counsel tab like the prototype."
