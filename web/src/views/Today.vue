<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api.js';

const today = new Date().toISOString().slice(0, 10);

const norms = ref([]);
const doneIds = ref(new Set());
const history = ref({});           // 'YYYY-MM-DD' -> [normId, ...]
const bricks = ref([]);
const examen = ref({ date: today, gratitude: '', struggle: '', resolution: '' });
const newBrick = ref('');
const savedMsg = ref('');

const dailyNorms = computed(() => norms.value.filter(n => n.cadence === 'daily'));
const rhythmNorms = computed(() => norms.value.filter(n => n.cadence !== 'daily'));
const doneToday = computed(() => dailyNorms.value.filter(n => doneIds.value.has(n.id)).length);
const planPct = computed(() => dailyNorms.value.length
  ? Math.round(100 * doneToday.value / dailyNorms.value.length) : 0);

const planStreak = computed(() => {
  if (dailyNorms.value.length === 0) return 0;
  const dailyIds = dailyNorms.value.map(n => n.id);
  let s = 0;
  const d = new Date();
  for (let i = 0; i < 400; i++) {
    const k = d.toISOString().slice(0, 10);
    const m = new Set(history.value[k] || []);
    const all = dailyIds.every(id => m.has(id));
    if (all) s++;
    else if (k === today) { d.setDate(d.getDate() - 1); continue; }
    else break;
    d.setDate(d.getDate() - 1);
  }
  return s;
});

const prettyDate = computed(() =>
  new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));

async function load() {
  const [n, log, hist, br, ex] = await Promise.all([
    api.get('/norms'),
    api.get(`/norms/log?date=${today}`),
    api.get('/norms/history?days=400'),
    api.get(`/goals/bricks?date=${today}`),
    api.get(`/examen?date=${today}`),
  ]);
  norms.value = n;
  doneIds.value = new Set(log.done);
  history.value = hist.history || {};
  bricks.value = br;
  examen.value = ex;
}

async function toggleNorm(id) {
  // optimistic UI
  const wasDone = doneIds.value.has(id);
  const next = new Set(doneIds.value);
  wasDone ? next.delete(id) : next.add(id);
  doneIds.value = next;
  const histToday = new Set(history.value[today] || []);
  wasDone ? histToday.delete(id) : histToday.add(id);
  history.value = { ...history.value, [today]: [...histToday] };
  try { await api.post(`/norms/${id}/log`, { date: today }); }
  catch (e) { await load(); }
}

async function addBrick() {
  const t = newBrick.value.trim();
  if (!t) return;
  await api.post('/goals/bricks', { title: t, date: today });
  newBrick.value = '';
  bricks.value = await api.get(`/goals/bricks?date=${today}`);
}

async function toggleBrick(b) {
  b.done = b.done ? 0 : 1;
  await api.patch(`/goals/bricks/${b.id}`, { done: b.done });
}

async function delBrick(id) {
  await api.del(`/goals/bricks/${id}`);
  bricks.value = bricks.value.filter(b => b.id !== id);
}

async function saveExamen() {
  await api.put('/examen', { date: today, ...examen.value });
  savedMsg.value = 'Day closed. Rest well.';
  setTimeout(() => savedMsg.value = '', 3500);
}

onMounted(load);
</script>

<template>
  <div style="padding:24px 4px">
    <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:14px">
      <h2 class="serif" style="font-size:26px;margin:0">Today</h2>
      <span class="muted small">{{ prettyDate }}</span>
    </div>

    <!-- Plan of Life -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <h2 style="margin:0">The Plan of Life</h2>
        <span class="chip">🔥 {{ planStreak }} day{{ planStreak === 1 ? '' : 's' }} kept</span>
      </div>
      <p class="muted small" style="margin:.2em 0 .6em">
        The norms first. Everything else compounds off the interior life — so this is the foundation, not a to-do list.
      </p>
      <div class="bar"><i :style="{ width: planPct + '%' }"></i></div>
      <p class="small muted" style="margin:6px 0 2px">
        {{ doneToday }} of {{ dailyNorms.length }} daily norms today
      </p>

      <div class="sectlabel">Daily</div>
      <div v-for="n in dailyNorms" :key="n.id" class="row" :class="{ done: doneIds.has(n.id) }">
        <button class="tick" :class="{ done: doneIds.has(n.id) }" @click="toggleNorm(n.id)">✓</button>
        <div class="rowtext">
          <span class="main">{{ n.name }}</span>
          <div class="sub" v-if="n.sub">{{ n.sub }}</div>
        </div>
      </div>

      <div class="sectlabel">Weekly &amp; beyond</div>
      <div v-for="n in rhythmNorms" :key="n.id" class="row" :class="{ done: doneIds.has(n.id) }">
        <button class="tick" :class="{ done: doneIds.has(n.id) }" @click="toggleNorm(n.id)">✓</button>
        <div class="rowtext">
          <span class="main">{{ n.name }}<span class="cad">{{ n.cadence }}</span></span>
          <div class="sub" v-if="n.sub">{{ n.sub }}</div>
        </div>
      </div>

      <p v-if="norms.length === 0" class="muted small" style="margin-top:8px">
        No norms yet. Run <code>npm run seed:lifeos</code> on the server to load the defaults.
      </p>
    </div>

    <!-- Bricks -->
    <div class="card">
      <h2>Today's bricks</h2>
      <p class="muted small" style="margin:.1em 0 .6em">
        The brick &amp; mortar — small, concrete acts that build the goals. Three is plenty.
      </p>
      <div v-if="bricks.length === 0" class="muted small" style="padding:6px 4px">
        No bricks yet. Add one below.
      </div>
      <div v-for="b in bricks" :key="b.id" class="row" :class="{ done: b.done }">
        <button class="tick" :class="{ done: b.done }" @click="toggleBrick(b)">✓</button>
        <div class="rowtext"><span class="main">{{ b.title }}</span></div>
        <button class="delx" @click="delBrick(b.id)">×</button>
      </div>
      <div class="addbar">
        <input class="field" type="text" v-model="newBrick"
               placeholder="e.g. Move 30k to the house fund · call Fr. for direction"
               @keyup.enter="addBrick">
        <button class="btn" @click="addBrick">Add</button>
      </div>
    </div>

    <!-- Examen -->
    <div class="card">
      <h2>Nightly examen</h2>
      <p class="muted small" style="margin:.1em 0 .6em">
        A short examination of conscience before bed. Honest, brief, hopeful.
      </p>
      <div class="sectlabel" style="margin-top:6px">What am I grateful for today?</div>
      <textarea class="field" v-model="examen.gratitude" rows="2"
                placeholder="A grace, a small mercy…"></textarea>
      <div class="sectlabel">Where did I fight well? Where did I fall?</div>
      <textarea class="field" v-model="examen.struggle" rows="3"
                placeholder="The custody of the heart, the spending, patience with the children…"></textarea>
      <div class="sectlabel">One resolution for tomorrow</div>
      <input class="field" type="text" v-model="examen.resolution"
             placeholder="One small, specific thing.">
      <div style="margin-top:10px">
        <button class="btn" @click="saveExamen">Close the day</button>
        <span class="small muted" v-if="savedMsg" style="margin-left:10px">{{ savedMsg }}</span>
      </div>
    </div>
  </div>
</template>
