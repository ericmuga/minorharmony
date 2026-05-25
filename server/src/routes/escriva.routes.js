import { Router } from 'express';
import { BOOKS, getToc, bustCache } from '../services/escriva.js';
const r = Router();

// GET /api/escriva/books            — list of 5 books with slug/title/url
// GET /api/escriva/:slug/toc        — chapters for one book (cached)
// POST /api/escriva/refresh         — drop the cache (so next request re-scrapes)

r.get('/books', (_req, res) => res.json(BOOKS));

r.get('/:slug/toc', async (req, res) => {
  try {
    const chapters = await getToc(req.params.slug);
    res.json({ slug: req.params.slug, chapters });
  } catch (e) {
    res.status(e.message === 'unknown_book' ? 404 : 502).json({ error: e.message });
  }
});

r.post('/refresh', (req, res) => { bustCache(req.body?.slug); res.json({ ok: true }); });

export default r;
