<script setup>
import { ref } from 'vue';
import { api } from '../api.js';

const prompt = ref('');
const out = ref('');
const busy = ref(false);
const err = ref('');
const useWeb = ref(false);

async function ask(preset) {
  const q = (preset || prompt.value).trim();
  if (!q || busy.value) return;
  if (preset) prompt.value = q;
  busy.value = true; err.value = ''; out.value = '';
  try {
    const { text } = await api.post('/counsel', { question: q, web: useWeb.value });
    out.value = text || '(no response)';
  } catch (e) {
    err.value = `Strategist call failed: ${e?.message || 'unknown'}. Check the server terminal for the full error.`;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div style="padding:24px 4px">
    <div class="card">
      <h2 style="margin-top:0">The strategist</h2>
      <p class="muted small" style="margin:.1em 0 .6em">
        A thinking aid — not a substitute for your spiritual director, your wife, or a real mentor.
        It sees your goals and your current battle, and reasons with you. Ask it to pressure-test a
        decision, plan a week, or sequence what matters.
      </p>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px">
        <button class="btn ghost small" :disabled="busy" @click="ask(
          'Look at my domains and my current particular-examen battle. Tell me the THREE things that actually matter most in the next 90 days, and what to consciously stop doing. Be direct and concrete.'
        )">Plan my 90 days</button>
        <button class="btn ghost small" :disabled="busy" @click="ask(
          'Act as my weekly review partner. Given my goals and bricks, ask me 5 sharp questions that will surface where I am drifting, then suggest next week\'s three bricks.'
        )">Weekly review</button>
      </div>

      <textarea class="field" v-model="prompt" rows="4"
        placeholder="Ask the strategist… e.g. 'I keep overspending. Design a system that makes saving for the house automatic and almost effortless.'"></textarea>

      <div style="display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap">
        <button class="btn" :disabled="busy" @click="ask()">
          <span v-if="busy">
            <span class="spin"></span> thinking…
          </span>
          <span v-else>Ask</span>
        </button>
        <label class="muted small" style="display:inline-flex;align-items:center;gap:6px">
          <input type="checkbox" v-model="useWeb"> use web search
        </label>
      </div>

      <p v-if="err" style="color:var(--ox);margin-top:10px">{{ err }}</p>

      <div v-if="out" class="ai-out">{{ out }}</div>

      <div class="ai-note">
        Server-side: your API key stays on the box. Counsel pulls your goals + current struggles
        as context — keep them up to date.
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-out{background:#fffdf6;border:1px solid var(--line);border-left:3px solid var(--ox);border-radius:9px;
        padding:14px 15px;margin-top:12px;white-space:pre-wrap;line-height:1.55;font-size:15px}
.ai-note{font-size:12.5px;color:var(--ink-soft);margin-top:8px;font-style:italic}
.spin{display:inline-block;width:13px;height:13px;border:2px solid var(--line);border-top-color:#f7f1e3;
      border-radius:50%;animation:sp .7s linear infinite;vertical-align:-2px}
@keyframes sp{to{transform:rotate(360deg)}}
</style>
