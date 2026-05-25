<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';

const router = useRouter();
const books = ref([]);
const tocs = reactive({});            // slug -> [{slug, title, url}]
const openBook = ref(null);            // book slug currently expanded
const loadingToc = ref(null);
const tocErr = reactive({});

const reading = ref(null);             // { bookTitle, chapterTitle, url, html }
const readBusy = ref(false);
const readErr = ref('');
const contentRef = ref(null);

async function load() {
  try { books.value = await api.get('/escriva/books'); }
  catch (e) { tocErr['books'] = e.message; }
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
    tocErr[slug] = `Could not fetch table of contents: ${e.message}`;
  } finally {
    loadingToc.value = null;
  }
}

async function openChapter(book, chapter) {
  readBusy.value = true; readErr.value = '';
  reading.value = { bookTitle: book.title, chapterTitle: chapter.title, url: chapter.url, html: '' };
  setTimeout(() => contentRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  try {
    const data = await api.get(`/escriva/${book.slug}/chapter?ch=${encodeURIComponent(chapter.slug)}`);
    reading.value.html = data.html;
  } catch (e) {
    readErr.value = `Could not load chapter: ${e.message}`;
  } finally {
    readBusy.value = false;
  }
}

function close() { reading.value = null; readErr.value = ''; }

onMounted(load);
</script>

<template>
  <div style="padding:24px 4px">
    <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn ghost small" @click="router.push('/reading')">← Library</button>
      <h2 class="serif" style="margin:0;font-size:24px">Escrivá library</h2>
      <span class="muted small">content from escriva.org</span>
    </div>

    <div class="card">
      <p class="muted small" style="margin:0 0 12px">
        Tap a book, then a chapter — the text renders inside the app.
        Use <em>↗</em> next to any chapter to open it directly on escriva.org instead.
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
            <li v-if="tocs[b.slug].length === 0" class="muted small" style="padding:4px 8px;list-style:none">
              No chapters parsed — escriva.org may have changed structure.
            </li>
            <li v-for="c in tocs[b.slug]" :key="c.url">
              <button class="ch-link" @click="openChapter(b, c)">{{ c.title }}</button>
              <a class="ch-out" :href="c.url" target="_blank" rel="noopener" title="Open on escriva.org">↗</a>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div v-if="reading" class="card" ref="contentRef">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <h3 class="serif" style="margin:0;flex:1">
          {{ reading.bookTitle }} <span class="muted small">·</span> {{ reading.chapterTitle }}
        </h3>
        <a class="btn ghost small" :href="reading.url" target="_blank" rel="noopener">On escriva.org ↗</a>
        <button class="btn ghost small" @click="close">Close</button>
      </div>
      <p v-if="readBusy" class="muted small">Loading…</p>
      <p v-if="readErr" style="color:var(--ox)">{{ readErr }}</p>
      <div v-if="reading.html" v-html="reading.html" class="escriva-content"></div>
      <p class="muted small" style="margin-top:10px;font-style:italic">
        Text © Fundación Studium / Opus Dei. Served from escriva.org.
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
</style>

<style>
/* Unscoped so v-html content inherits these */
.escriva-content{font-family:var(--body);line-height:1.65;font-size:17px;color:var(--ink);
                 max-width:680px;margin:0 auto}
.escriva-content h1,
.escriva-content h2{font-family:var(--serif);color:var(--ox);margin-top:1.4em}
.escriva-content .point-number{display:inline-block;font-family:var(--serif);font-weight:600;color:var(--gold);
                               margin-right:.5em;min-width:2em}
.escriva-content p{margin:.8em 0}
.escriva-content a{color:var(--ox)}
.escriva-content blockquote{border-left:3px solid var(--gold);padding-left:1em;color:var(--ink-soft);
                            margin:1em 0;font-style:italic}
</style>
