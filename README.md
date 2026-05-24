# Serviam — Plan of Life & Life OS

A private, single-tenant life-OS for Eric (and later wife + spiritual director).
Spirituality is the foundation; work, family, finance and study are spheres of one life.

**Stack:** Vue 3 + Vite (PWA) · Node + Express · SQLite (better-sqlite3) · bcrypt + httpOnly session cookie.
No public signup — users are created on the server with a CLI script.

## What's already wired
- **Auth done properly**: hashed passwords, httpOnly/Secure/SameSite session cookie, login rate-limit, `requireAuth` on every API route. Create users with `npm run create-user`.
- **Hourly Day Planner** for *any* date (weekday / weekend / holiday), with time blocks that carry a **work item**, a **lane** (Primehub / Farmers Choice / personal), and an **offering** (prayer or mortification — the morning offering applied to that block).
- **Two-calendar overlay**: pulls Google + Outlook **secret iCal feeds** server-side and shows their events read-only on the planner. Provider is abstracted so Google API / MS Graph can be added later without a rewrite.
- **Capture inbox**: quick brain-dump so nothing is forgotten; convert items into scheduled blocks.
- **Recurring activities** (gym, swimming, piano, hiking) auto-materialise onto the planner on the right weekdays — weekends included.
- **Daily briefing**: a server-side Claude job (with web search) writes a short briefing on current affairs, tech, finance, politics and on-this-day history.
- **Schema** for domains, goals, bricks, norms, the particular-examen struggle log, nightly examen, people, library — ready for Claude Code to flesh out.

## Run locally
```bash
cd server && npm install && npm run create-user   # make your login
npm run dev                                        # API on :8787
# new terminal
cd ../web && npm install && npm run dev            # Vite on :5173 (proxies /api -> :8787)
```

## Deploy to your VPS
See `deploy/DEPLOY.md` — DNS, nginx, certbot TLS, systemd service, and the build/run steps.

## Hand-off to Claude Code
See the bottom of `deploy/DEPLOY.md` for ready-to-paste prompts to extend each stubbed area.
