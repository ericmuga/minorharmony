import { db } from '../db.js';
import { askClaude } from '../lib/anthropic.js';

export const DEFAULT_TOPICS = [
  { topic:'current', label:'Current affairs', use_web:1, sort:1, prompt:'the most important world and Kenya/East Africa news in the last 24-48 hours.' },
  { topic:'tech',    label:'Technology',      use_web:1, sort:2, prompt:'notable developments in software, cloud, AI, Microsoft/Azure/Dynamics and the dev world this week.' },
  { topic:'finance', label:'Finance',         use_web:1, sort:3, prompt:'markets, the Kenyan shilling, rates, and business/finance news relevant to a CPA running a software company.' },
  { topic:'politics',label:'Politics',        use_web:1, sort:4, prompt:'a short, neutral, factual roundup of major political developments, especially global and Kenyan. No opinion.' },
  { topic:'history', label:'On this day',     use_web:0, sort:5, prompt:'two or three genuinely interesting historical events that happened on this date, briefly.' },
];

export function ensureBriefingTopics(userId) {
  const existing = db.prepare('SELECT topic FROM briefing_topics WHERE user_id = ?').all(userId);
  if (existing.length) return existing.length;
  const ins = db.prepare(
    `INSERT INTO briefing_topics (user_id,topic,label,prompt,use_web,sort) VALUES (?,?,?,?,?,?)`);
  db.transaction(() => {
    for (const t of DEFAULT_TOPICS) ins.run(userId, t.topic, t.label, t.prompt, t.use_web, t.sort);
  })();
  return DEFAULT_TOPICS.length;
}

const SYSTEM =
  "You write a crisp morning briefing for a busy Catholic father, solution architect and CPA in Nairobi. " +
  "Be concise and skimmable. Write 4-6 short highlights for the requested area, in plain language and your own words. " +
  "Lead with what changed and why it matters. For politics, stay neutral and factual — report, don't editorialise. " +
  "When you use live sources, name them inline. End with one 'so what' line.";

export async function runDigest({ date, userId } = {}) {
  const day = date || new Date().toISOString().slice(0, 10);
  if (userId) ensureBriefingTopics(userId);
  const topics = userId
    ? db.prepare('SELECT * FROM briefing_topics WHERE user_id = ? AND enabled = 1 ORDER BY sort').all(userId)
    : db.prepare('SELECT * FROM briefing_topics WHERE enabled = 1 ORDER BY user_id, sort').all();
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
