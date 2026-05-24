import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EPUB_DIR = path.join(__dirname, '..', '..', 'data', 'epubs');
fs.mkdirSync(EPUB_DIR, { recursive: true });

const r = Router();

const STATES = ['to read', 'reading', 'done'];

// Ownership middleware — used before multer so an unauthorized request
// never gets to write a file to disk.
function requireOwnedBook(req, res, next) {
  const row = db.prepare('SELECT id FROM library WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, EPUB_DIR),
    filename: (req, _file, cb) => cb(null, `${req.params.id}.epub`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.epub$/i.test(file.originalname) ||
               file.mimetype === 'application/epub+zip';
    cb(ok ? null : new Error('only_epub'), ok);
  },
});

r.get('/', (req, res) =>
  res.json(db.prepare(
    `SELECT id, title, author, tag, state, url, epub_path, last_loc
       FROM library WHERE user_id = ? ORDER BY id`
  ).all(req.user.id)));

r.post('/', (req, res) => {
  const { title, author, tag, state, url } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title_required' });
  const info = db.prepare(
    `INSERT INTO library (user_id, title, author, tag, state, url) VALUES (?,?,?,?,?,?)`
  ).run(req.user.id, title, author || null, tag || null,
       STATES.includes(state) ? state : 'to read', url || null);
  res.json({ id: info.lastInsertRowid });
});

r.patch('/:id', (req, res) => {
  const f = ['title', 'author', 'tag', 'state', 'url', 'last_loc'];
  const sets = [], vals = [];
  for (const k of f) if (k in (req.body || {})) {
    if (k === 'state' && !STATES.includes(req.body[k])) continue;
    sets.push(`${k} = ?`); vals.push(req.body[k]);
  }
  if (sets.length) {
    vals.push(req.params.id, req.user.id);
    db.prepare(`UPDATE library SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  }
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM library WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---- EPUB upload / serve / delete ----
r.post('/:id/file', requireOwnedBook, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    db.prepare('UPDATE library SET epub_path = ?, last_loc = NULL WHERE id = ? AND user_id = ?')
      .run(`${req.params.id}.epub`, req.params.id, req.user.id);
    res.json({ ok: true, size: req.file.size });
  });
});

r.get('/:id/file', requireOwnedBook, (req, res) => {
  const row = db.prepare('SELECT epub_path FROM library WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row?.epub_path) return res.status(404).json({ error: 'no_file' });
  const fp = path.join(EPUB_DIR, row.epub_path);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'missing_on_disk' });
  res.setHeader('Content-Type', 'application/epub+zip');
  res.sendFile(fp);
});

r.delete('/:id/file', requireOwnedBook, (req, res) => {
  const fp = path.join(EPUB_DIR, `${req.params.id}.epub`);
  try { fs.unlinkSync(fp); } catch { /* ignore */ }
  db.prepare('UPDATE library SET epub_path = NULL, last_loc = NULL WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// convenience: POST /api/library/:id/cycle  — to-read → reading → done → to-read
r.post('/:id/cycle', (req, res) => {
  const row = db.prepare('SELECT state FROM library WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const next = STATES[(STATES.indexOf(row.state) + 1) % STATES.length] || 'to read';
  db.prepare('UPDATE library SET state = ? WHERE id = ? AND user_id = ?')
    .run(next, req.params.id, req.user.id);
  res.json({ state: next });
});

export default r;
