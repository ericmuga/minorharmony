import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db.js';
import { proposeFor, guessTitleAuthor } from '../lib/bookMatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EPUB_DIR = path.join(__dirname, '..', '..', 'data', 'epubs');
// Bulk imports land here first so the user can review the proposed mapping
// before anything touches the library. Nothing in here is reachable by URL.
const STAGE_DIR = path.join(__dirname, '..', '..', 'data', 'epub-staging');
fs.mkdirSync(EPUB_DIR, { recursive: true });
fs.mkdirSync(STAGE_DIR, { recursive: true });

const STAGE_TTL_MS = 6 * 60 * 60 * 1000;

// EPUB and PDF. The `epub_path` column keeps its name for the sake of existing
// rows, but it stores the real filename including extension — read it, don't
// assume .epub anywhere.
const ALLOWED = {
  '.epub': 'application/epub+zip',
  '.pdf': 'application/pdf',
};
const BOOK_RE = /\.(epub|pdf)$/i;

// Never trust the client's extension for anything but choosing between these
// two known-good values.
function extOf(filename) {
  const m = BOOK_RE.exec(String(filename || ''));
  return m ? '.' + m[1].toLowerCase() : null;
}

function acceptBook(_req, file, cb) {
  const ok = BOOK_RE.test(file.originalname) ||
             file.mimetype === 'application/epub+zip' ||
             file.mimetype === 'application/pdf';
  cb(ok ? null : new Error('only_epub_or_pdf'), ok);
}

// An import the user abandoned would otherwise sit on disk forever. Sweep on
// boot and before each new import — cheap, and there is never much here.
function sweepStaging() {
  const cutoff = Date.now() - STAGE_TTL_MS;
  for (const name of fs.readdirSync(STAGE_DIR)) {
    const fp = path.join(STAGE_DIR, name);
    try {
      if (fs.statSync(fp).mtimeMs < cutoff) fs.rmSync(fp, { recursive: true, force: true });
    } catch { /* raced with a commit; fine */ }
  }
}
sweepStaging();

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
    filename: (req, file, cb) =>
      cb(null, `${req.params.id}${extOf(file.originalname) || '.epub'}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: acceptBook,
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
    // Swapping an EPUB for a PDF (or back) leaves the old file behind under the
    // other extension, and the stale one would win on the next delete. Clear it.
    const prev = db.prepare('SELECT epub_path FROM library WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id)?.epub_path;
    if (prev && prev !== req.file.filename) {
      try { fs.unlinkSync(path.join(EPUB_DIR, prev)); } catch { /* already gone */ }
    }
    db.prepare('UPDATE library SET epub_path = ?, last_loc = NULL WHERE id = ? AND user_id = ?')
      .run(req.file.filename, req.params.id, req.user.id);
    res.json({ ok: true, size: req.file.size });
  });
});

r.get('/:id/file', requireOwnedBook, (req, res) => {
  const row = db.prepare('SELECT epub_path FROM library WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row?.epub_path) return res.status(404).json({ error: 'no_file' });
  const fp = path.join(EPUB_DIR, row.epub_path);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'missing_on_disk' });
  res.setHeader('Content-Type', ALLOWED[extOf(row.epub_path)] || 'application/octet-stream');
  res.sendFile(fp);
});

r.delete('/:id/file', requireOwnedBook, (req, res) => {
  // Delete what the row actually points at — the file may be a .pdf.
  const stored = db.prepare('SELECT epub_path FROM library WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)?.epub_path;
  if (stored) {
    try { fs.unlinkSync(path.join(EPUB_DIR, path.basename(stored))); } catch { /* ignore */ }
  }
  db.prepare('UPDATE library SET epub_path = NULL, last_loc = NULL WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---- Bulk import -----------------------------------------------------------
// Two phases on purpose. Phase 1 uploads the files and returns a *proposal*;
// phase 2 commits the user's decisions. The files are uploaded once and held in
// staging between the two, so reviewing the mapping costs nothing extra — and
// no automatic guess can silently overwrite a book you already had.

const STAGE_NAME_RE = /^[0-9a-f-]{36}$/i;      // a uuid, nothing else
const STAGED_NAME_RE = /^\d+\.(epub|pdf)$/i;

const importUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => cb(null, req.stageDir),
    filename: (req, file, cb) =>
      cb(null, `${req.fileSeq++}${extOf(file.originalname) || '.epub'}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 60 },
  fileFilter: acceptBook,
});

r.post('/import', (req, res) => {
  sweepStaging();
  const importId = crypto.randomUUID();
  req.stageDir = path.join(STAGE_DIR, importId);
  req.fileSeq = 0;
  fs.mkdirSync(req.stageDir, { recursive: true });

  importUpload.array('files')(req, res, (err) => {
    if (err) {
      fs.rmSync(req.stageDir, { recursive: true, force: true });
      return res.status(400).json({ error: err.message });
    }
    const files = req.files || [];
    if (!files.length) {
      fs.rmSync(req.stageDir, { recursive: true, force: true });
      return res.status(400).json({ error: 'no_files' });
    }

    const books = db.prepare(
      'SELECT id, title, author, epub_path FROM library WHERE user_id = ?').all(req.user.id);

    // Two uploads in one batch can match the same book; the second would
    // silently clobber the first. Let the first claim it and make the rest
    // create their own row, so nothing is lost without the user saying so.
    const claimed = new Set();
    const items = files.map((f) => {
      const p = proposeFor(f.originalname, books);
      if (p.action === 'attach' && claimed.has(p.bookId)) {
        const g = guessTitleAuthor(f.originalname);
        return { stagedAs: f.filename, filename: f.originalname, size: f.size,
                 action: 'create', bookId: null, confident: false, score: p.score,
                 guess: g, note: 'another file in this batch matched that title first' };
      }
      if (p.action === 'attach') claimed.add(p.bookId);
      return { stagedAs: f.filename, filename: f.originalname, size: f.size, ...p };
    });

    res.json({ importId, items, books: books.map(b => ({ id: b.id, title: b.title, hasFile: !!b.epub_path })) });
  });
});

r.post('/import/:importId/commit', (req, res) => {
  const { importId } = req.params;
  if (!STAGE_NAME_RE.test(importId)) return res.status(400).json({ error: 'bad_import_id' });
  const stageDir = path.join(STAGE_DIR, importId);
  if (!fs.existsSync(stageDir)) return res.status(404).json({ error: 'import_expired' });

  const decisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
  const results = [];

  const insert = db.prepare(
    `INSERT INTO library (user_id, title, author, tag, state, epub_path)
     VALUES (?,?,?,?,'to read',NULL)`);
  const attach = db.prepare(
    'UPDATE library SET epub_path = ?, last_loc = NULL WHERE id = ? AND user_id = ?');

  for (const d of decisions) {
    // The staged name is server-generated, but it arrives back from the client,
    // so treat it as hostile: basename only, and it must resolve inside stageDir.
    const staged = path.basename(String(d.stagedAs || ''));
    const src = path.join(stageDir, staged);
    if (!STAGED_NAME_RE.test(staged) || !fs.existsSync(src)) {
      results.push({ stagedAs: d.stagedAs, ok: false, error: 'missing' });
      continue;
    }
    if (d.action === 'skip') { results.push({ stagedAs: staged, ok: true, action: 'skip' }); continue; }

    try {
      let bookId;
      if (d.action === 'attach') {
        const owned = db.prepare('SELECT id FROM library WHERE id = ? AND user_id = ?')
          .get(d.bookId, req.user.id);
        if (!owned) { results.push({ stagedAs: staged, ok: false, error: 'not_found' }); continue; }
        bookId = owned.id;
      } else {
        const title = String(d.title || '').trim();
        if (!title) { results.push({ stagedAs: staged, ok: false, error: 'title_required' }); continue; }
        bookId = insert.run(req.user.id, title, (d.author || '').trim() || null,
                            (d.tag || '').trim() || null).lastInsertRowid;
      }

      // Move, then record. If the rename fails the DB still points at whatever
      // was there before, which is recoverable; the reverse would not be.
      // Attaching a PDF over a book that had an EPUB (or vice versa) must not
      // orphan the old file under the other extension.
      const ext = extOf(staged) || '.epub';
      const prev = db.prepare('SELECT epub_path FROM library WHERE id = ? AND user_id = ?')
        .get(bookId, req.user.id)?.epub_path;
      if (prev && prev !== `${bookId}${ext}`) {
        try { fs.unlinkSync(path.join(EPUB_DIR, path.basename(prev))); } catch { /* gone */ }
      }
      fs.renameSync(src, path.join(EPUB_DIR, `${bookId}${ext}`));
      attach.run(`${bookId}${ext}`, bookId, req.user.id);
      results.push({ stagedAs: staged, ok: true, action: d.action, bookId });
    } catch (e) {
      results.push({ stagedAs: staged, ok: false, error: e.message });
    }
  }

  fs.rmSync(stageDir, { recursive: true, force: true });
  res.json({ ok: true, results });
});

r.delete('/import/:importId', (req, res) => {
  const { importId } = req.params;
  if (!STAGE_NAME_RE.test(importId)) return res.status(400).json({ error: 'bad_import_id' });
  fs.rmSync(path.join(STAGE_DIR, importId), { recursive: true, force: true });
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
