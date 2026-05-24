import { Router } from 'express';
import { db } from '../db.js';
const r = Router();

const STATES = ['to read', 'reading', 'done'];

r.get('/', (req, res) =>
  res.json(db.prepare(
    `SELECT id, title, author, tag, state FROM library WHERE user_id = ? ORDER BY id`
  ).all(req.user.id)));

r.post('/', (req, res) => {
  const { title, author, tag, state } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title_required' });
  const info = db.prepare(
    `INSERT INTO library (user_id, title, author, tag, state) VALUES (?,?,?,?,?)`
  ).run(req.user.id, title, author || null, tag || null,
       STATES.includes(state) ? state : 'to read');
  res.json({ id: info.lastInsertRowid });
});

r.patch('/:id', (req, res) => {
  const f = ['title', 'author', 'tag', 'state'];
  const sets = [], vals = [];
  for (const k of f) if (k in (req.body || {})) {
    if (k === 'state' && !STATES.includes(req.body[k])) continue;
    sets.push(`${k} = ?`); vals.push(req.body[k]);
  }
  if (sets.length) {
    vals.push(req.params.id, req.user.id);
    db.prepare(`UPDATE library SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  }
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM library WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// convenience: POST /api/library/:id/cycle  — to-read → reading → done → to-read
r.post('/:id/cycle', (req, res) => {
  const row = db.prepare('SELECT state FROM library WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const next = STATES[(STATES.indexOf(row.state) + 1) % STATES.length] || 'to read';
  db.prepare('UPDATE library SET state = ? WHERE id = ? AND user_id = ?')
    .run(next, req.params.id, req.user.id);
  res.json({ state: next });
});

export default r;
