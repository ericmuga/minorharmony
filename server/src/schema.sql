-- Single-tenant-ish: a handful of trusted users.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',          -- owner | spouse | director
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                          -- random token (also the cookie value)
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- ---- Planner: the hourly timetable ----
CREATE TABLE IF NOT EXISTS time_blocks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,                           -- YYYY-MM-DD
  start_min INTEGER NOT NULL,                    -- minutes from midnight
  end_min INTEGER NOT NULL,
  title TEXT NOT NULL,
  lane TEXT NOT NULL DEFAULT 'personal',         -- primehub | farmerschoice | personal | prayer
  offering TEXT,                                 -- the morning offering applied to this work
  prayer_tag TEXT,                               -- e.g. "for patience" / a mortification
  brick_id INTEGER REFERENCES bricks(id) ON DELETE SET NULL,
  activity_id INTEGER REFERENCES recurring_activities(id) ON DELETE SET NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_blocks_user_date ON time_blocks(user_id, date);

-- Reusable plans for a kind of day (so weekends/holidays get planned too).
CREATE TABLE IF NOT EXISTS day_templates (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  day_type TEXT NOT NULL DEFAULT 'workday',      -- workday | weekend | holiday
  blocks_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS holidays (
  date TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'KE'
);

-- ---- External calendars (Google / Outlook) pulled as iCal feeds ----
CREATE TABLE IF NOT EXISTS external_calendars (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,                           -- "Primehub (Google)", "Farmers Choice (Outlook)"
  lane TEXT NOT NULL DEFAULT 'personal',         -- maps events to a planner lane/colour
  provider TEXT NOT NULL DEFAULT 'ical',         -- ical | google | graph (future)
  ics_url TEXT,                                  -- secret iCal feed URL
  color TEXT NOT NULL DEFAULT '#742a2a',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS external_events (
  id INTEGER PRIMARY KEY,
  calendar_id INTEGER NOT NULL REFERENCES external_calendars(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  title TEXT,
  start_utc TEXT NOT NULL,
  end_utc TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  UNIQUE(calendar_id, uid, start_utc)
);
CREATE INDEX IF NOT EXISTS idx_ext_events_start ON external_events(start_utc);

-- ---- Capture: catch everything so nothing is forgotten ----
CREATE TABLE IF NOT EXISTS capture_inbox (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Foundation: domains, goals, bricks (Claude Code to flesh out endpoints) ----
CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  glyph TEXT,
  is_foundation INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY,
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  why TEXT,
  horizon TEXT DEFAULT 'soon',                   -- now | soon | horizon
  status TEXT DEFAULT 'open'
);
CREATE TABLE IF NOT EXISTS bricks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  date TEXT,
  done INTEGER NOT NULL DEFAULT 0
);

-- ---- Plan of life + the struggle + examen + people + library ----
CREATE TABLE IF NOT EXISTS norms (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, sub TEXT, cadence TEXT NOT NULL DEFAULT 'daily', sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS norm_log (
  user_id INTEGER NOT NULL, norm_id INTEGER NOT NULL, date TEXT NOT NULL,
  PRIMARY KEY (norm_id, date)
);
CREATE TABLE IF NOT EXISTS struggles (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL, note TEXT
);
CREATE TABLE IF NOT EXISTS struggle_log (
  struggle_id INTEGER NOT NULL, date TEXT NOT NULL, result TEXT NOT NULL, -- kept | fell
  PRIMARY KEY (struggle_id, date)
);
CREATE TABLE IF NOT EXISTS examen (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, date TEXT NOT NULL,
  gratitude TEXT, struggle TEXT, resolution TEXT, UNIQUE(user_id, date)
);
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL,
  role TEXT, last_contact TEXT, next_ask TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS library (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL,
  author TEXT, tag TEXT, state TEXT DEFAULT 'to read'
);

-- ---- Recurring activities (gym, swimming, piano, hiking…) ----
-- dow = comma list of weekdays, 0=Sun .. 6=Sat (e.g. "1,3,5"). Materialised onto the day grid.
CREATE TABLE IF NOT EXISTS recurring_activities (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  lane TEXT NOT NULL DEFAULT 'wellbeing',        -- wellbeing | formation | personal | prayer ...
  dow TEXT NOT NULL DEFAULT '1,2,3,4,5',
  start_min INTEGER NOT NULL,
  dur_min INTEGER NOT NULL DEFAULT 60,
  offering TEXT,
  prayer_tag TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

-- ---- Daily briefing: current affairs, history, tech, finance, a bit of politics ----
CREATE TABLE IF NOT EXISTS briefing_topics (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,                           -- key, e.g. 'tech'
  label TEXT NOT NULL,                           -- display, e.g. 'Technology'
  prompt TEXT NOT NULL,                          -- what to brief on
  use_web INTEGER NOT NULL DEFAULT 1,            -- use live web search?
  enabled INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS briefings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  date TEXT NOT NULL,                            -- YYYY-MM-DD
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, topic, date)
);
CREATE INDEX IF NOT EXISTS idx_briefings_user_date ON briefings(user_id, date);
