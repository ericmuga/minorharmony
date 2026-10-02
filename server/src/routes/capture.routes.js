import { Router } from 'express';
import { db } from '../db.js';
import { askClaude } from '../lib/anthropic.js';
const r = Router();

const LANES = ['primehub', 'farmerschoice', 'personal', 'prayer', 'wellbeing', 'formation'];
const HORIZONS = ['now', 'soon', 'horizon'];

function clampMinute(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(5 * 60, Math.min(23 * 60, Math.round(v / 5) * 5));
}

function pickJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) return JSON.parse(raw.slice(first, last + 1));
  throw new Error('claude_returned_non_json');
}

function cleanPlan(data, domains) {
  const domainIds = new Set(domains.map(d => d.id));
  const tasks = Array.isArray(data?.tasks) ? data.tasks.slice(0, 10).map((t) => {
    const start = clampMinute(t.start_min, 9 * 60);
    const dur = Math.max(10, Math.min(240, Number(t.dur_min) || 45));
    return {
      title: String(t.title || '').trim().slice(0, 120),
      start_min: start,
      end_min: Math.min(23 * 60 + 59, start + dur),
      lane: LANES.includes(t.lane) ? t.lane : 'personal',
      offering: String(t.offering || '').trim().slice(0, 180) || null,
      prayer_tag: String(t.prayer_tag || '').trim().slice(0, 120) || null,
      source_capture_ids: Array.isArray(t.source_capture_ids) ? t.source_capture_ids.map(Number).filter(Boolean) : [],
    };
  }).filter(t => t.title && t.end_min > t.start_min) : [];

  const goals = Array.isArray(data?.goals) ? data.goals.slice(0, 8).map((g) => ({
    title: String(g.title || '').trim().slice(0, 140),
    why: String(g.why || '').trim().slice(0, 300) || null,
    domain_id: domainIds.has(Number(g.domain_id)) ? Number(g.domain_id) : null,
    horizon: HORIZONS.includes(g.horizon) ? g.horizon : 'soon',
    source_capture_ids: Array.isArray(g.source_capture_ids) ? g.source_capture_ids.map(Number).filter(Boolean) : [],
  })).filter(g => g.title && g.domain_id) : [];

  const notes = Array.isArray(data?.notes) ? data.notes.slice(0, 6).map(n => String(n).trim()).filter(Boolean) : [];
  return { tasks, goals, notes };
}

r.get('/', (req, res) =>
  res.json(db.prepare('SELECT * FROM capture_inbox WHERE user_id = ? AND processed = 0 ORDER BY created_at DESC').all(req.user.id)));

r.post('/', (req, res) => {
  const text = (req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text_required' });
  const info = db.prepare('INSERT INTO capture_inbox (user_id, text) VALUES (?,?)').run(req.user.id, text);
  res.json({ id: info.lastInsertRowid });
});

r.post('/:id/process', (req, res) => {
  db.prepare('UPDATE capture_inbox SET processed = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

r.post('/synthesize', async (req, res) => {
  const date = req.body?.date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'bad_date' });

  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  const rows = ids.length
    ? db.prepare(`SELECT id, text, created_at FROM capture_inbox
                   WHERE user_id = ? AND processed = 0 AND id IN (${ids.map(() => '?').join(',')})
                   ORDER BY created_at`).all(req.user.id, ...ids)
    : db.prepare(`SELECT id, text, created_at FROM capture_inbox
                   WHERE user_id = ? AND processed = 0 ORDER BY created_at`).all(req.user.id);
  if (!rows.length) return res.status(400).json({ error: 'nothing_to_synthesize' });

  const domains = db.prepare(
    `SELECT id, name, is_foundation FROM domains WHERE user_id = ? ORDER BY is_foundation DESC, sort, id`
  ).all(req.user.id);
  const goals = db.prepare(
    `SELECT g.id, g.domain_id, d.name AS domain, g.title, g.horizon, g.status
       FROM goals g JOIN domains d ON d.id = g.domain_id
      WHERE d.user_id = ? AND g.status = 'open'
      ORDER BY d.sort, g.id`
  ).all(req.user.id);
  const blocks = db.prepare(
    `SELECT title, lane, start_min, end_min FROM time_blocks
      WHERE user_id = ? AND date = ? AND dismissed = 0 ORDER BY start_min`
  ).all(req.user.id, date);
  const events = db.prepare(
    `SELECT e.title, e.start_utc, e.end_utc, c.label, c.lane
       FROM external_events e JOIN external_calendars c ON c.id = e.calendar_id
      WHERE c.user_id = ? AND c.enabled = 1
        AND e.start_utc BETWEEN ? AND ?
      ORDER BY e.start_utc`
  ).all(req.user.id, new Date(date + 'T00:00:00').toISOString(), new Date(date + 'T23:59:59').toISOString());

  const system = `You convert a trusted user's raw brain dump into a practical Serviam plan.
Return only strict JSON. No markdown. No commentary.
Respect unity of life: faith, family, social, professional work, and growth are connected.
Do not invent personal facts. Keep proposals modest enough to actually fit a day.`;
  const prompt = `Target date: ${date}

Allowed lanes: ${LANES.join(', ')}
Allowed goal horizons: ${HORIZONS.join(', ')}

Domains JSON:
${JSON.stringify(domains)}

Existing open goals JSON:
${JSON.stringify(goals)}

Existing Serviam blocks for target date JSON:
${JSON.stringify(blocks)}

External calendar events JSON:
${JSON.stringify(events)}

Brain dump items JSON:
${JSON.stringify(rows)}

Return this exact JSON shape:
{
  "tasks": [
    {
      "title": "concrete action",
      "start_min": 540,
      "dur_min": 45,
      "lane": "personal",
      "offering": "optional intention",
      "prayer_tag": "optional virtue or mortification",
      "source_capture_ids": [1]
    }
  ],
  "goals": [
    {
      "title": "goal title",
      "why": "brief reason",
      "domain_id": 1,
      "horizon": "soon",
      "source_capture_ids": [1]
    }
  ],
  "notes": ["brief clarification or risk"]
}

Rules:
- Propose time blocks only where they appear to fit around existing blocks/events.
- If something is bigger than one day, make it a goal, not a huge task.
- Prefer 30-90 minute tasks.
- Use the supplied domain_id for goals.
- If no domain fits, omit the goal instead of inventing a domain.`;

  try {
    const text = await askClaude({ system, prompt, maxTokens: 1200 });
    res.json(cleanPlan(pickJson(text), domains));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
