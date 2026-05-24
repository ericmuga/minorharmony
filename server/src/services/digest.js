import { db } from '../db.js';
import { askClaude } from '../lib/anthropic.js';

const SYSTEM =
  "You write a crisp morning briefing for a busy Catholic father, solution architect and CPA in Nairobi. " +
  "Be concise and skimmable: 4-6 short bullet points, plain language, your own words (never copy article text). " +
  "Lead with what changed and why it matters. For politics, stay neutral and factual — report, don't editorialise. " +
  "When you use live sources, name them inline. End with one 'so what' line.";

export async function runDigest({ date } = {}) {
  const day = date || new Date().toISOString().slice(0, 10);
  const topics = db.prepare('SELECT * FROM briefing_topics WHERE enabled = 1 ORDER BY user_id, sort').all();
  const save = db.prepare(
    `INSERT INTO briefings (user_id, topic, date, content) VALUES (?,?,?,?)
     ON CONFLICT(user_id, topic, date) DO UPDATE SET content = excluded.content, created_at = datetime('now')`);

  const results = [];
  for (const t of topics) {
    try {
      const prompt = `Today is ${day}. Brief me on: ${t.prompt}`;
      const content = await askClaude({ system: SYSTEM, prompt, maxTokens: 700, web: !!t.use_web });
      save.run(t.user_id, t.topic, day, content);
      results.push({ topic: t.topic, ok: true, chars: content.length });
    } catch (err) {
      results.push({ topic: t.topic, error: err.message });
    }
  }
  return results;
}
