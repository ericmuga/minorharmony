import { Router } from 'express';
import { db } from '../db.js';
const r = Router();

const today = () => new Date().toISOString().slice(0, 10);

r.get('/', (req, res) =>
  res.json(db.prepare(
    `SELECT id, name, role, last_contact, next_ask, notes FROM people
      WHERE user_id = ? ORDER BY id`
  ).all(req.user.id)));

r.post('/', (req, res) => {
  const { name, role, last_contact, next_ask, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name_required' });
  const info = db.prepare(
    `INSERT INTO people (user_id, name, role, last_contact, next_ask, notes)
     VALUES (?,?,?,?,?,?)`
  ).run(req.user.id, name, role || null, last_contact || null,
       next_ask || null, notes || null);
  res.json({ id: info.lastInsertRowid });
});

r.patch('/:id', (req, res) => {
  const f = ['name', 'role', 'last_contact', 'next_ask', 'notes'];
  const sets = [], vals = [];
  for (const k of f) if (k in (req.body || {})) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
  if (sets.length) {
    vals.push(req.params.id, req.user.id);
    db.prepare(`UPDATE people SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  }
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM people WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// POST /:id/contact  — bump last_contact to today (one-tap when you've reached out)
r.post('/:id/contact', (req, res) => {
  db.prepare('UPDATE people SET last_contact = ? WHERE id = ? AND user_id = ?')
    .run(today(), req.params.id, req.user.id);
  res.json({ ok: true, last_contact: today() });
});

export default r;
