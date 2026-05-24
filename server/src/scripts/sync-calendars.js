// Run from cron/systemd timer:  npm run sync
import { syncAllCalendars } from '../services/calendarSync.js';
const results = await syncAllCalendars();
console.log(new Date().toISOString(), 'sync:', JSON.stringify(results));
process.exit(0);
