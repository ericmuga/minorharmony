<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, defineAsyncComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ePub from 'epubjs';
import { api } from '../api.js';
// pdf.js is ~1.3 MB with its worker. Loading it eagerly would double the initial
// bundle for everyone, including people who only ever open EPUBs — so it's
// fetched the first time a PDF is actually opened.
const PdfView = defineAsyncComponent(() => import('./PdfView.vue'));

const route = useRoute();
const router = useRouter();
const bookId = Number(route.params.id);

const shellRef = ref(null);
const containerRef = ref(null);
const meta = ref(null);
const err = ref('');
const immersive = ref(false);
const chromeVisible = ref(true);       // in immersive mode the bars auto-hide
const kind = ref(null);                // 'epub' | 'pdf', from the stored filename
const pdfRef = ref(null);
const bookmarks = ref([]);
const showBookmarks = ref(false);
const bookmarkMsg = ref('');
let book = null;
let rendition = null;
let saveTimer = null;
let chromeTimer = null;
let ro = null;
let sessionStartedAt = null;
let sessionStartLoc = null;
let currentLoc = null;

async function init() {
  try {
    const all = await api.get('/library');
    meta.value = all.find(b => b.id === bookId);
    if (!meta.value?.epub_path) {
      err.value = 'No file uploaded for this book. Upload an EPUB or PDF from the Reading tab first.';
      return;
    }

    // The column stores the real filename, so the extension is the format.
    kind.value = /\.pdf$/i.test(meta.value.epub_path) ? 'pdf' : 'epub';
    sessionStartedAt = new Date();
    sessionStartLoc = meta.value.last_loc || null;
    currentLoc = meta.value.last_loc || null;
    loadBookmarks();
    if (kind.value === 'pdf') return;      // PdfView takes it from here

    book = ePub(`/api/library/${bookId}/file`, { openAs: 'epub' });
    rendition = book.renderTo(containerRef.value, {
      width: '100%', height: '100%', flow: 'paginated', spread: 'auto',
    });
    applyTheme();
    await rendition.display(meta.value.last_loc || undefined);

    rendition.on('relocated', (loc) => {
      currentLoc = loc.start.cfi;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        api.patch(`/library/${bookId}`, { last_loc: loc.start.cfi }).catch(() => {});
      }, 600);
    });

    // Arrow keys only reach the page when focus is outside the iframe, so bind
    // inside the rendition too or paging dies the moment you tap the text.
    rendition.on('keyup', onKey);

    // The viewport changes on rotate, on entering fullscreen, and on the mobile
    // URL bar sliding away. epub.js paginates to a fixed size, so it must be
    // told each time or the text is clipped mid-column.
    ro = new ResizeObserver(() => resize());
    ro.observe(containerRef.value);
  } catch (e) {
    err.value = 'Could not open EPUB: ' + (e?.message || 'unknown error');
  }
}

function applyTheme() {
  rendition?.themes.default({
    body: { 'font-family': 'Spectral, Georgia, serif', 'color': '#2a2620', 'background': '#fdfaf2' },
    'p, li': { 'font-size': '17px', 'line-height': '1.55' },
    'a': { 'color': '#742a2a' },
  });
}

function resize() {
  const el = containerRef.value;
  if (!rendition || !el) return;
  const { clientWidth: w, clientHeight: h } = el;
  if (w > 0 && h > 0) { try { rendition.resize(w, h); } catch { /* mid-teardown */ } }
}

function next() { kind.value === 'pdf' ? pdfRef.value?.next() : rendition?.next(); nudgeChrome(); }
function prev() { kind.value === 'pdf' ? pdfRef.value?.prev() : rendition?.prev(); nudgeChrome(); }

// PdfView reports the page it settled on; store it the same way as an EPUB CFI,
// debounced, so flipping quickly doesn't write once per page.
function onPdfLocated(loc) {
  currentLoc = String(loc);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.patch(`/library/${bookId}`, { last_loc: loc }).catch(() => {});
  }, 600);
}

async function loadBookmarks() {
  bookmarks.value = await api.get(`/library/${bookId}/bookmarks`).catch(() => []);
}

async function addBookmark() {
  const loc = currentLoc || meta.value?.last_loc;
  if (!loc) {
    bookmarkMsg.value = 'Open a page first.';
    setTimeout(() => { bookmarkMsg.value = ''; }, 2500);
    return;
  }
  const label = kind.value === 'pdf'
    ? `Page ${loc}`
    : new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  await api.post(`/library/${bookId}/bookmarks`, { loc: String(loc), label });
  bookmarkMsg.value = 'Bookmark saved.';
  setTimeout(() => { bookmarkMsg.value = ''; }, 2500);
  await loadBookmarks();
}

async function goBookmark(b) {
  currentLoc = b.loc;
  if (kind.value === 'pdf') pdfRef.value?.goTo(b.loc);
  else await rendition?.display(b.loc);
  showBookmarks.value = false;
  nudgeChrome();
}

async function deleteBookmark(b) {
  await api.del(`/library/${bookId}/bookmarks/${b.id}`);
  bookmarks.value = bookmarks.value.filter(x => x.id !== b.id);
}

function recordReadingSession() {
  if (!sessionStartedAt || !meta.value?.epub_path) return;
  const ended = new Date();
  const minutes = Math.max(0, Math.round((ended - sessionStartedAt) / 60000));
  if (minutes <= 0 && currentLoc === sessionStartLoc) return;
  fetch(`/api/library/${bookId}/reading-sessions`, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      started_at: sessionStartedAt.toISOString(),
      ended_at: ended.toISOString(),
      start_loc: sessionStartLoc,
      end_loc: currentLoc,
      minutes,
    }),
  }).catch(() => {});
}

// ---- immersive / full screen ----------------------------------------------
// Two layers, deliberately: the CSS overlay is what actually makes it full
// screen and always works, and the Fullscreen API is a best-effort extra to
// drop the browser chrome as well. iOS Safari on iPhone has no element
// fullscreen at all, so the overlay has to stand on its own.
async function toggleImmersive() {
  immersive.value = !immersive.value;
  if (immersive.value) {
    try { await shellRef.value?.requestFullscreen?.(); } catch { /* overlay still applies */ }
    nudgeChrome();
  } else {
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
    chromeVisible.value = true;
    clearTimeout(chromeTimer);
  }
  await nextTick();
  resize();
}

// Esc and the browser's own exit gesture leave fullscreen without telling us,
// so mirror that back into our own state or the overlay gets stuck on.
function onFsChange() {
  if (!document.fullscreenElement && immersive.value) {
    immersive.value = false;
    chromeVisible.value = true;
    nextTick(resize);
  }
}

function nudgeChrome() {
  if (!immersive.value) return;
  chromeVisible.value = true;
  clearTimeout(chromeTimer);
  chromeTimer = setTimeout(() => { chromeVisible.value = false; }, 2500);
}

function onKey(e) {
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
  if (e.key === 'ArrowLeft'  || e.key === 'PageUp')  { e.preventDefault(); prev(); }
  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleImmersive(); }
  // Esc while immersive but not in real fullscreen (iOS) — the API can't fire.
  if (e.key === 'Escape' && immersive.value && !document.fullscreenElement) toggleImmersive();
}

function leave() {
  if (immersive.value) { toggleImmersive(); return; }
  router.push('/reading');
}

onMounted(() => {
  init();
  window.addEventListener('keydown', onKey);
  document.addEventListener('fullscreenchange', onFsChange);
});

onBeforeUnmount(() => {
  recordReadingSession();
  window.removeEventListener('keydown', onKey);
  document.removeEventListener('fullscreenchange', onFsChange);
  clearTimeout(saveTimer);
  clearTimeout(chromeTimer);
  try { ro?.disconnect(); } catch {}
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
  try { rendition?.destroy(); } catch {}
  try { book?.destroy(); } catch {}
});
</script>

<template>
  <div ref="shellRef" class="shell" :class="{ immersive }">
    <div class="bar top" :class="{ hidden: immersive && !chromeVisible }">
      <button class="btn ghost small" @click="leave">{{ immersive ? '✕ Exit' : '← Library' }}</button>
      <h3 class="serif title" v-if="meta">{{ meta.title }}</h3>
      <span v-if="meta?.author" class="muted small author">{{ meta.author }}</span>
      <button class="btn ghost small" @click="addBookmark" title="Save bookmark">Bookmark</button>
      <button class="btn ghost small" @click="showBookmarks = !showBookmarks" title="Show bookmarks">
        Marks {{ bookmarks.length || '' }}
      </button>
      <button class="btn ghost small" @click="toggleImmersive"
              :title="immersive ? 'Exit full screen (Esc)' : 'Full screen (F)'">
        {{ immersive ? '⤡' : '⤢' }}
      </button>
    </div>
    <div v-if="bookmarkMsg" class="muted small bookmsg">{{ bookmarkMsg }}</div>
    <div v-if="showBookmarks" class="marks">
      <div v-if="!bookmarks.length" class="muted small">No bookmarks yet.</div>
      <div v-for="b in bookmarks" :key="b.id" class="markrow">
        <button class="marklink" @click="goBookmark(b)">{{ b.label || b.loc }}</button>
        <span class="muted small">{{ new Date(b.created_at + 'Z').toLocaleDateString() }}</span>
        <button class="delx" @click="deleteBookmark(b)">x</button>
      </div>
    </div>

    <p v-if="err" class="err">{{ err }}</p>

    <div class="viewport">
      <div v-show="kind !== 'pdf'" ref="containerRef" class="page"></div>
      <div v-if="kind === 'pdf'" class="page">
        <PdfView ref="pdfRef" :src="`/api/library/${bookId}/file`"
                 :start-page="meta?.last_loc || 1"
                 @located="onPdfLocated" @error="e => err = 'Could not open PDF: ' + e" />
      </div>
      <!-- Tap zones: the left/right thirds page, so a thumb works without
           hunting for a button. They sit under the text, not over it, so
           selecting and following links still behave. -->
      <button class="tap left"  aria-label="Previous page" @click="prev"></button>
      <button class="tap right" aria-label="Next page"     @click="next"></button>
    </div>

    <div class="bar bottom" :class="{ hidden: immersive && !chromeVisible }">
      <button class="btn ghost" @click="prev">← Prev</button>
      <template v-if="kind === 'pdf' && pdfRef?.pageCount">
        <span class="muted small" style="white-space:nowrap">
          {{ pdfRef.page }} / {{ pdfRef.pageCount }}
        </span>
        <button class="btn ghost small" title="Zoom out" @click="pdfRef.zoomOut()">−</button>
        <button class="btn ghost small" title="Zoom in" @click="pdfRef.zoomIn()">+</button>
      </template>
      <button class="btn ghost" @click="next">Next →</button>
    </div>
    <!-- Keyboard hints are noise on a touch device and were crowding the paging
         buttons, so they're hidden there rather than just made smaller. -->
    <p v-if="!immersive" class="muted small hint">
      Arrow keys or space flip pages · <strong>F</strong> for full screen · bookmark saves automatically.
    </p>
  </div>
</template>

<style scoped>
.shell { padding: 14px 4px; display: flex; flex-direction: column; }
.viewport { position: relative; flex: 1; min-height: 0; }
.page {
  height: 78vh;
  background: #fdfaf2;
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
}

.bar {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: #f4eee0;
}
.bar.top { margin-bottom: 10px; }
.bar.bottom { gap: 8px; justify-content: center; margin-top: 12px; }
.bookmsg { position: relative; z-index: 5; text-align: right; }
.marks {
  position: relative;
  z-index: 6;
  background: #fbf7ec;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  padding: 8px 10px;
  margin: -2px 0 10px;
}
.markrow { display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--line-soft); padding: 7px 0; }
.markrow:first-child { border-top: 0; }
.marklink { flex: 1; text-align: left; border: 0; background: transparent; color: var(--ox); padding: 0; font-size: 15px; }
.title { margin: 0; flex: 1; font-size: 20px; }
.author { white-space: nowrap; }
.err { color: var(--ox); }
.hint { text-align: center; margin-top: 8px; }

/* Tap zones sit behind the rendered text (z-index 0 vs epub.js's iframe) and
   only claim the outer thirds, so the middle stays selectable. */
.tap {
  position: absolute; top: 0; bottom: 0; width: 22%;
  border: 0; background: transparent; cursor: pointer; z-index: 0;
}
.tap.left { left: 0; }
.tap.right { right: 0; }

/* Full screen. position:fixed rather than :fullscreen so this works identically
   whether or not the Fullscreen API was granted — iOS never grants it. */
.shell.immersive {
  position: fixed; inset: 0; z-index: 1000;
  margin: 0; padding: 8px 10px;
  background: #fdfaf2;
  /* Keep clear of the notch and the home indicator. */
  padding-top: max(8px, env(safe-area-inset-top));
  padding-bottom: max(8px, env(safe-area-inset-bottom));
}
.shell.immersive .page {
  height: 100%;
  border: 0; border-radius: 0; background: #fdfaf2;
}
.shell.immersive .bar {
  transition: opacity .25s ease;
}
.shell.immersive .bar.hidden {
  opacity: 0;
  pointer-events: none;   /* faded bars must not eat taps meant for the page */
}

/* A device with no hover and a coarse pointer is a phone or tablet: the
   keyboard hint is meaningless there, and it was squeezing Prev/Next into the
   same line and making them hard to hit. Keyed off the input device rather
   than width, because a narrow desktop window still has a keyboard. */
@media (hover: none) and (pointer: coarse) {
  .hint { display: none; }

  /* Paging is the primary action on a touch screen, so give it real buttons
     that split the width instead of two small centred ones. */
  .bar.bottom {
    gap: 10px;
    margin-top: 10px;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .bar.bottom > .btn {
    flex: 1 1 0;
    min-height: 46px;
    font-size: 17px;
    background: #fbf3e0;          /* opaque: page text must not read through */
  }
  /* The PDF page counter and zoom keep their natural size between them. */
  .bar.bottom > .btn.small { flex: 0 0 auto; min-width: 46px; }
}
</style>
