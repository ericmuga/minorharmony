<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const items = ref([]);
const busy = ref(false);
const err = ref('');
const results = ref([]);

async function load() {
  items.value = await api.get('/briefings');
}

async function generate() {
  busy.value = true;
  err.value = '';
  results.value = [];
  try {
    const out = await api.post('/briefings/generate');
    results.value = out.results || [];
    if (!out.ok) err.value = 'Claude did not return any highlights. Check the area status below and the server API key/model.';
    await load();
  } catch (e) {
    err.value = 'Could not generate the briefing. Check the area status below and the Claude API key/model on the server.';
    await load().catch(() => {});
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div style="padding:24px 4px">
    <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
      <h2 class="serif" style="font-size:26px;margin:0">The Briefing</h2>
      <span class="muted small" style="flex:1">Highlights by area: current affairs, tech, finance, politics, history</span>
      <button class="btn" :disabled="busy" @click="generate">{{ busy ? 'Gathering...' : 'Refresh' }}</button>
    </div>

    <p v-if="err" style="color:var(--ox)">{{ err }}</p>
    <div v-if="results.length" class="small muted" style="margin-top:8px">
      <span v-for="r in results" :key="r.topic" style="margin-right:10px">
        {{ r.topic }}: {{ r.ok ? 'updated' : (r.error || 'failed') }}
      </span>
    </div>

    <div v-for="b in items" :key="b.topic" class="briefcard">
      <div class="serif" style="font-size:19px;color:var(--ox)">
        {{ b.label }}
        <span v-if="b.briefing" class="muted small" style="font-style:italic">- {{ b.briefing.date }}</span>
      </div>
      <div v-if="b.briefing" style="white-space:pre-wrap;line-height:1.5;margin-top:6px">{{ b.briefing.content }}</div>
      <div v-else class="muted small" style="margin-top:6px">No highlights yet. Tap Refresh, or let the daily job fill it.</div>
    </div>
  </div>
</template>

<style scoped>
.briefcard {
  background: #fbf7ec;
  border: 1px solid var(--line-soft);
  border-left: 4px solid var(--gold);
  border-radius: 12px;
  padding: 14px 16px;
  margin-top: 14px;
}
</style>
