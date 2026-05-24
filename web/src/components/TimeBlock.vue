<script setup>
const props = defineProps({ block:Object, hourPx:Number, startHour:Number });
const emit = defineEmits(['toggle','remove']);
const laneColor = { primehub:'#9a7a2e', farmerschoice:'#3a6ea5', personal:'#52614f', prayer:'#742a2a', wellbeing:'#2e8b6b', formation:'#7d5ba6' };
function y(min){ return (min - props.startHour*60) / 60 * props.hourPx; }
const top = y(props.block.start_min);
const h = Math.max(26, y(props.block.end_min) - y(props.block.start_min) - 3);
const col = laneColor[props.block.lane] || '#52614f';
</script>
<template>
  <div :style="{position:'absolute',left:'2px',right:'6px',top:top+'px',height:h+'px',
        borderLeft:'4px solid '+col, background:'#fbf7ec',border:'1px solid var(--line-soft)',
        borderRadius:'8px',padding:'4px 8px',overflow:'hidden',opacity: block.done?0.55:1}">
    <div style="display:flex;gap:6px;align-items:center">
      <strong class="serif" style="font-size:15px;flex:1" :style="block.done?'text-decoration:line-through':''">{{ block.title }}</strong>
      <button title="done" @click="emit('toggle', block)" style="border:0;background:transparent;color:var(--ox);font-size:14px">✓</button>
      <button title="remove" @click="emit('remove', block)" style="border:0;background:transparent;color:var(--line);font-size:16px">×</button>
    </div>
    <div v-if="block.offering || block.prayer_tag" class="small" style="color:var(--ox);font-style:italic">
      ✝ {{ block.offering || block.prayer_tag }}
    </div>
  </div>
</template>
