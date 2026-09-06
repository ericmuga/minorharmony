<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '../api.js';
import TimeBlock from '../components/TimeBlock.vue';

const START_HOUR = 5, END_HOUR = 23, HOUR_PX = 58;
const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

const date = ref(new Date().toISOString().slice(0,10));
const day = ref({ blocks: [], events: [], day_type: 'workday', holiday: null });
const capture = ref([]);
const newCapture = ref('');
const showAdd = ref(false);
const form = ref(blank());

function blank(){ return { title:'', startH:9, startM:0, durMin:60, lane:'farmerschoice', offering:'', prayer_tag:'' }; }
function hh(min){ return String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0'); }
function eventMin(iso){ const d=new Date(iso); return d.getHours()*60+d.getMinutes(); }
function y(min){ return (min - START_HOUR*60)/60*HOUR_PX; }

const dayLabel = computed(() => new Date(date.value+'T00:00:00')
  .toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}));
const typeBadge = computed(() => ({ workday:'Workday', weekend:'Weekend', holiday: day.value.holiday || 'Holiday' }[day.value.day_type]));

async function load(){
  day.value = await api.get('/planner/day?date=' + date.value);
  capture.value = await api.get('/capture');
}
function shift(n){ const d=new Date(date.value); d.setDate(d.getDate()+n); date.value=d.toISOString().slice(0,10); }
function today(){ date.value = new Date().toISOString().slice(0,10); }

async function addBlock(){
  const f = form.value;
  const start = f.startH*60 + Number(f.startM);
  await api.post('/planner/blocks', {
    date: date.value, start_min: start, end_min: start + Number(f.durMin),
    title: f.title, lane: f.lane, offering: f.offering, prayer_tag: f.prayer_tag,
  });
  form.value = blank(); showAdd.value = false; await load();
}
async function toggle(b){ await api.patch('/planner/blocks/'+b.id, { done: b.done?0:1 }); await load(); }
async function remove(b){ await api.del('/planner/blocks/'+b.id); await load(); }

async function addCapture(){ const t=newCapture.value.trim(); if(!t) return;
  await api.post('/capture', { text:t }); newCapture.value=''; capture.value = await api.get('/capture'); }
async function syncCals(){ await api.post('/calendars/sync'); await load(); }

watch(date, load);
onMounted(load);
</script>

<template>
  <div style="padding:18px 4px 0">
    <!-- Day nav -->
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button class="btn ghost" @click="shift(-1)">‹</button>
      <button class="btn ghost" @click="today">Today</button>
      <button class="btn ghost" @click="shift(1)">›</button>
      <input class="field" style="width:auto" type="date" v-model="date">
      <div class="serif" style="font-size:22px;flex:1">{{ dayLabel }}</div>
      <span class="serif" :style="{padding:'3px 12px',borderRadius:'20px',color:'#f7f1e3',
        background: day.day_type==='holiday' ? 'var(--gold)' : day.day_type==='weekend' ? 'var(--sage)' : 'var(--ox)'}">
        {{ typeBadge }}
      </span>
    </div>

    <!-- Capture bar -->
    <div style="display:flex;gap:8px;margin:14px 0 6px">
      <input class="field" v-model="newCapture" placeholder="Brain-dump anything so you don't forget it…" @keyup.enter="addCapture">
      <button class="btn" @click="addCapture">Capture</button>
      <button class="btn ghost" @click="syncCals" title="Refresh Google + Outlook feeds">Sync calendars</button>
      <button class="btn" @click="showAdd=!showAdd">+ Block</button>
    </div>
    <div v-if="capture.length" class="small muted" style="margin-bottom:6px">
      Inbox: <span v-for="c in capture" :key="c.id" style="margin-right:10px">• {{ c.text }}</span>
    </div>

    <!-- Add-block panel -->
    <div v-if="showAdd" style="background:#fbf7ec;border:1px solid var(--line-soft);border-radius:12px;padding:14px;margin:8px 0 14px">
      <input class="field" v-model="form.title" placeholder="What is the work? (e.g. BC240 change requests with Victor)">
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <select class="field" style="width:auto" v-model.number="form.startH">
          <option v-for="h in hours" :key="h" :value="h">{{ String(h).padStart(2,'0') }}:00</option>
        </select>
        <select class="field" style="width:auto" v-model.number="form.startM">
          <option :value="0">:00</option><option :value="15">:15</option><option :value="30">:30</option><option :value="45">:45</option>
        </select>
        <select class="field" style="width:auto" v-model.number="form.durMin">
          <option :value="30">30 min</option><option :value="60">1 h</option><option :value="90">1.5 h</option><option :value="120">2 h</option>
        </select>
        <select class="field" style="width:auto" v-model="form.lane">
          <option value="farmerschoice">Farmers Choice</option>
          <option value="primehub">Primehub</option>
          <option value="personal">Personal / Family</option>
          <option value="wellbeing">Wellbeing (gym, swim, hike)</option>
          <option value="formation">Formation (piano, study)</option>
          <option value="prayer">Prayer</option>
        </select>
      </div>
      <input class="field" style="margin-top:8px" v-model="form.offering" placeholder="Offer this work for… (the morning offering applied to this block)">
      <input class="field" style="margin-top:8px" v-model="form.prayer_tag" placeholder="Prayer / mortification tag (e.g. custody of the tongue in this meeting)">
      <div style="margin-top:10px"><button class="btn" @click="addBlock">Add to the day</button></div>
    </div>

    <!-- Hourly grid: my blocks (left) + calendar feeds (right) over one timeline -->
    <div class="daygrid" style="display:flex;gap:8px;margin-top:8px">
      <div class="gutter" style="width:46px;flex:0 0 auto;position:relative" :style="{height: hours.length*HOUR_PX+'px'}">
        <div v-for="h in hours" :key="h" class="small muted"
          :style="{position:'absolute',top:y(h*60)+'px',right:'4px'}">{{ String(h).padStart(2,'0') }}:00</div>
      </div>

      <!-- My time blocks -->
      <div style="flex:1;position:relative;border-left:1px solid var(--line);border-radius:10px;background:repeating-linear-gradient(transparent,transparent 57px,var(--line-soft) 57px,var(--line-soft) 58px)"
           :style="{height: hours.length*HOUR_PX+'px'}">
        <TimeBlock v-for="b in day.blocks" :key="b.id" :block="b" :hour-px="HOUR_PX" :start-hour="START_HOUR"
          @toggle="toggle" @remove="remove" />
        <div v-if="!day.blocks.length" class="muted small serif" style="position:absolute;top:10px;left:12px">
          No blocks yet — plan the day. Weekends and holidays count too.
        </div>
      </div>

      <!-- Read-only calendar feeds -->
      <div class="feeds" style="width:34%;flex:0 0 auto;position:relative" :style="{height: hours.length*HOUR_PX+'px'}">
        <!-- Only shown once the feeds stack below the blocks, where the column
             is no longer self-evidently the calendar side. -->
        <div class="feedcap sectlabel">Calendar</div>
        <div v-for="(e,i) in day.events" :key="i"
          :style="{position:'absolute',left:'4px',right:'2px',top:y(eventMin(e.start_utc))+'px',
                   borderLeft:'4px solid '+(e.color||'#3a6ea5'),background:'#f7f2e6',
                   border:'1px dashed var(--line)',borderRadius:'7px',padding:'3px 7px',minHeight:'24px'}">
          <div class="small" style="font-weight:600">{{ e.title }}</div>
          <div class="small muted">{{ e.label }} · {{ hh(eventMin(e.start_utc)) }}</div>
        </div>
        <div v-if="!day.events.length" class="muted small" style="position:absolute;top:10px;left:8px">
          Calendar feeds appear here. Add your Google &amp; Outlook iCal URLs, then Sync.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.feedcap { display: none; }

/* On a phone a 34%-wide calendar column is unreadable — event titles wrap to
   one word per line. Below this width the two timelines stack instead, each
   full width, with a caption so the second one is obviously the calendar. */
@media (max-width: 700px) {
  .daygrid { flex-wrap: wrap; }
  .feeds {
    width: 100% !important;
    flex: 1 1 100% !important;
    margin-top: 26px;
    border-left: 1px solid var(--line);
    border-radius: 10px;
  }
  .feedcap {
    display: block;
    position: absolute;
    top: -24px; left: 4px;
    margin: 0;
  }
}
</style>
