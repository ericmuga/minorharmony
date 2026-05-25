// Fetches and parses content from escriva.org.
// - TOCs are scraped once per book and cached for the process lifetime.
// - Chapter content is fetched on demand, sanitized, and cached.
// escriva.org sits behind Cloudflare and 403s naïve User-Agents,
// so we send browser-like request headers.
import * as cheerio from 'cheerio';

export const BOOKS = [
  { slug: 'camino',           title: 'The Way',              url: 'https://escriva.org/en/camino/' },
  { slug: 'surco',            title: 'Furrow',               url: 'https://escriva.org/en/surco/' },
  { slug: 'forja',            title: 'The Forge',            url: 'https://escriva.org/en/forja/' },
  { slug: 'es-cristo-que-pasa', title: 'Christ Is Passing By', url: 'https://escriva.org/en/es-cristo-que-pasa/' },
  { slug: 'amigos-de-dios',   title: 'Friends of God',       url: 'https://escriva.org/en/amigos-de-dios/' },
];

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const tocCache = new Map();      // slug -> [{ slug, title, url }]
const chapterCache = new Map();  // `${slug}/${chapterSlug}` -> { title, html }
const inflight = new Map();      // dedupe concurrent fetches

async function fetchHtml(url) {
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`escriva ${res.status}`);
  return res.text();
}

function parseToc(html, book) {
  const $ = cheerio.load(html);
  const out = [];
  const seen = new Set();
  $('a[href]').each((_, el) => {
    const raw = $(el).attr('href');
    if (!raw) return;
    let abs;
    try { abs = new URL(raw, book.url).href; } catch { return; }
    if (!abs.startsWith(book.url)) return;
    const rest = abs.slice(book.url.length).replace(/\/$/, '');
    // Skip the book root and individual numeric "point" pages (e.g. /1, /2).
    if (!rest || /^\d+$/.test(rest)) return;
    if (seen.has(rest)) return;
    seen.add(rest);
    let title = $(el).text().trim().replace(/\s+/g, ' ');
    if (!title) title = rest.split('/').pop().replace(/-/g, ' ');
    out.push({ slug: rest, title, url: abs });
  });
  return out;
}

function sanitizeAndRewrite(html, baseUrl) {
  const $ = cheerio.load(html, null, false);
  // strip scripts and inline event handlers
  $('script, style, noscript').remove();
  $('*').each((_, el) => {
    const attribs = el.attribs || {};
    for (const name of Object.keys(attribs)) {
      if (name.startsWith('on')) $(el).removeAttr(name);
    }
  });
  // rewrite relative hrefs to absolute escriva.org URLs and open in new tab
  $('a[href]').each((_, el) => {
    const raw = $(el).attr('href');
    if (!raw) return;
    try {
      const abs = new URL(raw, baseUrl).href;
      $(el).attr('href', abs);
      $(el).attr('target', '_blank');
      $(el).attr('rel', 'noopener');
    } catch {}
  });
  // rewrite relative image sources too (rare in this content but cheap)
  $('img[src]').each((_, el) => {
    const raw = $(el).attr('src');
    try { $(el).attr('src', new URL(raw, baseUrl).href); } catch {}
  });
  return $.html();
}

async function fetchToc(slug) {
  const book = BOOKS.find(b => b.slug === slug);
  if (!book) throw new Error('unknown_book');
  const html = await fetchHtml(book.url);
  return parseToc(html, book);
}

async function fetchChapter(slug, chapterSlug) {
  const book = BOOKS.find(b => b.slug === slug);
  if (!book) throw new Error('unknown_book');
  const url = book.url + chapterSlug.replace(/^\/+|\/+$/g, '') + '/';
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const article = $('#contenido');
  if (!article.length) throw new Error('content_not_found');
  const inner = article.html() || '';
  const cleaned = sanitizeAndRewrite(inner, url);
  const title = $('title').text().split('·')[0].trim() || chapterSlug;
  return { title, html: cleaned, url };
}

function memoize(cache, key, fn) {
  if (cache.has(key)) return cache.get(key);
  if (inflight.has(key)) return inflight.get(key);
  const p = fn()
    .then(v => { cache.set(key, v); inflight.delete(key); return v; })
    .catch(e => { inflight.delete(key); throw e; });
  inflight.set(key, p);
  return p;
}

export const getToc = (slug) => memoize(tocCache, `toc:${slug}`, () => fetchToc(slug));
export const getChapter = (slug, chapterSlug) =>
  memoize(chapterCache, `ch:${slug}/${chapterSlug}`, () => fetchChapter(slug, chapterSlug));

export function bustCache(slug) {
  if (!slug) { tocCache.clear(); chapterCache.clear(); return; }
  tocCache.delete(`toc:${slug}`);
  for (const k of chapterCache.keys()) if (k.startsWith(`ch:${slug}/`)) chapterCache.delete(k);
}
