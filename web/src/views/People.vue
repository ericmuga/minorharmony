<script setup>
import { ref, reactive, onMounted } from 'vue';
import { api } from '../api.js';

const list = ref([]);
const np = reactive({ name: '', role: '', next_ask: '', notes: '' });
const editing = ref(null);

async function load() {
  list.value = await api.get('/people');
}

async function add() {
  if (!np.name.trim()) return;
  const { id } = await api.post('/people', {
    name: np.name.trim(),
    role: np.role.trim() || null,
    next_ask: np.next_ask.trim() || null,
    notes: np.notes.trim() || null,
  });
  list.value.push({
    id, name: np.name, role: np.role, last_contact: null,
    next_ask: np.next_ask, notes: np.notes,
  });
  np.name = ''; np.role = ''; np.next_ask = ''; np.notes = '';
}

async function bump(p) {
  const { last_contact } = await api.post(`/people/${p.id}/contact`, {});
  p.last_contact = last_contact;
}

async function del(p) {
  if (!confirm(`Remove ${p.name}?`)) return;
  await api.del(`/people/${p.id}`);
  list.value = list.value.filter(x => x.id !== p.id);
}

function startEdit(p) { editing.value = { ...p }; }
async function saveEdit() {
  const e = editing.value;
  await api.patch(`/people/${e.id}`, {
    name: e.name, role: e.role, next_ask: e.next_ask, notes: e.notes, last_contact: e.last_contact,
  });
  const idx = list.value.findIndex(x => x.id === e.id);
  if (idx >= 0) list.value[idx] = { ...list.value[idx], ...e };
  editing.value = null;
}

onMounted(load);
</script>

<template>
  <div style="padding:24px 4px">
    <div class="card">
      <h2 style="margin-top:0">Counsel &amp; connections</h2>
      <p class="muted small" style="margin:0">
        Your real board of advisors. Street smarts and big-tech doors open through people, not
        applications. Keep the relationships warm — note the last contact and the next ask.
      </p>
    </div>

    <div class="card">
      <div v-for="p in list" :key="p.id" class="row person" style="align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div class="rowtext" style="min-width:200px">
          <span class="nm">{{ p.name }}</span>
          <span class="muted small" v-if="p.role"> · {{ p.role }}</span>
          <div class="sub">
            Last: {{ p.last_contact || '—' }}
            · Next: <em>{{ p.next_ask || 'set an ask' }}</em>
          </div>
          <div class="sub" v-if="p.notes" style="margin-top:4px">{{ p.notes }}</div>
        </div>
        <button class="btn ghost small" @click="bump(p)" title="Mark contacted today">Reached out</button>
        <button class="btn ghost small" @click="startEdit(p)">Edit</button>
        <button class="delx" @click="del(p)">×</button>
      </div>

      <div v-if="list.length === 0" class="muted small" style="padding:6px 4px">
        No one yet. Add someone below, or run <code>npm run seed:lifeos</code> on the server for the prototype's defaults.
      </div>

      <div class="sectlabel">Add someone</div>
      <input class="field" type="text" v-model="np.name" placeholder="Name">
      <div class="addbar">
        <input class="field" type="text" v-model="np.role" placeholder="Who they are (mentor, recruiter, friend…)">
        <input class="field" type="text" v-model="np.next_ask" placeholder="Next ask / step">
      </div>
      <div class="addbar">
        <input class="field" type="text" v-model="np.notes" placeholder="Notes (optional)">
        <button class="btn" @click="add">Add</button>
      </div>
    </div>

    <div v-if="editing" class="card" style="border-left:3px solid var(--ox)">
      <h3 style="margin-top:0">Edit · {{ editing.name }}</h3>
      <input class="field" type="text" v-model="editing.name" placeholder="Name">
      <div class="addbar">
        <input class="field" type="text" v-model="editing.role" placeholder="Role">
        <input class="field" type="text" v-model="editing.last_contact" placeholder="Last contact (YYYY-MM-DD)">
      </div>
      <div class="addbar">
        <input class="field" type="text" v-model="editing.next_ask" placeholder="Next ask / step">
      </div>
      <textarea class="field" v-model="editing.notes" rows="2" placeholder="Notes"></textarea>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn" @click="saveEdit">Save</button>
        <button class="btn ghost" @click="editing = null">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nm{font-family:var(--serif);font-size:18px}
</style>
