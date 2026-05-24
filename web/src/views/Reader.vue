<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ePub from 'epubjs';
import { api } from '../api.js';

const route = useRoute();
const router = useRouter();
const bookId = Number(route.params.id);

const containerRef = ref(null);
const meta = ref(null);
const err = ref('');
let book = null;
let rendition = null;
let saveTimer = null;

async function init() {
  try {
    const all = await api.get('/library');
    meta.value = all.find(b => b.id === bookId);
    if (!meta.value?.epub_path) {
      err.value = 'No EPUB uploaded for this book. Upload one from the Reading tab first.';
      return;
    }
    book = ePub(`/api/library/${bookId}/file`, { openAs: 'epub' });
    rendition = book.renderTo(containerRef.value, {
      width: '100%', height: '78vh', flow: 'paginated', spread: 'auto',
    });
    rendition.themes.default({
      body: { 'font-family': 'Spectral, Georgia, serif', 'color': '#2a2620', 'background': '#fdfaf2' },
      'p, li': { 'font-size': '17px', 'line-height': '1.55' },
      'a': { 'color': '#742a2a' },
    });
    await rendition.display(meta.value.last_loc || undefined);

    rendition.on('relocated', (loc) => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        api.patch(`/library/${bookId}`, { last_loc: loc.start.cfi }).catch(() => {});
      }, 600);
    });
  } catch (e) {
    err.value = 'Could not open EPUB: ' + (e?.message || 'unknown error');
  }
}

function next() { rendition?.next(); }
function prev() { rendition?.prev(); }

function onKey(e) {
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
  if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   { e.preventDefault(); prev(); }
}

onMounted(() => { init(); window.addEventListener('keydown', onKey); });
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  clearTimeout(saveTimer);
  try { rendition?.destroy(); } catch {}
  try { book?.destroy(); } catch {}
});
</script>

<template>
  <div style="padding:14px 4px">
    <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px;flex-wrap:wrap">
      <button class="btn ghost small" @click="router.push('/reading')">← Library</button>
      <h3 class="serif" v-if="meta" style="margin:0;flex:1;font-size:20px">{{ meta.title }}</h3>
      <span v-if="meta?.author" class="muted small">{{ meta.author }}</span>
    </div>

    <p v-if="err" style="color:var(--ox)">{{ err }}</p>

    <div ref="containerRef"
         style="background:#fdfaf2;border:1px solid var(--line);border-radius:10px;overflow:hidden"></div>

    <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
      <button class="btn ghost" @click="prev">← Prev</button>
      <button class="btn ghost" @click="next">Next →</button>
    </div>
    <p class="muted small" style="text-align:center;margin-top:8px">
      Arrow keys flip pages. Bookmark saves automatically.
    </p>
  </div>
</template>
