import { Router } from 'express';
import { db } from '../db.js';
import { askClaude } from '../lib/anthropic.js';

const r = Router();

const SYSTEM = `You are a wise, direct life strategist and mentor to Eric — a Catholic father of three (Opus Dei spirituality), solution architect and CPA, director of a software company (Primehub) in Nairobi, aiming for financial independence, big-tech work, and a home for his family. Honour his faith as the foundation: speak in terms of unity of life and sanctifying ordinary work. Be concrete, warm, and brief. Never flatter. Help him FOCUS — name what matters and what to drop. You are a thinking aid, not a replacement for his spiritual director or his wife; say so when the question belongs to them.`;

// POST /api/counsel  { question, web? }
r.post('/', async (req, res) => {
  const { question, web } = req.body || {};
  if (!question || !question.trim()) return res.status(400).json({ error: 'question_required' });

  // Build the user's context from their data — goals (by domain) + the
  // current particular-examen struggles. Kept compact so it costs little.
  const domains = db.prepare(
    `SELECT id, name, is_foundation FROM domains WHERE user_id = ? ORDER BY is_foundation DESC, sort, id`
  ).all(req.user.id);
  const goalsByDomain = new Map(domains.map(d => [d.id, []]));
  for (const g of db.prepare(
    `SELECT g.domain_id, g.title, g.horizon FROM goals g JOIN domains d ON d.id = g.domain_id
      WHERE d.user_id = ? ORDER BY g.id`
  ).all(req.user.id)) {
    goalsByDomain.get(g.domain_id)?.push({ title: g.title, horizon: g.horizon });
  }
  const struggles = db.prepare(
    `SELECT title, note FROM struggles WHERE user_id = ? ORDER BY id`
  ).all(req.user.id);

  const ctx = {
    domains: domains.map(d => ({
      domain: d.name,
      foundation: !!d.is_foundation,
      goals: goalsByDomain.get(d.id) || [],
    })),
    currentBattles: struggles.map(s => ({ title: s.title, note: s.note })),
  };

  const prompt = `My life context (JSON):\n${JSON.stringify(ctx, null, 2)}\n\nMy question:\n${question.trim()}`;

  try {
    const text = await askClaude({
      system: SYSTEM,
      prompt,
      maxTokens: 1000,
      web: !!web,
    });
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
