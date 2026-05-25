import { Router } from 'express';
import { BOOKS, getToc, getChapter, bustCache } from '../services/escriva.js';
const r = Router();

// GET /api/escriva/books                       — list of 5 books
// GET /api/escriva/:slug/toc                   — chapters for one book (cached)
// GET /api/escriva/:slug/chapter?ch=<slug>     — sanitized chapter HTML (cached)
// POST /api/escriva/refresh { slug? }          — drop cache

r.get('/books', (_req, res) => res.json(BOOKS));

r.get('/:slug/toc', async (req, res) => {
  try {
    const chapters = await getToc(req.params.slug);
    res.json({ slug: req.params.slug, chapters });
  } catch (e) {
    res.status(e.message === 'unknown_book' ? 404 : 502).json({ error: e.message });
  }
});

r.get('/:slug/chapter', async (req, res) => {
  const ch = req.query.ch;
  if (!ch) return res.status(400).json({ error: 'ch_required' });
  try {
    const data = await getChapter(req.params.slug, String(ch));
    res.json(data);
  } catch (e) {
    res.status(e.message === 'unknown_book' ? 404 : 502).json({ error: e.message });
  }
});

r.post('/refresh', (req, res) => { bustCache(req.body?.slug); res.json({ ok: true }); });

export default r;
