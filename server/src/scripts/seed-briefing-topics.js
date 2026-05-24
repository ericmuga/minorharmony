// Default briefing topics. Run after create-user:  node src/scripts/seed-briefing-topics.js
import { db } from '../db.js';
const owner = db.prepare("SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1").get();
if (!owner) { console.error('Create a user first.'); process.exit(1); }
const topics = [
  { topic:'current', label:'Current affairs', use_web:1, sort:1, prompt:'the most important world and Kenya/East Africa news in the last 24-48 hours.' },
  { topic:'tech',    label:'Technology',      use_web:1, sort:2, prompt:'notable developments in software, cloud, AI, Microsoft/Azure/Dynamics and the dev world this week.' },
  { topic:'finance', label:'Finance',         use_web:1, sort:3, prompt:'markets, the Kenyan shilling, rates, and business/finance news relevant to a CPA running a software company.' },
  { topic:'politics',label:'Politics',        use_web:1, sort:4, prompt:'a short, neutral, factual roundup of major political developments (global and Kenyan). No opinion.' },
  { topic:'history', label:'On this day',     use_web:0, sort:5, prompt:'two or three genuinely interesting historical events that happened on this date, briefly.' },
];
const ins = db.prepare(`INSERT INTO briefing_topics (user_id,topic,label,prompt,use_web,sort) VALUES (?,?,?,?,?,?)`);
db.transaction(()=>topics.forEach(t=>ins.run(owner.id,t.topic,t.label,t.prompt,t.use_web,t.sort)))();
console.log('Seeded', topics.length, 'briefing topics for user', owner.id);
process.exit(0);
