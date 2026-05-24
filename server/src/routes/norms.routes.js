import { Router } from 'express';
import { db } from '../db.js';
const r = Router();

// ---- norms (the plan of life) ----
// GET /api/norms                       — all norms, sorted by cadence then sort
// GET /api/norms/log?date=YYYY-MM-DD   — which norms were marked done on a given date
// POST /api/norms                      — add a norm
// PATCH /api/norms/:id                 — edit
// DELETE /api/norms/:id                — remove
// POST /api/norms/:id/log              — toggle done for { date } (defaults to today)

const today = () => new Date().toISOString().slice(0, 10);

r.get('/', (req, res) =>
  res.json(db.prepare(
    `SELECT id, name, sub, cadence, sort FROM norms
      WHERE user_id = ?
      ORDER BY CASE cadence WHEN 'daily' THEN 0 WHEN 'weekly' THEN 1 WHEN 'monthly' THEN 2 ELSE 3 END, sort, id`
  ).all(req.user.id)));

r.get('/log', (req, res) => {
  const date = req.query.date || today();
  const rows = db.prepare(
    `SELECT norm_id FROM norm_log WHERE user_id = ? AND date = ?`
  ).all(req.user.id, date);
  res.json({ date, done: rows.map(x => x.norm_id) });
});

r.post('/', (req, res) => {
  const { name, sub, cadence, sort } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name_required' });
  const info = db.prepare(
    `INSERT INTO norms (user_id, name, sub, cadence, sort) VALUES (?,?,?,?,?)`
  ).run(req.user.id, name, sub || null, cadence || 'daily', sort || 0);
  res.json({ id: info.lastInsertRowid });
});

r.patch('/:id', (req, res) => {
  const f = ['name', 'sub', 'cadence', 'sort'];
  const sets = [], vals = [];
  for (const k of f) if (k in (req.body || {})) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
  if (sets.length) {
    vals.push(req.params.id, req.user.id);
    db.prepare(`UPDATE norms SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  }
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM norm_log WHERE norm_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  db.prepare('DELETE FROM norms WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

r.post('/:id/log', (req, res) => {
  const date = (req.body && req.body.date) || today();
  const exists = db.prepare(
    'SELECT 1 FROM norm_log WHERE user_id = ? AND norm_id = ? AND date = ?'
  ).get(req.user.id, req.params.id, date);
  if (exists) {
    db.prepare('DELETE FROM norm_log WHERE user_id = ? AND norm_id = ? AND date = ?')
      .run(req.user.id, req.params.id, date);
    res.json({ done: false });
  } else {
    db.prepare('INSERT INTO norm_log (user_id, norm_id, date) VALUES (?,?,?)')
      .run(req.user.id, req.params.id, date);
    res.json({ done: true });
  }
});

// streak across the last N days (default 400) for the daily-norm "kept all" rule.
// Returns { streak, history: { 'YYYY-MM-DD': [normId, ...] } } for the window.
r.get('/history', (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 400, 1000);
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const rows = db.prepare(
    `SELECT date, norm_id FROM norm_log WHERE user_id = ? AND date >= ?`
  ).all(req.user.id, since);
  const history = {};
  for (const row of rows) (history[row.date] ||= []).push(row.norm_id);
  res.json({ history });
});

export default r;
