<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const list = ref([]);
const newTitle = ref('');
const newNote = ref('');

async function load() {
  list.value = await api.get('/struggles');
}

async function setResult(s, result) {
  const r = await api.post(`/struggles/${s.id}/log`, { result });
  s.today = r.result;
  s.streak = r.streak;
}

async function add() {
  const t = newTitle.value.trim();
  if (!t) return;
  const { id } = await api.post('/struggles', { title: t, note: newNote.value.trim() || null });
  list.value.push({ id, title: t, note: newNote.value.trim() || null, streak: 0, today: null });
  newTitle.value = ''; newNote.value = '';
}

async function del(s) {
  if (!confirm(`Remove "${s.title}" and its log?`)) return;
  await api.del(`/struggles/${s.id}`);
  list.value = list.value.filter(x => x.id !== s.id);
}

onMounted(load);
</script>

<template>
  <div style="padding:24px 4px">
    <div class="card">
      <h2 style="margin-top:0">The particular examen</h2>
      <p class="muted small" style="margin:0">
        Opus Dei's instrument for real change: don't fight every fault at once. Choose <em>one</em>
        battle for a season, win it daily, then move to the next. This is also your "stop doing" list —
        but framed as growth in a virtue, because that is what lasts.
      </p>
    </div>

    <div v-for="s in list" :key="s.id" class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <h3 style="margin:0">{{ s.title }}</h3>
        <span class="chip">🔥 {{ s.streak }} day{{ s.streak === 1 ? '' : 's' }}</span>
      </div>
      <p class="muted small" v-if="s.note" style="margin:.3em 0">{{ s.note }}</p>

      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn" :class="{ ghost: s.today !== 'kept' }" @click="setResult(s, 'kept')">
          Kept custody today
        </button>
        <button class="btn ghost" @click="setResult(s, 'fell')"
                :style="s.today === 'fell' ? 'background:var(--ox);color:#f7f1e3;border-color:var(--ox)' : ''">
          Fell — begin again
        </button>
        <button class="delx" @click="del(s)" style="margin-left:auto">×</button>
      </div>
      <p class="small muted" v-if="s.today === 'fell'" style="margin-top:8px;font-style:italic">
        "To begin again" — the saint's phrase. A fall logged honestly is worth more than a streak kept by pretending.
      </p>
    </div>

    <div class="card">
      <div class="sectlabel" style="margin-top:0">Name a new battle (one at a time)</div>
      <input class="field" type="text" v-model="newTitle"
             placeholder="e.g. Custody of the heart" @keyup.enter="add">
      <div class="addbar">
        <input class="field" type="text" v-model="newNote"
               placeholder="A short note — the why or the practical resolve">
        <button class="btn" @click="add">Add</button>
      </div>
    </div>

    <p v-if="list.length === 0" class="muted small" style="padding:6px 4px">
      No battles yet. Add one above, or run <code>npm run seed:lifeos</code> on the server for the prototype's defaults.
    </p>
  </div>
</template>
