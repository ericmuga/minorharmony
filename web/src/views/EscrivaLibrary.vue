<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';

const router = useRouter();
const books = ref([]);
const tocs = reactive({});            // slug -> [{title, url}]
const openBook = ref(null);            // slug of expanded book
const loadingToc = ref(null);
const tocErr = reactive({});           // slug -> error message
const reading = ref(null);             // { title, url } currently in iframe
const iframeRef = ref(null);

async function load() {
  books.value = await api.get('/escriva/books');
}

async function toggleBook(slug) {
  if (openBook.value === slug) { openBook.value = null; return; }
  openBook.value = slug;
  if (tocs[slug] || loadingToc.value === slug) return;
  loadingToc.value = slug;
  tocErr[slug] = '';
  try {
    const res = await api.get(`/escriva/${slug}/toc`);
    tocs[slug] = res.chapters;
  } catch (e) {
    tocErr[slug] = e.message || 'Could not fetch table of contents';
  } finally {
    loadingToc.value = null;
  }
}

function readChapter(book, chapter) {
  reading.value = { title: `${book.title} · ${chapter.title}`, url: chapter.url };
  // scroll the iframe into view after Vue re-renders
  setTimeout(() => iframeRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function close() { reading.value = null; }

onMounted(load);
</script>

<template>
  <div style="padding:24px 4px">
    <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn ghost small" @click="router.push('/reading')">← Library</button>
      <h2 class="serif" style="margin:0;font-size:24px">Escrivá library</h2>
      <span class="muted small">via escriva.org</span>
    </div>

    <div class="card">
      <p class="muted small" style="margin:0 0 12px">
        Tap a book, then a chapter. The text opens here without leaving the app
        — or use <em>Open in new tab ↗</em> if you prefer a full window.
      </p>

      <div v-for="b in books" :key="b.slug" class="acc-book">
        <button class="acc-head" @click="toggleBook(b.slug)" :aria-expanded="openBook === b.slug">
          <span class="serif">{{ b.title }}</span>
          <span class="muted small">{{ openBook === b.slug ? '▾' : '▸' }}</span>
        </button>
        <div v-if="openBook === b.slug" class="acc-body">
          <p v-if="loadingToc === b.slug" class="muted small" style="padding:4px 8px">Loading chapters…</p>
          <p v-if="tocErr[b.slug]" style="color:var(--ox);padding:4px 8px">{{ tocErr[b.slug] }}</p>
          <ul v-if="tocs[b.slug]" class="chapters">
            <li v-for="c in tocs[b.slug]" :key="c.url">
              <button class="ch-link" @click="readChapter(b, c)">{{ c.title }}</button>
              <a class="ch-out" :href="c.url" target="_blank" rel="noopener" title="Open in new tab">↗</a>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div v-if="reading" class="card" ref="iframeRef">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <h3 class="serif" style="margin:0;flex:1">{{ reading.title }}</h3>
        <a class="btn ghost small" :href="reading.url" target="_blank" rel="noopener">Open in new tab ↗</a>
        <button class="btn ghost small" @click="close">Close</button>
      </div>
      <iframe :src="reading.url" class="reader-frame"
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              referrerpolicy="no-referrer"></iframe>
      <p class="muted small" style="margin-top:6px">
        If the panel stays blank, escriva.org may have started blocking embedded views.
        Use <em>Open in new tab</em> as a fallback.
      </p>
    </div>
  </div>
</template>

<style scoped>
.acc-book{border:1px solid var(--line-soft);border-radius:10px;margin-bottom:8px;overflow:hidden;background:#fbf7ec}
.acc-head{width:100%;display:flex;justify-content:space-between;align-items:center;padding:11px 14px;
          background:transparent;border:0;cursor:pointer;font-size:18px;color:var(--ink)}
.acc-head:hover{background:rgba(154,122,46,.06)}
.acc-body{padding:4px 8px 12px}
.chapters{list-style:none;padding:0;margin:0}
.chapters li{display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:6px}
.chapters li:hover{background:rgba(154,122,46,.06)}
.ch-link{flex:1;text-align:left;background:transparent;border:0;cursor:pointer;color:var(--ink);padding:5px 6px;
         font-family:var(--body);font-size:15px}
.ch-link:hover{color:var(--ox)}
.ch-out{color:var(--ink-soft);text-decoration:none;padding:2px 6px;font-size:14px}
.ch-out:hover{color:var(--ox)}
.reader-frame{width:100%;height:78vh;border:1px solid var(--line);border-radius:8px;background:#fdfaf2}
</style>
