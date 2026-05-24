import { Router } from 'express';
import { db } from '../db.js';
const r = Router();

// GET /api/examen?date=YYYY-MM-DD   — fetch the day's examen (or null)
// PUT /api/examen                    — upsert today's examen { date?, gratitude, struggle, resolution }
// GET /api/examen/recent?limit=10    — recent days

const today = () => new Date().toISOString().slice(0, 10);

r.get('/', (req, res) => {
  const date = req.query.date || today();
  const row = db.prepare(
    'SELECT id, date, gratitude, struggle, resolution FROM examen WHERE user_id = ? AND date = ?'
  ).get(req.user.id, date);
  res.json(row || { date, gratitude: '', struggle: '', resolution: '' });
});

r.put('/', (req, res) => {
  const { date, gratitude, struggle, resolution } = req.body || {};
  const d = date || today();
  db.prepare(`
    INSERT INTO examen (user_id, date, gratitude, struggle, resolution) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id, date) DO UPDATE SET gratitude=excluded.gratitude,
      struggle=excluded.struggle, resolution=excluded.resolution
  `).run(req.user.id, d, gratitude || '', struggle || '', resolution || '');
  res.json({ ok: true, date: d });
});

r.get('/recent', (req, res) => {
  const lim = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  res.json(db.prepare(
    `SELECT date, gratitude, struggle, resolution FROM examen
      WHERE user_id = ? ORDER BY date DESC LIMIT ?`
  ).all(req.user.id, lim));
});

export default r;
