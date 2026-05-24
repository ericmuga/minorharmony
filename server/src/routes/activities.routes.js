import { Router } from 'express';
import { db } from '../db.js';
const r = Router();

r.get('/', (req, res) =>
  res.json(db.prepare('SELECT * FROM recurring_activities WHERE user_id = ? ORDER BY start_min').all(req.user.id)));

r.post('/', (req, res) => {
  const a = req.body || {};
  if (!a.title || a.start_min == null) return res.status(400).json({ error: 'missing_fields' });
  const info = db.prepare(
    `INSERT INTO recurring_activities (user_id,title,lane,dow,start_min,dur_min,offering,prayer_tag)
     VALUES (?,?,?,?,?,?,?,?)`).run(
      req.user.id, a.title, a.lane || 'wellbeing', a.dow || '1,2,3,4,5',
      a.start_min, a.dur_min || 60, a.offering || null, a.prayer_tag || null);
  res.json({ id: info.lastInsertRowid });
});

r.patch('/:id', (req, res) => {
  const f = ['title','lane','dow','start_min','dur_min','offering','prayer_tag','active'];
  const sets = [], vals = [];
  for (const k of f) if (k in (req.body || {})) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
  if (sets.length) { vals.push(req.params.id, req.user.id);
    db.prepare(`UPDATE recurring_activities SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals); }
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM recurring_activities WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default r;
