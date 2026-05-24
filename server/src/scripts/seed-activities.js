// One-time editable defaults for the owner: gym, swimming, piano, hiking.
// Run after create-user:  node src/scripts/seed-activities.js
import { db } from '../db.js';
const owner = db.prepare("SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1").get();
if (!owner) { console.error('Create a user first: npm run create-user'); process.exit(1); }

const acts = [
  { title: 'Gym',            lane: 'wellbeing', dow: '1,3,5',     start_min: 6*60,    dur_min: 60, offering: 'Care of the body, offered as thanksgiving' },
  { title: 'Swimming',       lane: 'wellbeing', dow: '2,4',       start_min: 6*60+30, dur_min: 60 },
  { title: 'Piano practice', lane: 'formation', dow: '1,2,3,4,5', start_min: 20*60,   dur_min: 30, prayer_tag: 'patience and steady effort' },
  { title: 'Hiking',         lane: 'wellbeing', dow: '6',         start_min: 7*60,    dur_min: 180, offering: 'Rest and creation, with family' },
];
const ins = db.prepare(`INSERT INTO recurring_activities (user_id,title,lane,dow,start_min,dur_min,offering,prayer_tag)
  VALUES (@u,@title,@lane,@dow,@start_min,@dur_min,@offering,@prayer_tag)`);
db.transaction(() => acts.forEach(a => ins.run({ u: owner.id, offering: null, prayer_tag: null, ...a })))();
console.log('Seeded', acts.length, 'activities for user', owner.id, '— edit freely in the app.');
process.exit(0);
