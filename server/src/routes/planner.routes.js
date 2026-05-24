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
    'SELECT * FROM time_blocks WHERE user_id = ? AND date = ? ORDER BY start_min').all(req.user.id, date);

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
  db.prepare('DELETE FROM time_blocks WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
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
