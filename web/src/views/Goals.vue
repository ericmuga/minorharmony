<script setup>
import { ref, reactive, onMounted } from 'vue';
import { api } from '../api.js';

const domains = ref([]);
const newGoalByDomain = reactive({});

async function load() {
  const data = await api.get('/goals');
  // attach a UI-only open flag (foundation domain expanded by default)
  domains.value = data.map(d => ({ ...d, open: !!d.is_foundation }));
}

function horizonLabel(h) {
  if (h === 'now') return 'this year';
  if (h === 'soon') return 'next';
  return 'horizon';
}

async function addGoal(d) {
  const title = (newGoalByDomain[d.id] || '').trim();
  if (!title) return;
  const { id } = await api.post(`/goals/domains/${d.id}/goals`, { title, horizon: 'soon' });
  d.goals.push({ id, title, why: null, horizon: 'soon', status: 'open' });
  newGoalByDomain[d.id] = '';
}

async function delGoal(d, g) {
  await api.del(`/goals/goals/${g.id}`);
  d.goals = d.goals.filter(x => x.id !== g.id);
}

async function cycleHorizon(g) {
  const order = ['now', 'soon', 'horizon'];
  g.horizon = order[(order.indexOf(g.horizon) + 1) % order.length];
  await api.patch(`/goals/goals/${g.id}`, { horizon: g.horizon });
}

onMounted(load);
</script>

<template>
  <div style="padding:24px 4px">
    <div class="card">
      <h2>One life, many spheres</h2>
      <p class="muted small" style="margin:0">
        Unity of life: these aren't seven competing priorities — they're one life ordered toward one end.
        Spirituality is the foundation the rest is built on, so it sits first.
      </p>
    </div>

    <div v-for="d in domains" :key="d.id" class="domain" :class="{ foundation: d.is_foundation }">
      <div class="dhead" @click="d.open = !d.open">
        <div class="dico">{{ d.glyph || '◦' }}</div>
        <div class="dn">
          {{ d.name }}
          <span v-if="d.is_foundation" class="pill foundation">foundation</span>
        </div>
        <div class="muted small">{{ d.goals.length }} goal{{ d.goals.length === 1 ? '' : 's' }} ▾</div>
      </div>
      <div class="dbody" v-show="d.open">
        <div v-for="g in d.goals" :key="g.id" class="goal">
          <div style="display:flex;align-items:flex-start;gap:8px">
            <div style="flex:1">
              {{ g.title }}
              <span v-if="g.horizon" class="pill" :class="g.horizon" @click.stop="cycleHorizon(g)"
                    style="cursor:pointer">{{ horizonLabel(g.horizon) }}</span>
            </div>
            <button class="delx" @click.stop="delGoal(d, g)">×</button>
          </div>
          <div class="why" v-if="g.why">{{ g.why }}</div>
        </div>
        <div class="addbar">
          <input class="field" type="text" v-model="newGoalByDomain[d.id]"
                 placeholder="Add a goal…" @keyup.enter="addGoal(d)">
          <button class="btn ghost" @click="addGoal(d)">+</button>
        </div>
      </div>
    </div>

    <p v-if="domains.length === 0" class="muted small" style="padding:12px 4px">
      No domains yet. Run <code>npm run seed:lifeos</code> on the server to load the defaults.
    </p>
  </div>
</template>

<style scoped>
.domain{border:1px solid var(--line-soft);border-radius:12px;margin-bottom:12px;overflow:hidden;background:#fbf7ec}
.domain.foundation{border-color:var(--gold);box-shadow:0 0 0 1px rgba(154,122,46,.25),0 1px 2px rgba(42,38,32,.06),0 8px 30px rgba(42,38,32,.07)}
.dhead{display:flex;align-items:center;gap:11px;padding:12px 14px;cursor:pointer}
.dico{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--ox);color:#f7f1e3;
      font-family:var(--serif);font-size:18px;flex:0 0 auto}
.foundation .dico{background:var(--gold)}
.dhead .dn{font-family:var(--serif);font-size:21px;flex:1}
.dbody{padding:2px 14px 14px}
.goal{padding:8px 4px;border-top:1px dashed var(--line-soft)}
.goal .why{font-size:13px;color:var(--ink-soft);font-style:italic;margin-top:3px}
</style>
