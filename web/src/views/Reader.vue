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
let book = null;
let rendition = null;
let saveTimer = null;
let chromeTimer = null;
let ro = null;

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
    if (kind.value === 'pdf') return;      // PdfView takes it from here

    book = ePub(`/api/library/${bookId}/file`, { openAs: 'epub' });
    rendition = book.renderTo(containerRef.value, {
      width: '100%', height: '100%', flow: 'paginated', spread: 'auto',
    });
    applyTheme();
    await rendition.display(meta.value.last_loc || undefined);

    rendition.on('relocated', (loc) => {
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
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.patch(`/library/${bookId}`, { last_loc: loc }).catch(() => {});
  }, 600);
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
      <button class="btn ghost small" @click="toggleImmersive"
              :title="immersive ? 'Exit full screen (Esc)' : 'Full screen (F)'">
        {{ immersive ? '⤡' : '⤢' }}
      </button>
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

.bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.bar.top { margin-bottom: 10px; }
.bar.bottom { gap: 8px; justify-content: center; margin-top: 12px; }
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
</style>
