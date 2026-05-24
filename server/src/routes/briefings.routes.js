import { Router } from 'express';
import { db } from '../db.js';
import { runDigest } from '../services/digest.js';
const r = Router();

// Latest briefing per topic (defaults to today, falls back to the most recent).
r.get('/', (req, res) => {
  const topics = db.prepare('SELECT * FROM briefing_topics WHERE user_id = ? AND enabled = 1 ORDER BY sort').all(req.user.id);
  const latest = db.prepare(
    'SELECT * FROM briefings WHERE user_id = ? AND topic = ? ORDER BY date DESC LIMIT 1');
  res.json(topics.map(t => ({ topic: t.topic, label: t.label, briefing: latest.get(req.user.id, t.topic) || null })));
});

r.get('/topics', (req, res) =>
  res.json(db.prepare('SELECT * FROM briefing_topics WHERE user_id = ? ORDER BY sort').all(req.user.id)));

r.post('/generate', async (req, res) => {
  const results = await runDigest({ date: req.body?.date });
  res.json({ results });
});

export default r;
