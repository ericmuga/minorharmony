// Create or update a login. No public signup — this is the only way users exist.
//   npm run create-user
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';

const rl = readline.createInterface({ input, output });
const name = await rl.question('Name: ');
const email = (await rl.question('Email: ')).toLowerCase().trim();
const role = (await rl.question('Role [owner/spouse/director] (owner): ')) || 'owner';
const password = await rl.question('Password: ');
rl.close();

if (!email || password.length < 8) { console.error('Email required, password >= 8 chars.'); process.exit(1); }
const hash = await bcrypt.hash(password, 12);
db.prepare(`INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)
            ON CONFLICT(email) DO UPDATE SET name=excluded.name, password_hash=excluded.password_hash, role=excluded.role`)
  .run(name, email, hash, role);
console.log(`User ${email} (${role}) saved.`);
process.exit(0);
