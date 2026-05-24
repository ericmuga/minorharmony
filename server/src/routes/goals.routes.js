import { Router } from 'express';
import { db } from '../db.js';
const r = Router();

// Domains + goals + bricks live together (one logical resource: "what I'm building toward")
//
// GET    /api/goals                     — domains with nested goals
// POST   /api/goals/domains             — add a domain { name, glyph?, is_foundation?, sort? }
// PATCH  /api/goals/domains/:id
// DELETE /api/goals/domains/:id         — cascades to goals
// POST   /api/goals/domains/:id/goals   — add a goal { title, why?, horizon? }
// PATCH  /api/goals/goals/:id           — edit a goal
// DELETE /api/goals/goals/:id
// GET    /api/goals/bricks?date=...     — today's bricks (default today)
// POST   /api/goals/bricks              — { title, date?, goal_id? }
// PATCH  /api/goals/bricks/:id          — toggle done or edit
// DELETE /api/goals/bricks/:id

const today = () => new Date().toISOString().slice(0, 10);

r.get('/', (req, res) => {
  const domains = db.prepare(
    `SELECT id, name, glyph, is_foundation, sort FROM domains
      WHERE user_id = ? ORDER BY is_foundation DESC, sort, id`
  ).all(req.user.id);
  const goals = db.prepare(
    `SELECT g.id, g.domain_id, g.title, g.why, g.horizon, g.status FROM goals g
       JOIN domains d ON d.id = g.domain_id
      WHERE d.user_id = ?
      ORDER BY g.id`
  ).all(req.user.id);
  const byDomain = new Map(domains.map(d => [d.id, { ...d, is_foundation: !!d.is_foundation, goals: [] }]));
  for (const g of goals) byDomain.get(g.domain_id)?.goals.push(g);
  res.json([...byDomain.values()]);
});

r.post('/domains', (req, res) => {
  const { name, glyph, is_foundation, sort } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name_required' });
  const info = db.prepare(
    `INSERT INTO domains (user_id, name, glyph, is_foundation, sort) VALUES (?,?,?,?,?)`
  ).run(req.user.id, name, glyph || null, is_foundation ? 1 : 0, sort || 0);
  res.json({ id: info.lastInsertRowid });
});

r.patch('/domains/:id', (req, res) => {
  const f = ['name', 'glyph', 'is_foundation', 'sort'];
  const sets = [], vals = [];
  for (const k of f) if (k in (req.body || {})) {
    sets.push(`${k} = ?`);
    vals.push(k === 'is_foundation' ? (req.body[k] ? 1 : 0) : req.body[k]);
  }
  if (sets.length) {
    vals.push(req.params.id, req.user.id);
    db.prepare(`UPDATE domains SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  }
  res.json({ ok: true });
});

r.delete('/domains/:id', (req, res) => {
  db.prepare('DELETE FROM domains WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// goals
r.post('/domains/:id/goals', (req, res) => {
  const domain = db.prepare('SELECT id FROM domains WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!domain) return res.status(404).json({ error: 'domain_not_found' });
  const { title, why, horizon } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title_required' });
  const info = db.prepare(
    `INSERT INTO goals (domain_id, title, why, horizon) VALUES (?,?,?,?)`
  ).run(domain.id, title, why || null, horizon || 'soon');
  res.json({ id: info.lastInsertRowid });
});

r.patch('/goals/:id', (req, res) => {
  // Verify ownership via join
  const owned = db.prepare(
    `SELECT g.id FROM goals g JOIN domains d ON d.id = g.domain_id
      WHERE g.id = ? AND d.user_id = ?`
  ).get(req.params.id, req.user.id);
  if (!owned) return res.status(404).json({ error: 'goal_not_found' });
  const f = ['title', 'why', 'horizon', 'status'];
  const sets = [], vals = [];
  for (const k of f) if (k in (req.body || {})) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
  if (sets.length) {
    vals.push(req.params.id);
    db.prepare(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json({ ok: true });
});

r.delete('/goals/:id', (req, res) => {
  // Only delete if owned
  db.prepare(
    `DELETE FROM goals WHERE id = ? AND domain_id IN (SELECT id FROM domains WHERE user_id = ?)`
  ).run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// bricks
r.get('/bricks', (req, res) => {
  const date = req.query.date || today();
  res.json(db.prepare(
    `SELECT id, goal_id, title, date, done FROM bricks
      WHERE user_id = ? AND (date = ? OR (date IS NULL AND ? = ?))
      ORDER BY done, id`
  ).all(req.user.id, date, date, today()));
});

r.post('/bricks', (req, res) => {
  const { title, date, goal_id } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title_required' });
  const info = db.prepare(
    `INSERT INTO bricks (user_id, goal_id, title, date, done) VALUES (?,?,?,?,0)`
  ).run(req.user.id, goal_id || null, title, date || today());
  res.json({ id: info.lastInsertRowid });
});

r.patch('/bricks/:id', (req, res) => {
  const f = ['title', 'date', 'done', 'goal_id'];
  const sets = [], vals = [];
  for (const k of f) if (k in (req.body || {})) {
    sets.push(`${k} = ?`);
    vals.push(k === 'done' ? (req.body[k] ? 1 : 0) : req.body[k]);
  }
  if (sets.length) {
    vals.push(req.params.id, req.user.id);
    db.prepare(`UPDATE bricks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  }
  res.json({ ok: true });
});

r.delete('/bricks/:id', (req, res) => {
  db.prepare('DELETE FROM bricks WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default r;
