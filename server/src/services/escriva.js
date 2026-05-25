// Fetches and parses the table of contents for each Escrivá book at escriva.org.
// Results are cached in memory — escriva.org content is essentially static, so a
// process-lifetime cache is plenty. Restart the server to refresh.
import * as cheerio from 'cheerio';

export const BOOKS = [
  { slug: 'camino',           title: 'The Way',              url: 'https://escriva.org/en/camino/' },
  { slug: 'surco',            title: 'Furrow',               url: 'https://escriva.org/en/surco/' },
  { slug: 'forja',            title: 'The Forge',            url: 'https://escriva.org/en/forja/' },
  { slug: 'es-cristo-que-pasa', title: 'Christ Is Passing By', url: 'https://escriva.org/en/es-cristo-que-pasa/' },
  { slug: 'amigos-de-dios',   title: 'Friends of God',       url: 'https://escriva.org/en/amigos-de-dios/' },
];

const cache = new Map();   // slug -> [{ title, url }]
const inflight = new Map(); // slug -> Promise

async function fetchToc(slug) {
  const book = BOOKS.find(b => b.slug === slug);
  if (!book) throw new Error('unknown_book');
  const res = await fetch(book.url, { headers: { 'User-Agent': 'Serviam/1.0 (personal use)' } });
  if (!res.ok) throw new Error(`escriva ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  // Chapter links live in <a> tags whose href is below the book URL — extract those.
  const chapters = [];
  const seen = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || !href.startsWith(book.url)) return;
    const rest = href.slice(book.url.length).replace(/\/$/, '');
    // skip the book's own root, numeric-only point pages (e.g. /1, /2), and dupes
    if (!rest || /^\d+$/.test(rest) || rest.includes('/')) return;
    if (seen.has(rest)) return;
    seen.add(rest);
    let title = $(el).text().trim().replace(/\s+/g, ' ');
    if (!title) title = rest.replace(/-/g, ' ');
    chapters.push({ slug: rest, title, url: href });
  });
  return chapters;
}

export async function getToc(slug) {
  if (cache.has(slug)) return cache.get(slug);
  if (inflight.has(slug)) return inflight.get(slug);
  const p = fetchToc(slug)
    .then(chapters => { cache.set(slug, chapters); inflight.delete(slug); return chapters; })
    .catch(err => { inflight.delete(slug); throw err; });
  inflight.set(slug, p);
  return p;
}

export function bustCache(slug) {
  if (slug) cache.delete(slug);
  else cache.clear();
}
