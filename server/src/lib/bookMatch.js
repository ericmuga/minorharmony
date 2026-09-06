// Matching uploaded EPUB filenames against titles already in the reading list.
//
// Deliberately dependency-free and deterministic: no EPUB unzipping, no LLM call.
// Filenames from every normal source ("Conversations with God - Neale Donald
// Walsch.epub", "the_screwtape_letters.epub") carry enough signal, and a wrong
// guess here is cheap because nothing commits without the user confirming.

// Words that carry no identity. Dropping them is what lets
// "In Conversations with God" match "Conversations with God".
const STOP = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'with',
  'from', 'by', 'vol', 'volume', 'book', 'part', 'edition', 'ed', 'new',
]);

// Strip the noise real downloads carry: "(z-lib.org)", "[EPUB]", "v2", trailing
// numbers in brackets, and the extension itself.
const NOISE = [
  /\.epub$/i,
  /\((?:z-lib\.org|zlibrary|libgen|annas?[- ]archive)[^)]*\)/ig,
  /\[[^\]]*\]/g,
  /\((?:epub|mobi|pdf|retail|ebook)\)/ig,
  /\bv\d+(\.\d+)?\b/ig,
];

export function cleanName(filename) {
  let s = String(filename || '');
  for (const re of NOISE) s = s.replace(re, ' ');
  return s.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalize(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')    // strip combining accents
    .toLowerCase()
    .replace(/['’`]/g, '')                                // don't split possessives
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokens(s) {
  return normalize(s).split(' ').filter(t => t && !STOP.has(t));
}

// Jaccard over content words. Symmetric, and forgiving about word order and
// subtitles, which is exactly how book titles vary in the wild.
export function similarity(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared);
}

// A filename is usually "Title - Author" or "Author - Title" and there is no
// reliable way to tell which. So produce every plausible reading and let the
// scorer pick — whichever half matches an existing title wins on its merits.
export function candidates(filename) {
  const base = cleanName(filename);
  const out = [base];
  for (const sep of [' - ', ' -- ', ' by ', ' – ']) {
    const idx = base.toLowerCase().indexOf(sep.toLowerCase());
    if (idx > 0) {
      out.push(base.slice(0, idx).trim());
      out.push(base.slice(idx + sep.length).trim());
    }
  }
  const paren = base.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) { out.push(paren[1].trim()); out.push(paren[2].trim()); }
  const colon = base.indexOf(':');
  if (colon > 0) out.push(base.slice(0, colon).trim());   // drop the subtitle
  return [...new Set(out.filter(s => s.length > 1))];
}

// Looks like a person's name: two to four capitalised words, no digits.
// Used only to decide which half of "X - Y" to file as the author.
function looksLikeAuthor(s) {
  const w = String(s || '').trim().split(/\s+/);
  return w.length >= 2 && w.length <= 4 &&
         w.every(x => /^[A-Z][\p{L}.'-]*$/u.test(x));
}

// Best guess at title/author for a file we're going to create a NEW row for.
export function guessTitleAuthor(filename) {
  const base = cleanName(filename);
  for (const sep of [' - ', ' -- ', ' by ', ' – ']) {
    const idx = base.toLowerCase().indexOf(sep.toLowerCase());
    if (idx > 0) {
      const left = base.slice(0, idx).trim();
      const right = base.slice(idx + sep.length).trim();
      if (looksLikeAuthor(right)) return { title: left, author: right };
      if (looksLikeAuthor(left)) return { title: right, author: left };
      return { title: left, author: right || null };
    }
  }
  const paren = base.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren && looksLikeAuthor(paren[2])) return { title: paren[1].trim(), author: paren[2].trim() };
  return { title: base, author: null };
}

export const ATTACH_CONFIDENT = 0.75;   // propose attaching, pre-ticked
export const ATTACH_MAYBE     = 0.45;   // propose attaching, but flag it

// books: [{ id, title, author, epub_path }]
export function proposeFor(filename, books) {
  const cands = candidates(filename);
  let best = { book: null, score: 0 };

  for (const b of books) {
    for (const c of cands) {
      let s = similarity(c, b.title);
      // A matching author is corroboration, not identity — nudge, don't decide.
      if (b.author && similarity(c, b.author) > 0.6) s = Math.min(1, s + 0.15);
      if (s > best.score) best = { book: b, score: s };
    }
  }

  const guess = guessTitleAuthor(filename);

  if (best.book && best.score >= ATTACH_MAYBE) {
    return {
      action: 'attach',
      bookId: best.book.id,
      matchedTitle: best.book.title,
      // Replacing a book that already has a file is the one destructive
      // outcome here, so never pre-tick it however good the score looks.
      confident: best.score >= ATTACH_CONFIDENT && !best.book.epub_path,
      replaces: !!best.book.epub_path,
      score: Number(best.score.toFixed(2)),
      guess,
    };
  }
  return { action: 'create', bookId: null, confident: true, score: Number(best.score.toFixed(2)), guess };
}
