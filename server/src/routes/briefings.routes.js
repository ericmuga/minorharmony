import { Router } from 'express';
import { db } from '../db.js';
import { ensureBriefingTopics, runDigest } from '../services/digest.js';
const r = Router();

// Latest briefing per topic (defaults to today, falls back to the most recent).
r.get('/', (req, res) => {
  ensureBriefingTopics(req.user.id);
  const topics = db.prepare('SELECT * FROM briefing_topics WHERE user_id = ? AND enabled = 1 ORDER BY sort').all(req.user.id);
  const latest = db.prepare(
    'SELECT * FROM briefings WHERE user_id = ? AND topic = ? ORDER BY date DESC LIMIT 1');
  res.json(topics.map(t => ({ topic: t.topic, label: t.label, briefing: latest.get(req.user.id, t.topic) || null })));
});

r.get('/topics', (req, res) =>
  {
    ensureBriefingTopics(req.user.id);
    res.json(db.prepare('SELECT * FROM briefing_topics WHERE user_id = ? ORDER BY sort').all(req.user.id));
  });

r.post('/generate', async (req, res) => {
  const results = await runDigest({ date: req.body?.date, userId: req.user.id });
  const ok = results.filter(r0 => r0.ok).length;
  res.json({ ok, results });
});

export default r;
