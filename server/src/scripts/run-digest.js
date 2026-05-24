// Cron/timer entry:  npm run digest
import { runDigest } from '../services/digest.js';
const results = await runDigest();
console.log(new Date().toISOString(), 'digest:', JSON.stringify(results));
process.exit(0);
