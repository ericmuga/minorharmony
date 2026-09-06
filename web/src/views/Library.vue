<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';

const router = useRouter();
const books = ref([]);
const np = reactive({ title: '', author: '', tag: '', url: '' });
const editing = ref(null);                // book being edited (or null)
const uploadingId = ref(null);
const fileInputs = ref({});               // bookId -> input ref

// ---- bulk import ----
const bulkInput = ref(null);
const importing = ref(false);
const importErr = ref('');
const review = ref(null);                 // { importId, items[], books[] } or null
const committing = ref(false);
const importSummary = ref('');

async function load() {
  books.value = await api.get('/library');
}

function pickFile(bookId) {
  fileInputs.value[bookId]?.click();
}

async function onFile(bookId, ev) {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  if (!/\.epub$/i.test(file.name)) { alert('Pick a .epub file'); return; }
  if (file.size > 50 * 1024 * 1024) { alert('Too large — 50 MB max'); return; }
  uploadingId.value = bookId;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/library/${bookId}/file`, {
      method: 'POST', credentials: 'include', body: fd,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    await load();
  } catch (e) {
    alert('Upload failed: ' + e.message);
  } finally {
    uploadingId.value = null;
  }
}

// Phase 1: upload everything to staging and get back the proposed mapping.
// Nothing is written to the library until the user confirms in phase 2.
async function onBulkFiles(ev) {
  const files = Array.from(ev.target.files || []);
  ev.target.value = '';
  if (!files.length) return;

  const bad = files.filter(f => !/\.epub$/i.test(f.name));
  if (bad.length) { importErr.value = `Not an .epub: ${bad.map(f => f.name).join(', ')}`; return; }
  const tooBig = files.filter(f => f.size > 50 * 1024 * 1024);
  if (tooBig.length) { importErr.value = `Over 50 MB: ${tooBig.map(f => f.name).join(', ')}`; return; }

  importErr.value = ''; importSummary.value = ''; importing.value = true;
  try {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const res = await fetch('/api/library/import', { method: 'POST', credentials: 'include', body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    const data = await res.json();
    // Pre-tick only what the server was confident about; everything else the
    // user has to look at. A file that would replace an existing EPUB is never
    // pre-ticked, however well the title matched.
    for (const it of data.items) it.include = it.confident;
    review.value = data;
  } catch (e) {
    importErr.value = 'Import failed: ' + e.message;
  } finally {
    importing.value = false;
  }
}

// Phase 2: commit the (possibly edited) decisions.
async function commitImport() {
  const r = review.value;
  if (!r) return;
  committing.value = true;
  try {
    const decisions = r.items.map(it => ({
      stagedAs: it.stagedAs,
      action: it.include ? it.action : 'skip',
      bookId: it.bookId,
      title: it.guess?.title,
      author: it.guess?.author,
    }));
    const out = await api.post(`/library/import/${r.importId}/commit`, { decisions });
    const done = out.results.filter(x => x.ok && x.action !== 'skip').length;
    const failed = out.results.filter(x => !x.ok);
    importSummary.value = `Imported ${done} file${done === 1 ? '' : 's'}.` +
      (failed.length ? ` ${failed.length} failed: ${failed.map(f => f.error).join(', ')}` : '');
    review.value = null;
    await load();
  } catch (e) {
    importErr.value = 'Commit failed: ' + e.message;
  } finally {
    committing.value = false;
  }
}

async function cancelImport() {
  const id = review.value?.importId;
  review.value = null;
  if (id) await api.del(`/library/import/${id}`).catch(() => {});
}

function kb(n) { return n >= 1024 * 1024 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }

async function removeFile(b) {
  if (!confirm(`Remove the uploaded EPUB for "${b.title}"?`)) return;
  await api.del(`/library/${b.id}/file`);
  await load();
}

function read(b) {
  router.push(`/reading/${b.id}/read`);
}

async function add() {
  if (!np.title.trim()) return;
  const { id } = await api.post('/library', {
    title: np.title.trim(),
    author: np.author.trim() || null,
    tag: np.tag.trim() || null,
    url: np.url.trim() || null,
  });
  books.value.push({ id, title: np.title, author: np.author, tag: np.tag, url: np.url, state: 'to read' });
  np.title = ''; np.author = ''; np.tag = ''; np.url = '';
}

async function cycle(b) {
  const { state } = await api.post(`/library/${b.id}/cycle`, {});
  b.state = state;
}

async function del(b) {
  await api.del(`/library/${b.id}`);
  books.value = books.value.filter(x => x.id !== b.id);
}

function startEdit(b) {
  editing.value = { ...b };
}
async function saveEdit() {
  const e = editing.value;
  await api.patch(`/library/${e.id}`, {
    title: e.title, author: e.author, tag: e.tag, url: e.url,
  });
  const idx = books.value.findIndex(x => x.id === e.id);
  if (idx >= 0) books.value[idx] = { ...books.value[idx], ...e };
  editing.value = null;
}

onMounted(load);
</script>

<template>
  <div style="padding:24px 4px">
    <div class="card">
      <h2>Formation — books &amp; audio</h2>
      <p class="muted small" style="margin:.1em 0 .6em">
        Read with a pencil. Tap the status to move a title along. Tied to the battles you named.
        <br>The Escrivá works are freely hosted at
        <a href="https://escriva.org/en/" target="_blank" rel="noopener">escriva.org</a> —
        <router-link to="/reading/escriva">browse them inside the app ›</router-link>
      </p>

      <div v-for="b in books" :key="b.id" class="row" style="align-items:center;flex-wrap:wrap;gap:6px">
        <div class="rowtext" style="min-width:160px">
          <span class="main">{{ b.title }}</span>
          <div class="meta">
            <span v-if="b.author">{{ b.author }}</span>
            <span v-if="b.tag"> · <span style="color:var(--gold)">{{ b.tag }}</span></span>
          </div>
        </div>

        <button v-if="b.epub_path" class="btn small" @click="read(b)">Read</button>
        <button v-else class="btn ghost small" :disabled="uploadingId === b.id"
                @click="pickFile(b.id)">
          {{ uploadingId === b.id ? 'Uploading…' : 'Upload .epub' }}
        </button>
        <button v-if="b.epub_path" class="btn ghost small" @click="removeFile(b)" title="Remove the EPUB file">⌫ file</button>
        <input type="file" accept=".epub,application/epub+zip" style="display:none"
               :ref="el => { if (el) fileInputs[b.id] = el }"
               @change="onFile(b.id, $event)">

        <a v-if="b.url" :href="b.url" target="_blank" rel="noopener" class="openlink">Open ↗</a>
        <span class="state" @click="cycle(b)">{{ b.state }}</span>
        <button class="btn ghost small" @click="startEdit(b)">Edit</button>
        <button class="delx" @click="del(b)">×</button>
      </div>

      <div v-if="books.length === 0" class="muted small" style="padding:6px 4px">
        No titles yet. Add one below — or run <code>npm run seed:lifeos</code> on the server for the defaults.
      </div>

      <div class="sectlabel">Import a shelf</div>
      <p class="muted small" style="margin:.1em 0 .6em">
        Drop in several <code>.epub</code> files at once. Each is matched against the titles
        above by filename; anything that doesn't match becomes a new entry. You confirm
        before anything is saved.
      </p>
      <div class="addbar">
        <button class="btn ghost" :disabled="importing" @click="bulkInput?.click()">
          {{ importing ? 'Uploading…' : 'Choose .epub files…' }}
        </button>
        <input ref="bulkInput" type="file" multiple accept=".epub,application/epub+zip"
               style="display:none" @change="onBulkFiles">
      </div>
      <p v-if="importErr" class="small" style="color:var(--ox)">{{ importErr }}</p>
      <p v-if="importSummary" class="small" style="color:var(--gold)">{{ importSummary }}</p>
    </div>

    <!-- Review the proposed mapping before committing -->
    <div v-if="review" class="card" style="border-left:3px solid var(--gold)">
      <h3 style="margin-top:0">Review {{ review.items.length }} file{{ review.items.length === 1 ? '' : 's' }}</h3>
      <p class="muted small">
        Untick anything you don't want. Files that would replace an EPUB you already have are
        left unticked on purpose.
      </p>

      <div v-for="it in review.items" :key="it.stagedAs" class="improw">
        <input type="checkbox" v-model="it.include" style="margin-top:4px">
        <div style="flex:1;min-width:0">
          <div class="small" style="font-weight:600;word-break:break-all">{{ it.filename }}</div>
          <div class="small muted">{{ kb(it.size) }}</div>

          <div class="addbar" style="margin-top:4px">
            <select class="field" v-model="it.action">
              <option value="attach">Attach to existing title</option>
              <option value="create">Add as new title</option>
            </select>
            <select v-if="it.action === 'attach'" class="field" v-model="it.bookId">
              <option v-for="b in review.books" :key="b.id" :value="b.id">
                {{ b.title }}{{ b.hasFile ? ' — already has a file' : '' }}
              </option>
            </select>
          </div>

          <div v-if="it.action === 'create'" class="addbar" style="margin-top:4px">
            <input class="field" type="text" v-model="it.guess.title" placeholder="Title">
            <input class="field" type="text" v-model="it.guess.author" placeholder="Author">
          </div>

          <div class="small" style="margin-top:3px">
            <span v-if="it.action === 'attach' && it.matchedTitle" class="muted">
              matched “{{ it.matchedTitle }}” · confidence {{ it.score }}
            </span>
            <span v-if="it.replaces" style="color:var(--ox)"> · replaces the current EPUB</span>
            <span v-if="it.note" class="muted"> · {{ it.note }}</span>
          </div>
        </div>
      </div>

      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn" :disabled="committing" @click="commitImport">
          {{ committing ? 'Saving…' : `Import ${review.items.filter(i => i.include).length} selected` }}
        </button>
        <button class="btn ghost" :disabled="committing" @click="cancelImport">Cancel</button>
      </div>
    </div>

    <div class="card">
      <div class="sectlabel">Add a title</div>
      <input class="field" type="text" v-model="np.title" placeholder="Title" @keyup.enter="add">
      <div class="addbar">
        <input class="field" type="text" v-model="np.author" placeholder="Author">
        <input class="field" type="text" v-model="np.tag" placeholder="Tag (foundation, focus…)">
      </div>
      <div class="addbar">
        <input class="field" type="text" v-model="np.url" placeholder="Link (publisher, escrivaworks.org, Amazon…)">
        <button class="btn" @click="add">Add</button>
      </div>
    </div>

    <!-- edit modal-ish -->
    <div v-if="editing" class="card" style="border-left:3px solid var(--ox)">
      <h3 style="margin-top:0">Edit · {{ editing.title }}</h3>
      <input class="field" type="text" v-model="editing.title" placeholder="Title">
      <div class="addbar">
        <input class="field" type="text" v-model="editing.author" placeholder="Author">
        <input class="field" type="text" v-model="editing.tag" placeholder="Tag">
      </div>
      <div class="addbar">
        <input class="field" type="text" v-model="editing.url" placeholder="Link">
      </div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn" @click="saveEdit">Save</button>
        <button class="btn ghost" @click="editing = null">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.meta{font-size:12.5px;color:var(--ink-soft)}
.state{font-family:var(--serif);font-size:14px;color:var(--ox);cursor:pointer;border:1px solid var(--line);
       border-radius:20px;padding:2px 11px;background:#fbf3e0;white-space:nowrap}
.openlink{font-family:var(--serif);font-size:14px;color:var(--ox);text-decoration:none;
          border:1px solid var(--line);border-radius:20px;padding:2px 10px;background:#fdfaf2;white-space:nowrap}
.openlink:hover{background:#fbf3e0}
.improw{display:flex;gap:10px;align-items:flex-start;padding:8px 2px;border-top:1px solid var(--line-soft)}
.improw:first-of-type{border-top:0}
</style>
