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

// ---- one-tap blocks ----
const presets = ref([]);
const showPresets = ref(false);       // the manage panel
const presetMsg = ref('');
const newPreset = ref(blankPreset());

function blankPreset(){ return { title:'', lane:'prayer', startH:12, startM:0, dur_min:15, daily:true }; }
function hhmm(min){ return String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0'); }

async function loadPresets(){ presets.value = await api.get('/planner/presets'); }

async function applyPresets(ids){
  const out = await api.post('/planner/presets/apply', { date: date.value, ids });
  presetMsg.value = out.added
    ? `Added ${out.added}${out.skipped ? `, ${out.skipped} already there` : ''}.`
    : 'Already on the day.';
  setTimeout(() => { presetMsg.value = ''; }, 3000);
  await load();
}

async function addPreset(){
  const p = newPreset.value;
  if (!p.title.trim()) return;
  await api.post('/planner/presets', {
    title: p.title, lane: p.lane, start_min: p.startH*60 + Number(p.startM),
    dur_min: Number(p.dur_min), daily: p.daily ? 1 : 0,
    sort: p.startH*60 + Number(p.startM),
  });
  newPreset.value = blankPreset();
  await loadPresets();
}

async function delPreset(p){
  if (!confirm(`Remove "${p.title}" from your one-tap blocks? (Blocks already on a day stay.)`)) return;
  await api.del('/planner/presets/' + p.id);
  await loadPresets();
}

async function loadDefaults(){
  const out = await api.post('/planner/presets/defaults', {});
  presetMsg.value = out.added ? `Added ${out.added}.` : 'You already have them all.';
  setTimeout(() => { presetMsg.value = ''; }, 3000);
  await loadPresets();
}

// The same panel adds and edits — editingId decides which. A separate edit form
// would drift from this one every time a field is added.
const editingId = ref(null);

function startEdit(b){
  editingId.value = b.id;
  form.value = {
    title: b.title || '',
    startH: Math.floor(b.start_min / 60),
    // The grid's dropdown only offers quarter hours; snap so an odd start time
    // (a synced activity, say) doesn't silently become :00 on save.
    startM: [0,15,30,45].reduce((best, m) =>
      Math.abs(m - b.start_min % 60) < Math.abs(best - b.start_min % 60) ? m : best, 0),
    durMin: Math.max(15, (b.end_min - b.start_min) || 60),
    lane: b.lane || 'personal',
    offering: b.offering || '',
    prayer_tag: b.prayer_tag || '',
  };
  showAdd.value = true;
}

function cancelEdit(){ editingId.value = null; form.value = blank(); showAdd.value = false; }

async function saveBlock(){
  const f = form.value;
  if (!f.title.trim()) return;
  const start = f.startH*60 + Number(f.startM);
  const body = {
    start_min: start, end_min: start + Number(f.durMin),
    title: f.title.trim(), lane: f.lane, offering: f.offering, prayer_tag: f.prayer_tag,
  };
  if (editingId.value) await api.patch('/planner/blocks/' + editingId.value, body);
  else await api.post('/planner/blocks', { date: date.value, ...body });
  cancelEdit();
  await load();
}
async function toggle(b){ await api.patch('/planner/blocks/'+b.id, { done: b.done?0:1 }); await load(); }
async function remove(b){ await api.del('/planner/blocks/'+b.id); await load(); }

async function addCapture(){ const t=newCapture.value.trim(); if(!t) return;
  await api.post('/capture', { text:t }); newCapture.value=''; capture.value = await api.get('/capture'); }
async function syncCals(){ await api.post('/calendars/sync'); await load(); }

watch(date, load);
onMounted(() => { load(); loadPresets(); });
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
      <!-- Opening the panel for a new block must drop any half-finished edit,
           or you'd save your changes onto the wrong block. -->
      <button class="btn" @click="showAdd ? cancelEdit() : (editingId = null, form = blank(), showAdd = true)">
        + Block
      </button>
    </div>
    <div v-if="capture.length" class="small muted" style="margin-bottom:6px">
      Inbox: <span v-for="c in capture" :key="c.id" style="margin-right:10px">• {{ c.text }}</span>
    </div>

    <!-- One-tap blocks: the fixed points of the day, placed on demand. -->
    <div class="quickbar">
      <span class="muted small" style="white-space:nowrap">One tap:</span>
      <button v-for="p in presets" :key="p.id" class="qchip" :title="`${hhmm(p.start_min)} · ${p.dur_min} min`"
              @click="applyPresets([p.id])">
        {{ p.title }} <span class="qtime">{{ hhmm(p.start_min) }}</span>
      </button>
      <button v-if="presets.some(p => p.daily)" class="qchip fill" @click="applyPresets()">
        ⤓ Fill the day
      </button>
      <button class="qchip ghosty" @click="showPresets = !showPresets">
        {{ presets.length ? 'Edit…' : 'Set these up…' }}
      </button>
      <span v-if="presetMsg" class="muted small">{{ presetMsg }}</span>
    </div>

    <!-- Manage the one-tap list -->
    <div v-if="showPresets" style="background:#fbf7ec;border:1px solid var(--line-soft);border-radius:12px;padding:14px;margin:8px 0 14px">
      <div class="sectlabel" style="margin-top:0">One-tap blocks</div>
      <p class="muted small" style="margin:.1em 0 .7em">
        These are placed only when you tap them — nothing appears on a day by itself,
        so the planner stays an honest record of what you actually kept.
        <strong>Fill the day</strong> places everything marked “daily”.
      </p>

      <div v-for="p in presets" :key="p.id" class="row" style="align-items:center;gap:8px">
        <div class="rowtext">
          <span class="main">{{ p.title }}</span>
          <div class="sub">{{ hhmm(p.start_min) }} · {{ p.dur_min }} min · {{ p.lane }}
            <span v-if="p.daily" style="color:var(--gold)"> · daily</span>
          </div>
        </div>
        <button class="delx" @click="delPreset(p)">×</button>
      </div>

      <div v-if="!presets.length" class="muted small" style="padding:4px 2px">
        Nothing yet.
        <button class="btn ghost small" @click="loadDefaults">Start with the classic set</button>
        — heroic minute, morning offering, mental prayer, Mass, Angelus, lunch, visit, examen.
      </div>
      <div v-else style="margin:6px 0">
        <button class="btn ghost small" @click="loadDefaults">Add any missing classics</button>
      </div>

      <div class="sectlabel">Add your own</div>
      <input class="field" v-model="newPreset.title" placeholder="Name (e.g. Angelus, school run, stand-up)"
             @keyup.enter="addPreset">
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">
        <select class="field" style="width:auto" v-model.number="newPreset.startH">
          <option v-for="h in 24" :key="h-1" :value="h-1">{{ String(h-1).padStart(2,'0') }}:00</option>
        </select>
        <select class="field" style="width:auto" v-model.number="newPreset.startM">
          <option :value="0">:00</option><option :value="15">:15</option>
          <option :value="30">:30</option><option :value="45">:45</option>
        </select>
        <select class="field" style="width:auto" v-model.number="newPreset.dur_min">
          <option :value="5">5 min</option><option :value="10">10 min</option><option :value="15">15 min</option>
          <option :value="30">30 min</option><option :value="45">45 min</option><option :value="60">1 h</option>
        </select>
        <select class="field" style="width:auto" v-model="newPreset.lane">
          <option value="prayer">Prayer</option>
          <option value="personal">Personal / Family</option>
          <option value="wellbeing">Wellbeing</option>
          <option value="formation">Formation</option>
          <option value="farmerschoice">Farmers Choice</option>
          <option value="primehub">Primehub</option>
        </select>
        <label class="small" style="display:flex;align-items:center;gap:5px;white-space:nowrap">
          <input type="checkbox" v-model="newPreset.daily"> in “Fill the day”
        </label>
        <button class="btn" @click="addPreset">Add</button>
      </div>
    </div>

    <!-- Add-block panel -->
    <div v-if="showAdd" :style="{background:'#fbf7ec',border:'1px solid var(--line-soft)',borderRadius:'12px',
                                 padding:'14px',margin:'8px 0 14px',
                                 borderLeft: editingId ? '3px solid var(--ox)' : '1px solid var(--line-soft)'}">
      <div v-if="editingId" class="sectlabel" style="margin-top:0">Editing this block</div>
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
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" @click="saveBlock">{{ editingId ? 'Save changes' : 'Add to the day' }}</button>
        <button v-if="editingId" class="btn ghost" @click="cancelEdit">Cancel</button>
      </div>
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
          @toggle="toggle" @remove="remove" @edit="startEdit" />
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

/* The one-tap strip scrolls rather than wrapping: on a phone a dozen chips
   would otherwise push the whole grid down the page. */
.quickbar {
  display: flex; align-items: center; gap: 6px;
  margin: 10px 0 4px; padding-bottom: 2px;
  overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none;
}
.quickbar::-webkit-scrollbar { display: none; }
.qchip {
  flex: 0 0 auto;
  font-family: var(--serif); font-size: 14px; color: #5b2020;
  background: #fbf3e0; border: 1px solid var(--line); border-radius: 20px;
  padding: 4px 12px; white-space: nowrap;
}
.qchip:hover { border-color: var(--gold); }
.qtime { color: var(--ink-soft); font-size: 12px; margin-left: 3px; }
.qchip.fill { background: var(--ox); color: #f7f1e3; border-color: var(--ox); }
.qchip.ghosty { background: transparent; border-style: dashed; color: var(--ink-soft); }

@media (hover: none) and (pointer: coarse) {
  .qchip { padding: 7px 14px; font-size: 15px; }
}

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
