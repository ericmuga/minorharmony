<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '../api.js';

const date = ref(new Date().toISOString().slice(0, 10));
const day = ref({ blocks: [], events: [], day_type: 'workday', holiday: null });
const calendars = ref([]);
const syncing = ref(false);
const msg = ref('');
const form = ref({ label: '', lane: 'personal', provider: 'ical', ics_url: '', color: '#3a6ea5' });

const dayLabel = computed(() => new Date(date.value + 'T00:00:00')
  .toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));

const items = computed(() => {
  const blocks = day.value.blocks.map(b => ({
    kind: 'block',
    title: b.title,
    lane: b.lane,
    color: laneColor(b.lane),
    start: b.start_min,
    time: hh(b.start_min),
    done: !!b.done,
    source: 'Serviam',
  }));
  const events = day.value.events.map(e => ({
    kind: 'event',
    title: e.title || 'Untitled event',
    lane: e.lane,
    color: e.color || laneColor(e.lane),
    start: eventMin(e.start_utc),
    time: hh(eventMin(e.start_utc)),
    done: false,
    source: e.label,
    location: e.location,
  }));
  return [...blocks, ...events].sort((a, b) => a.start - b.start);
});

function laneColor(lane) {
  return {
    primehub: '#9a7a2e',
    farmerschoice: '#3a6ea5',
    personal: '#52614f',
    prayer: '#742a2a',
    wellbeing: '#2e8b6b',
    formation: '#7d5ba6',
  }[lane] || '#52614f';
}
function hh(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
function eventMin(iso) { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); }
function shift(n) {
  const d = new Date(date.value + 'T00:00:00');
  d.setDate(d.getDate() + n);
  date.value = d.toISOString().slice(0, 10);
}

async function loadDay() {
  day.value = await api.get('/planner/day?date=' + date.value);
}
async function loadCalendars() {
  calendars.value = await api.get('/calendars');
}
async function addCalendar() {
  if (!form.value.label.trim()) return;
  await api.post('/calendars', {
    label: form.value.label.trim(),
    lane: form.value.lane,
    provider: form.value.provider,
    ics_url: form.value.ics_url.trim() || null,
    color: form.value.color,
  });
  form.value = { label: '', lane: 'personal', provider: 'ical', ics_url: '', color: '#3a6ea5' };
  await loadCalendars();
}
async function removeCalendar(c) {
  if (!confirm(`Remove "${c.label}" from Serviam?`)) return;
  await api.del('/calendars/' + c.id);
  await loadCalendars();
  await loadDay();
}
async function sync() {
  syncing.value = true;
  msg.value = '';
  try {
    const out = await api.post('/calendars/sync', {});
    const count = out.results.reduce((sum, r) => sum + (r.count || 0), 0);
    msg.value = `Synced ${count} events.`;
    await Promise.all([loadCalendars(), loadDay()]);
  } catch (e) {
    msg.value = 'Sync failed: ' + e.message;
  } finally {
    syncing.value = false;
  }
}

watch(date, loadDay);
onMounted(() => Promise.all([loadDay(), loadCalendars()]));
</script>

<template>
  <div style="padding:24px 4px">
    <div class="topbar">
      <div>
        <h2 class="serif" style="font-size:28px;margin:0">Calendar</h2>
        <div class="muted small">Serviam blocks and synced Google/Outlook feeds in one place.</div>
      </div>
      <button class="btn ghost small" :disabled="syncing" @click="sync">
        {{ syncing ? 'Syncing...' : 'Sync calendars' }}
      </button>
    </div>

    <div class="card">
      <div class="daynav">
        <button class="btn ghost" @click="shift(-1)">Prev</button>
        <button class="btn ghost" @click="date = new Date().toISOString().slice(0, 10)">Today</button>
        <button class="btn ghost" @click="shift(1)">Next</button>
        <input class="field" type="date" v-model="date" style="width:auto">
        <strong class="serif" style="font-size:21px">{{ dayLabel }}</strong>
      </div>
      <p v-if="msg" class="small muted">{{ msg }}</p>

      <div v-if="!items.length" class="muted small">Nothing planned or synced for this day.</div>
      <div v-for="it in items" :key="`${it.kind}-${it.start}-${it.title}-${it.source}`" class="calrow">
        <i :style="{ background: it.color }"></i>
        <div class="time">{{ it.time }}</div>
        <div class="calbody">
          <strong :class="{ done: it.done }">{{ it.title }}</strong>
          <div class="muted small">
            {{ it.source }} &middot; {{ it.lane || 'calendar' }}
            <span v-if="it.location"> &middot; {{ it.location }}</span>
          </div>
        </div>
        <span class="kind">{{ it.kind }}</span>
      </div>
    </div>

    <div class="twocol">
      <div class="card">
        <h2>Connected feeds</h2>
        <div v-if="!calendars.length" class="muted small">No feeds yet.</div>
        <div v-for="c in calendars" :key="c.id" class="feedrow">
          <i :style="{ background: c.color }"></i>
          <div style="flex:1">
            <strong>{{ c.label }}</strong>
            <div class="muted small">
              {{ c.provider }} &middot; {{ c.lane }} &middot;
              {{ c.last_synced_at ? `last synced ${c.last_synced_at}` : 'not synced yet' }}
            </div>
          </div>
          <button class="delx" @click="removeCalendar(c)">x</button>
        </div>

        <div class="sectlabel">Add iCal feed now</div>
        <input class="field" v-model="form.label" placeholder="Label, e.g. Primehub Google">
        <div class="addbar">
          <select class="field" v-model="form.lane">
            <option value="primehub">Primehub</option>
            <option value="farmerschoice">Farmers Choice</option>
            <option value="personal">Personal / Family</option>
            <option value="prayer">Prayer</option>
            <option value="formation">Formation</option>
            <option value="wellbeing">Wellbeing</option>
          </select>
          <input class="field" v-model="form.color" type="color" style="max-width:70px;padding:3px">
        </div>
        <input class="field" style="margin-top:8px" v-model="form.ics_url"
               placeholder="Secret iCal / ICS URL from Google or Outlook">
        <button class="btn" style="margin-top:10px" @click="addCalendar">Add feed</button>
      </div>

      <div class="card">
        <h2>API access needed</h2>
        <div class="setup">
          <strong>Google Calendar</strong>
          <p class="muted small">
            Enable Google Calendar API, create an OAuth web client, add your production redirect URL,
            and request read-only calendar scopes.
          </p>
          <code>https://www.googleapis.com/auth/calendar.readonly</code>
          <code>https://www.googleapis.com/auth/calendar.events.readonly</code>
          <code>https://www.googleapis.com/auth/calendar.calendarlist.readonly</code>
        </div>
        <div class="setup">
          <strong>Microsoft / Outlook</strong>
          <p class="muted small">
            Register an app in Microsoft Entra ID, add a web redirect URL, and use delegated Graph permissions.
            Ask your Microsoft 365 admin to consent if Farmers Choice blocks user consent.
          </p>
          <code>User.Read</code>
          <code>offline_access</code>
          <code>Calendars.Read</code>
          <code>Calendars.Read.Shared</code>
        </div>
        <p class="muted small">
          The app currently supports iCal feeds. OAuth token storage and provider sync are the next backend step.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.topbar,.daynav{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.daynav{justify-content:flex-start}
.calrow,.feedrow{display:flex;align-items:flex-start;gap:10px;border-top:1px solid var(--line-soft);padding:10px 0}
.calrow:first-of-type,.feedrow:first-of-type{border-top:0}
.calrow i,.feedrow i{width:5px;align-self:stretch;border-radius:5px;flex:0 0 auto}
.time{font-family:var(--serif);font-size:18px;color:var(--ox);width:52px;flex:0 0 auto}
.calbody{flex:1;min-width:0}
.done{text-decoration:line-through;color:var(--ink-soft)}
.kind{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);border:1px solid var(--line);border-radius:20px;padding:1px 8px}
.twocol{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.setup{border-top:1px solid var(--line-soft);padding:10px 0}
.setup:first-of-type{border-top:0}
code{display:block;background:#fdfaf2;border:1px solid var(--line-soft);border-radius:6px;padding:5px 7px;margin:5px 0;overflow-wrap:anywhere}
@media (max-width:760px){
  .twocol{grid-template-columns:1fr;gap:0}
  .kind{display:none}
}
</style>
