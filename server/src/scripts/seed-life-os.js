// Seed the plan of life (norms), domains + goals, and the library — for the owner.
// Idempotent: if any of the three tables already has rows for the owner, that table is skipped.
//   node src/scripts/seed-life-os.js
import { db } from '../db.js';

const owner = db.prepare("SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1").get();
if (!owner) { console.error('Create a user first: npm run create-user'); process.exit(1); }
const U = owner.id;

const dailyNorms = [
  { name: 'Heroic minute — rise at once, "Serviam!"', sub: 'The first victory of the day, won before anything else.' },
  { name: 'Morning offering & Angelus', sub: 'Offer the day; consecrate the work to come.' },
  { name: 'Holy Mass & Communion', sub: 'The centre and root of the interior life.' },
  { name: 'Mental prayer (30 min)', sub: 'A friend who knows we are looking at him.' },
  { name: 'Spiritual reading — New Testament + a spiritual book' },
  { name: 'The Holy Rosary' },
  { name: 'Particular examen', sub: 'The one battle of this season (see The Struggle).' },
  { name: 'Examination of conscience at night', sub: 'Close the day honestly (see Nightly examen).' },
  { name: 'The Preces / aspirations through the day' },
  { name: 'A small mortification offered up', sub: 'Custody of the senses; a sacrifice no one sees.' },
];

const rhythmNorms = [
  { cadence: 'weekly',  name: 'Confession', sub: 'Frequent, regular — the medicine of mercy.' },
  { cadence: 'weekly',  name: 'The chat / spiritual direction', sub: 'Your truest strategist. Keep it.' },
  { cadence: 'monthly', name: 'Day of recollection' },
  { cadence: 'annual',  name: 'Annual retreat' },
];

const domains = [
  { name: 'Spirituality', glyph: '✝', is_foundation: 1, goals: [
    { title: 'Live the plan of life faithfully, daily', why: 'The foundation. Sanctify ordinary work, family and study — unity of life.', horizon: 'now' },
    { title: 'Weekly confession & regular spiritual direction', why: 'The real strategic counsel; the surest help against the errant heart.', horizon: 'now' },
    { title: 'Monthly recollection & annual retreat', why: 'Step back, re-aim the whole life.', horizon: 'soon' },
  ]},
  { name: 'Family', glyph: '⌂', goals: [
    { title: 'Be present, forthright and tender with my wife', why: 'Love guarded and spoken plainly — fidelity is built in the small, daily things.', horizon: 'now' },
    { title: 'Buy or build the family home', why: 'Stability for the three children; a long-overdue promise to keep.', horizon: 'now' },
    { title: 'A real, unhurried hour with each child weekly', why: 'Presence is the inheritance they remember.', horizon: 'now' },
  ]},
  { name: 'Finance', glyph: '₵', goals: [
    { title: 'Stop the overspending — automate saving first', why: 'Pay the house fund before anything else; spend what remains, not the reverse.', horizon: 'now' },
    { title: 'Primehub to KES 1M/month recurring', why: 'Retainers + a productised SaaS, not one-off projects.', horizon: 'now' },
    { title: 'Financial independence: bills covered without the salary', why: 'Freedom to choose work, and to give.', horizon: 'soon' },
  ]},
  { name: 'Career', glyph: '◈', goals: [
    { title: 'Transition out of the current role on my terms', why: 'The July sprint is already running — finish it.', horizon: 'now' },
    { title: 'Work with Microsoft / big tech', why: 'D365 + solution-architecture depth is the bridge.', horizon: 'soon' },
    { title: 'Live and work in Europe / the US for a season', why: 'Exposure, scale, and lives touched beyond Nairobi.', horizon: 'horizon' },
  ]},
  { name: 'Leadership', glyph: '⚑', goals: [
    { title: 'Delegate at Primehub — hire/appoint an operations lead', why: 'Make it an asset that runs without you, not a second job.', horizon: 'now' },
    { title: 'Grow in delegation and trust', why: 'Multiply through others; stop being the bottleneck.', horizon: 'now' },
  ]},
  { name: 'Formation & Skills', glyph: '✑', goals: [
    { title: 'Finish the MCom marketing thesis — finally', why: 'Close the open loop that quietly drains you.', horizon: 'soon' },
    { title: 'Sharpen the high-leverage technical & street-smart skills', why: 'Architecture, AI, negotiation, reading the room.', horizon: 'soon' },
  ]},
  { name: 'Influence & Service', glyph: '❖', goals: [
    { title: 'Build genuine connections and mentors', why: 'Doors open through people; keep relationships warm.', horizon: 'now' },
    { title: 'Touch lives — teach, build, give', why: 'The point of the independence is to serve.', horizon: 'horizon' },
  ]},
  { name: 'Health', glyph: '♁', goals: [
    { title: 'Order to the body: sleep, movement, sobriety of life', why: 'The engine for everything above.', horizon: 'now' },
  ]},
];

const library = [
  { title: 'The Way · Furrow · The Forge', author: 'St. Josemaría Escrivá', tag: 'foundation', state: 'reading' },
  { title: 'In Conversation with God', author: 'F. Fernández-Carvajal', tag: 'daily meditation' },
  { title: 'Christ Is Passing By / Friends of God', author: 'St. Josemaría Escrivá', tag: 'spirit of work' },
  { title: 'Three to Get Married', author: 'Fulton Sheen', tag: 'marriage & love' },
  { title: 'The Psychology of Money', author: 'Morgan Housel', tag: 'overspending → wealth' },
  { title: 'The Richest Man in Babylon', author: 'George Clason', tag: 'pay yourself first' },
  { title: 'Deep Work', author: 'Cal Newport', tag: 'focus on what matters' },
  { title: 'Essentialism', author: 'Greg McKeown', tag: 'streamlining' },
  { title: 'Atomic Habits', author: 'James Clear', tag: 'the daily bricks' },
  { title: 'Who Not How', author: 'Sullivan & Hardy', tag: 'delegation' },
  { title: 'The 7 Habits of Highly Effective People', author: 'Stephen Covey', tag: 'principle-centred' },
  { title: 'Never Eat Alone', author: 'Keith Ferrazzi', tag: 'connections & street smarts' },
  { title: 'Never Split the Difference', author: 'Chris Voss', tag: 'negotiation' },
  { title: 'Hallow (app)', author: 'audio · Rosary, examen, meditations', tag: 'prayer on the go' },
];

const struggles = [
  { title: 'Custody of the heart — fidelity & forthrightness in love',
    note: 'The keystone battle. Guard the senses, be plain and affectionate with my wife, bring it to confession and direction. Won one day at a time.' },
  { title: 'Curb overspending',
    note: 'Before any purchase: is this the house fund or the whim? Save first, then spend what remains.' },
];

const people = [
  { name: '(Your spiritual director)', role: 'direction & confession', next_ask: 'Set the weekly chat' },
  { name: '(A Microsoft / big-tech insider)', role: 'mentor / referral', next_ask: 'Find & message one this month' },
];

const countNorms     = db.prepare('SELECT COUNT(*) c FROM norms     WHERE user_id = ?').get(U).c;
const countDomains   = db.prepare('SELECT COUNT(*) c FROM domains   WHERE user_id = ?').get(U).c;
const countLibrary   = db.prepare('SELECT COUNT(*) c FROM library   WHERE user_id = ?').get(U).c;
const countStruggles = db.prepare('SELECT COUNT(*) c FROM struggles WHERE user_id = ?').get(U).c;
const countPeople    = db.prepare('SELECT COUNT(*) c FROM people    WHERE user_id = ?').get(U).c;

const insNorm = db.prepare('INSERT INTO norms (user_id, name, sub, cadence, sort) VALUES (?,?,?,?,?)');
const insDomain = db.prepare('INSERT INTO domains (user_id, name, glyph, is_foundation, sort) VALUES (?,?,?,?,?)');
const insGoal = db.prepare('INSERT INTO goals (domain_id, title, why, horizon) VALUES (?,?,?,?)');
const insLib = db.prepare('INSERT INTO library (user_id, title, author, tag, state) VALUES (?,?,?,?,?)');
const insStruggle = db.prepare('INSERT INTO struggles (user_id, title, note) VALUES (?,?,?)');
const insPerson = db.prepare('INSERT INTO people (user_id, name, role, next_ask) VALUES (?,?,?,?)');

db.transaction(() => {
  if (countNorms === 0) {
    dailyNorms.forEach((n, i) => insNorm.run(U, n.name, n.sub || null, 'daily', i));
    rhythmNorms.forEach((n, i) => insNorm.run(U, n.name, n.sub || null, n.cadence, i));
    console.log(`  norms: seeded ${dailyNorms.length + rhythmNorms.length}`);
  } else console.log(`  norms: skipped (already have ${countNorms})`);

  if (countDomains === 0) {
    domains.forEach((d, i) => {
      const info = insDomain.run(U, d.name, d.glyph || null, d.is_foundation || 0, i);
      d.goals.forEach(g => insGoal.run(info.lastInsertRowid, g.title, g.why || null, g.horizon || 'soon'));
    });
    const goalCount = domains.reduce((a, d) => a + d.goals.length, 0);
    console.log(`  domains: seeded ${domains.length} (${goalCount} goals)`);
  } else console.log(`  domains: skipped (already have ${countDomains})`);

  if (countLibrary === 0) {
    library.forEach(b => insLib.run(U, b.title, b.author || null, b.tag || null, b.state || 'to read'));
    console.log(`  library: seeded ${library.length}`);
  } else console.log(`  library: skipped (already have ${countLibrary})`);

  if (countStruggles === 0) {
    struggles.forEach(s => insStruggle.run(U, s.title, s.note || null));
    console.log(`  struggles: seeded ${struggles.length}`);
  } else console.log(`  struggles: skipped (already have ${countStruggles})`);

  if (countPeople === 0) {
    people.forEach(p => insPerson.run(U, p.name, p.role || null, p.next_ask || null));
    console.log(`  people: seeded ${people.length}`);
  } else console.log(`  people: skipped (already have ${countPeople})`);
})();

console.log(`Done for user ${U}.`);
process.exit(0);
