import { Router } from 'express';
import { db } from '../db.js';
const r = Router();

// Aggregated day view: internal time blocks + external events + day type + holiday.
// This is the single screen that means "nothing gets forgotten".
r.get('/day', (req, res) => {
  const date = req.query.date;                          // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'bad_date' });

  const dayStart = new Date(date + 'T00:00:00');
  const dayEnd = new Date(date + 'T23:59:59');
  const dow = dayStart.getDay();                         // 0 Sun .. 6 Sat

  // Materialise recurring activities (gym, swim, piano, hiking…) for this weekday.
  // Idempotent: only inserts an activity once per date, then it behaves like a normal block.
  const acts = db.prepare('SELECT * FROM recurring_activities WHERE user_id = ? AND active = 1').all(req.user.id);
  const matAct = db.prepare(
    `INSERT INTO time_blocks (user_id,date,start_min,end_min,title,lane,offering,prayer_tag,activity_id)
     SELECT @u,@d,@s,@e,@t,@l,@o,@p,@a
      WHERE NOT EXISTS (SELECT 1 FROM time_blocks WHERE user_id=@u AND date=@d AND activity_id=@a)`);
  const tx = db.transaction(() => {
    for (const a of acts) {
      if (!String(a.dow).split(',').includes(String(dow))) continue;
      matAct.run({ u: req.user.id, d: date, s: a.start_min, e: a.start_min + a.dur_min,
        t: a.title, l: a.lane, o: a.offering, p: a.prayer_tag, a: a.id });
    }
  });
  tx();

  const blocks = db.prepare(
    `SELECT * FROM time_blocks
      WHERE user_id = ? AND date = ? AND dismissed = 0
      ORDER BY start_min`).all(req.user.id, date);

  // External events whose start falls on this date (compared in local server time).
  const events = db.prepare(
    `SELECT e.*, c.label, c.lane, c.color
       FROM external_events e JOIN external_calendars c ON c.id = e.calendar_id
      WHERE c.user_id = ? AND c.enabled = 1
        AND e.start_utc BETWEEN ? AND ?
      ORDER BY e.start_utc`).all(req.user.id, dayStart.toISOString(), dayEnd.toISOString());

  const holiday = db.prepare('SELECT name FROM holidays WHERE date = ?').get(date);
  const day_type = holiday ? 'holiday' : (dow === 0 || dow === 6) ? 'weekend' : 'workday';

  res.json({ date, day_type, holiday: holiday?.name || null, blocks, events });
});

r.post('/blocks', (req, res) => {
  const b = req.body || {};
  if (!b.date || b.start_min == null || b.end_min == null || !b.title)
    return res.status(400).json({ error: 'missing_fields' });
  const info = db.prepare(
    `INSERT INTO time_blocks (user_id,date,start_min,end_min,title,lane,offering,prayer_tag,brick_id)
     VALUES (?,?,?,?,?,?,?,?,?)`).run(
      req.user.id, b.date, b.start_min, b.end_min, b.title,
      b.lane || 'personal', b.offering || null, b.prayer_tag || null, b.brick_id || null);
  res.json({ id: info.lastInsertRowid });
});

r.patch('/blocks/:id', (req, res) => {
  const fields = ['title','start_min','end_min','lane','offering','prayer_tag','done'];
  const sets = [], vals = [];
  for (const f of fields) if (f in (req.body || {})) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
  if (!sets.length) return res.json({ ok: true });
  vals.push(req.params.id, req.user.id);
  db.prepare(`UPDATE time_blocks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  res.json({ ok: true });
});

r.delete('/blocks/:id', (req, res) => {
  // A block materialised from a recurring activity must be tombstoned, not deleted:
  // GET /day re-inserts any activity that has no row for the date, so a hard delete
  // comes straight back on the next load and the × looks broken. Hand-made blocks
  // (activity_id IS NULL) are nothing to re-create, so those really are deleted.
  const row = db.prepare('SELECT activity_id FROM time_blocks WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  if (row.activity_id == null) {
    db.prepare('DELETE FROM time_blocks WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  } else {
    db.prepare('UPDATE time_blocks SET dismissed = 1 WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);
  }
  res.json({ ok: true });
});

// ---- One-tap blocks -------------------------------------------------------
// The fixed points of the day. Deliberately not auto-materialised the way
// recurring_activities are: you tap to place them, so a day you never planned
// doesn't fill up with norms you didn't actually keep.

const LANES = ['primehub','farmerschoice','personal','prayer','wellbeing','formation'];

// What a Christian working day is usually pegged to. Offered as a starting
// point rather than seeded, so an existing install can take them or not.
// `sort` mirrors start_min here, matching what the UI sets when you add your
// own — otherwise the two orderings interleave badly and a preset you added
// jumps above the whole classic set.
const DEFAULT_PRESETS = [
  { title: 'Heroic minute',            lane: 'prayer',   start_min: 5*60,      dur_min: 5,  daily: 1,
    prayer_tag: 'Up at once, no negotiating with the alarm' },
  { title: 'Morning offering',         lane: 'prayer',   start_min: 5*60+10,   dur_min: 10, daily: 1 },
  { title: 'Mental prayer',            lane: 'prayer',   start_min: 6*60,      dur_min: 30, daily: 1 },
  { title: 'Holy Mass',                lane: 'prayer',   start_min: 6*60+30,   dur_min: 45, daily: 0 },
  { title: 'Angelus',                  lane: 'prayer',   start_min: 12*60,     dur_min: 5,  daily: 1 },
  { title: 'Lunch',                    lane: 'personal', start_min: 13*60,     dur_min: 45, daily: 1 },
  { title: 'Visit to the Blessed Sacrament', lane: 'prayer', start_min: 18*60, dur_min: 15, daily: 0 },
  { title: 'Examen',                   lane: 'prayer',   start_min: 21*60+30,  dur_min: 10, daily: 1 },
].map(p => ({ ...p, sort: p.start_min }));

function cleanPreset(b) {
  const start = Number(b?.start_min);
  const dur = Number(b?.dur_min);
  return {
    title: String(b?.title || '').trim(),
    lane: LANES.includes(b?.lane) ? b.lane : 'prayer',
    start_min: Number.isFinite(start) ? Math.max(0, Math.min(24*60 - 1, Math.round(start))) : null,
    dur_min: Number.isFinite(dur) ? Math.max(5, Math.min(12*60, Math.round(dur))) : 15,
    offering: (b?.offering || '').trim() || null,
    prayer_tag: (b?.prayer_tag || '').trim() || null,
    daily: b?.daily ? 1 : 0,
    sort: Number.isFinite(Number(b?.sort)) ? Number(b.sort) : 0,
  };
}

r.get('/presets', (req, res) =>
  res.json(db.prepare(
    'SELECT * FROM block_presets WHERE user_id = ? ORDER BY sort, start_min').all(req.user.id)));

r.post('/presets', (req, res) => {
  const p = cleanPreset(req.body);
  if (!p.title) return res.status(400).json({ error: 'title_required' });
  if (p.start_min == null) return res.status(400).json({ error: 'start_required' });
  const info = db.prepare(
    `INSERT INTO block_presets (user_id,title,lane,start_min,dur_min,offering,prayer_tag,daily,sort)
     VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(req.user.id, p.title, p.lane, p.start_min, p.dur_min, p.offering, p.prayer_tag, p.daily, p.sort);
  res.json({ id: info.lastInsertRowid, ...p });
});

r.patch('/presets/:id', (req, res) => {
  const fields = ['title','lane','start_min','dur_min','offering','prayer_tag','daily','sort'];
  const p = cleanPreset({ ...db.prepare('SELECT * FROM block_presets WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id), ...req.body });
  if (!p.title) return res.status(400).json({ error: 'title_required' });
  db.prepare(`UPDATE block_presets SET ${fields.map(f => `${f} = ?`).join(', ')}
              WHERE id = ? AND user_id = ?`)
    .run(...fields.map(f => p[f]), req.params.id, req.user.id);
  res.json({ ok: true });
});

r.delete('/presets/:id', (req, res) => {
  db.prepare('DELETE FROM block_presets WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// Offer the classic set. Skips any title the user already has, so pressing it
// twice doesn't duplicate and it can be used to top up after adding one by hand.
r.post('/presets/defaults', (req, res) => {
  const have = new Set(db.prepare('SELECT title FROM block_presets WHERE user_id = ?')
    .all(req.user.id).map(r0 => r0.title.toLowerCase()));
  const ins = db.prepare(
    `INSERT INTO block_presets (user_id,title,lane,start_min,dur_min,offering,prayer_tag,daily,sort)
     VALUES (?,?,?,?,?,?,?,?,?)`);
  let added = 0;
  db.transaction(() => {
    for (const d of DEFAULT_PRESETS) {
      if (have.has(d.title.toLowerCase())) continue;
      const p = cleanPreset(d);
      ins.run(req.user.id, p.title, p.lane, p.start_min, p.dur_min, p.offering, p.prayer_tag, p.daily, p.sort);
      added++;
    }
  })();
  res.json({ ok: true, added });
});

// Place presets onto a date. With no ids, places everything marked `daily`.
// Skipping a preset already on the day makes this safe to tap twice — the
// common case is topping up a day you half-planned this morning.
r.post('/presets/apply', (req, res) => {
  const { date, ids } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'bad_date' });

  const chosen = Array.isArray(ids) && ids.length
    ? db.prepare(`SELECT * FROM block_presets
                   WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
        .all(req.user.id, ...ids)
    : db.prepare('SELECT * FROM block_presets WHERE user_id = ? AND daily = 1 ORDER BY sort, start_min')
        .all(req.user.id);

  const exists = db.prepare(
    `SELECT 1 FROM time_blocks
      WHERE user_id = ? AND date = ? AND title = ? AND start_min = ? AND dismissed = 0`);
  const ins = db.prepare(
    `INSERT INTO time_blocks (user_id,date,start_min,end_min,title,lane,offering,prayer_tag)
     VALUES (?,?,?,?,?,?,?,?)`);

  let added = 0, skipped = 0;
  db.transaction(() => {
    for (const p of chosen) {
      if (exists.get(req.user.id, date, p.title, p.start_min)) { skipped++; continue; }
      ins.run(req.user.id, date, p.start_min, p.start_min + p.dur_min,
              p.title, p.lane, p.offering, p.prayer_tag);
      added++;
    }
  })();
  res.json({ ok: true, added, skipped });
});

// Apply a saved day-template's blocks onto a date.
r.post('/apply-template', (req, res) => {
  const { date, template_id } = req.body || {};
  const t = db.prepare('SELECT * FROM day_templates WHERE id = ? AND user_id = ?').get(template_id, req.user.id);
  if (!t || !date) return res.status(400).json({ error: 'bad_request' });
  const blocks = JSON.parse(t.blocks_json || '[]');
  const ins = db.prepare(
    `INSERT INTO time_blocks (user_id,date,start_min,end_min,title,lane,offering,prayer_tag)
     VALUES (?,?,?,?,?,?,?,?)`);
  const tx = db.transaction(() => {
    for (const bl of blocks)
      ins.run(req.user.id, date, bl.start_min, bl.end_min, bl.title, bl.lane||'personal', bl.offering||null, bl.prayer_tag||null);
  });
  tx();
  res.json({ ok: true, added: blocks.length });
});

export default r;
