import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'serviam.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Idempotent column additions for older DBs (CREATE TABLE IF NOT EXISTS
// can't add columns to existing tables). Safe to keep here forever.
function ensureColumn(table, column, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
}
ensureColumn('library', 'url', 'TEXT');
ensureColumn('library', 'epub_path', 'TEXT');
ensureColumn('library', 'last_loc', 'TEXT');

// Deleting a block that came from a recurring activity can't just remove the row:
// GET /planner/day re-materialises the activity on the next load and the block
// reappears. Instead we tombstone it — the row stays (so materialisation still
// sees it and skips) but the day view filters it out. "Skip the gym today."
ensureColumn('time_blocks', 'dismissed', 'INTEGER NOT NULL DEFAULT 0');

export default db;
