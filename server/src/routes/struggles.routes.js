import { Router } from 'express';
import { db } from '../db.js';
const r = Router();

// The particular examen: one battle at a time. Each struggle has a daily
// "kept" / "fell" log. Streaks are computed from consecutive 'kept' days.

const today = () => new Date().toISOString().slice(0, 10);

function streakOf(struggleId) {
  const rows = db.prepare(
    `SELECT date, result FROM struggle_log WHERE struggle_id = ? ORDER BY date DESC`
  ).all(struggleId);
  const kept = new Set(rows.filter(x => x.result === 'kept').map(x => x.date));
  const fell = new Set(rows.filter(x => x.result === 'fell').map(x => x.date));
  const t = today();
  let s = 0;
  const d = new Date();
  for (let i = 0; i < 400; i++) {
    const k = d.toISOString().slice(0, 10);
    if (kept.has(k)) s++;
    else if (k === t && !fell.has(k)) { d.setDate(d.getDate() - 1); continue; }
    else break;
    d.setDate(d.getDate() - 1);
  }
  return s;
}

function todayResult(struggleId) {
  const row = db.prepare(
    `SELECT result FROM struggle_log WHERE struggle_id = ? AND date = ?`
  ).get(struggleId, today());
  return row?.result || null;
}

r.get('/', (req, res) => {
  const list = db.prepare(
    `SELECT id, title, note FROM struggles WHERE user_id = ? ORDER BY id`
  ).all(req.user.id);
  res.json(list.map(s => ({
    ...s,
    streak: streakOf(s.id),
    today: todayResult(s.id),
  })));
});

r.post('/', (req, res) => {
  const { title, note } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title_required' });
  const info = db.prepare(
    `INSERT INTO struggles (user_id, title, note) VALUES (?,?,?)`
  ).run(req.user.id, title, note || null);
  res.json({ id: info.lastInsertRowid });
});

r.patch('/:id', (req, res) => {
  const f = ['title', 'note'];
  const sets = [], vals = [];
  for (const k of f) if (k in (req.body || {})) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
  if (sets.length) {
    vals.push(req.params.id, req.user.id);
    db.prepare(`UPDATE struggles SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  }
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM struggle_log WHERE struggle_id = ?').run(req.params.id);
  db.prepare('DELETE FROM struggles WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// POST /:id/log  { result: 'kept' | 'fell', date? }   — upserts (one entry per day)
r.post('/:id/log', (req, res) => {
  const { result, date } = req.body || {};
  if (!['kept', 'fell'].includes(result)) return res.status(400).json({ error: 'bad_result' });
  // verify ownership
  const owned = db.prepare('SELECT id FROM struggles WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!owned) return res.status(404).json({ error: 'not_found' });
  const d = date || today();
  db.prepare(`
    INSERT INTO struggle_log (struggle_id, date, result) VALUES (?,?,?)
    ON CONFLICT(struggle_id, date) DO UPDATE SET result = excluded.result
  `).run(req.params.id, d, result);
  res.json({ ok: true, date: d, result, streak: streakOf(req.params.id) });
});

export default r;
