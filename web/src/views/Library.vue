<script setup>
import { ref, reactive, onMounted } from 'vue';
import { api } from '../api.js';

const books = ref([]);
const np = reactive({ title: '', author: '', tag: '' });

async function load() {
  books.value = await api.get('/library');
}

async function add() {
  if (!np.title.trim()) return;
  const { id } = await api.post('/library', {
    title: np.title.trim(),
    author: np.author.trim() || null,
    tag: np.tag.trim() || null,
  });
  books.value.push({ id, title: np.title, author: np.author, tag: np.tag, state: 'to read' });
  np.title = ''; np.author = ''; np.tag = '';
}

async function cycle(b) {
  const { state } = await api.post(`/library/${b.id}/cycle`, {});
  b.state = state;
}

async function del(b) {
  await api.del(`/library/${b.id}`);
  books.value = books.value.filter(x => x.id !== b.id);
}
onMounted(load);
</script>

<template>
  <div style="padding:24px 4px">
    <div class="card">
      <h2>Formation — books &amp; audio</h2>
      <p class="muted small" style="margin:.1em 0 .6em">
        Read with a pencil. Tap the status to move a title along. Tied to the battles you named.
      </p>

      <div v-for="b in books" :key="b.id" class="row" style="align-items:center">
        <div class="rowtext">
          <span class="main">{{ b.title }}</span>
          <div class="meta">
            <span v-if="b.author">{{ b.author }}</span>
            <span v-if="b.tag"> · <span style="color:var(--gold)">{{ b.tag }}</span></span>
          </div>
        </div>
        <span class="state" @click="cycle(b)">{{ b.state }}</span>
        <button class="delx" @click="del(b)">×</button>
      </div>

      <div v-if="books.length === 0" class="muted small" style="padding:6px 4px">
        No titles yet. Add one below — or run <code>npm run seed:lifeos</code> on the server for the defaults.
      </div>

      <div class="sectlabel">Add a title</div>
      <input class="field" type="text" v-model="np.title" placeholder="Title" @keyup.enter="add">
      <div class="addbar">
        <input class="field" type="text" v-model="np.author" placeholder="Author">
        <input class="field" type="text" v-model="np.tag" placeholder="Tag (foundation, focus…)">
        <button class="btn" @click="add">Add</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.meta{font-size:12.5px;color:var(--ink-soft)}
.state{font-family:var(--serif);font-size:14px;color:var(--ox);cursor:pointer;border:1px solid var(--line);
       border-radius:20px;padding:2px 11px;background:#fbf3e0;white-space:nowrap}
</style>
