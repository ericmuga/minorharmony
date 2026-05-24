<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';
const items = ref([]); const busy = ref(false); const err = ref('');
async function load(){ items.value = await api.get('/briefings'); }
async function generate(){
  busy.value = true; err.value = '';
  try { await api.post('/briefings/generate'); await load(); }
  catch(e){ err.value = 'Could not generate — is ANTHROPIC_API_KEY set on the server?'; }
  finally { busy.value = false; }
}
onMounted(load);
</script>
<template>
  <div style="padding:24px 4px">
    <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
      <h2 class="serif" style="font-size:26px;margin:0">The Briefing</h2>
      <span class="muted small" style="flex:1">Current affairs · tech · finance · politics · on this day</span>
      <button class="btn" :disabled="busy" @click="generate">{{ busy ? 'Gathering…' : 'Refresh' }}</button>
    </div>
    <p v-if="err" style="color:var(--ox)">{{ err }}</p>

    <div v-for="b in items" :key="b.topic"
      style="background:#fbf7ec;border:1px solid var(--line-soft);border-left:4px solid var(--gold);border-radius:12px;padding:14px 16px;margin-top:14px">
      <div class="serif" style="font-size:19px;color:var(--ox)">{{ b.label }}
        <span v-if="b.briefing" class="muted small" style="font-style:italic">· {{ b.briefing.date }}</span></div>
      <div v-if="b.briefing" style="white-space:pre-wrap;line-height:1.5;margin-top:6px">{{ b.briefing.content }}</div>
      <div v-else class="muted small" style="margin-top:6px">No briefing yet — tap Refresh, or let the daily 6am job fill it.</div>
    </div>
  </div>
</template>
