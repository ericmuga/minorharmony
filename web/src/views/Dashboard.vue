<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api.js';

const stats = ref(null);
const loading = ref(true);
const err = ref('');

const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
  weekday: 'short', month: 'short', day: 'numeric',
});
const fmtTime = (iso) => new Date(iso).toLocaleString(undefined, {
  weekday: 'short', hour: '2-digit', minute: '2-digit',
});

const planPct = computed(() => stats.value?.plan?.today?.pct || 0);
const blocksPct = computed(() => {
  const p = stats.value?.planner;
  return p?.total ? Math.round(100 * p.done / p.total) : 0;
});

async function load() {
  loading.value = true;
  err.value = '';
  try {
    stats.value = await api.get('/dashboard?days=14');
  } catch (e) {
    err.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div style="padding:24px 4px">
    <div class="homehead">
      <img class="saintbadge" src="/sj-josemaria-192.png" alt="St. Josemaria Escriva">
      <div class="headcopy">
        <h2 class="serif" style="font-size:28px;margin:0">Dashboard</h2>
        <div class="muted small">A quick read on the life you are trying to order.</div>
      </div>
      <button class="btn ghost small" @click="load">Refresh</button>
    </div>

    <p v-if="loading" class="muted">Loading...</p>
    <p v-if="err" style="color:var(--ox)">Could not load dashboard: {{ err }}</p>

    <template v-if="stats">
      <div class="dashgrid">
        <div class="statcard">
          <div class="label">Plan today</div>
          <div class="big">{{ planPct }}%</div>
          <div class="muted small">
            {{ stats.plan.today.daily_done }} of {{ stats.plan.today.daily_total }} daily norms
          </div>
          <div class="bar"><i :style="{ width: planPct + '%' }"></i></div>
        </div>

        <div class="statcard">
          <div class="label">Planner today</div>
          <div class="big">{{ stats.planner.done }}/{{ stats.planner.total }}</div>
          <div class="muted small">blocks completed</div>
          <div class="bar"><i :style="{ width: blocksPct + '%' }"></i></div>
        </div>

        <div class="statcard">
          <div class="label">Reading</div>
          <div class="big">{{ stats.reading.minutes }}</div>
          <div class="muted small">
            minutes in {{ stats.reading.sessions }} session{{ stats.reading.sessions === 1 ? '' : 's' }} this window
          </div>
        </div>

        <div class="statcard">
          <div class="label">Goals</div>
          <div class="big">{{ stats.goals.open || 0 }}</div>
          <div class="muted small">
            open goals; {{ stats.goals.bricks.done }}/{{ stats.goals.bricks.total }} bricks done
          </div>
        </div>
      </div>

      <div class="twocol">
        <div class="card">
          <h2>Plan history</h2>
          <div class="history">
            <div v-for="d in stats.plan.days" :key="d.date" class="daydot"
                 :title="`${fmtDate(d.date)}: ${d.pct}%`">
              <span :style="{ height: Math.max(4, d.pct) + '%' }"></span>
            </div>
          </div>
          <p class="muted small" style="margin:.6em 0 0">
            {{ stats.plan.kept_days }} fully kept day{{ stats.plan.kept_days === 1 ? '' : 's' }}
            since {{ fmtDate(stats.window.start) }}.
          </p>
        </div>

        <div class="card">
          <h2>Reading rhythm</h2>
          <div v-if="!stats.reading.days.length" class="muted small">No reading sessions logged yet.</div>
          <div v-for="d in stats.reading.days" :key="d.date" class="minirow">
            <span>{{ fmtDate(d.date) }}</span>
            <strong>{{ d.minutes }} min</strong>
          </div>
          <div class="sectlabel">Recent</div>
          <div v-for="r in stats.reading.recent.slice(0, 4)" :key="`${r.date}-${r.book_id}-${r.minutes}`" class="minirow">
            <span>{{ r.title }}</span>
            <strong>{{ r.minutes }} min</strong>
          </div>
        </div>
      </div>

      <div class="twocol">
        <div class="card">
          <h2>Next calendar events</h2>
          <div v-if="!stats.calendars.next_events.length" class="muted small">
            No upcoming synced events. Open Calendar to add feeds or sync.
          </div>
          <div v-for="e in stats.calendars.next_events" :key="`${e.start_utc}-${e.title}`" class="eventrow">
            <i :style="{ background: e.color || 'var(--personal)' }"></i>
            <div>
              <strong>{{ e.title || 'Untitled' }}</strong>
              <div class="muted small">{{ e.label }} &middot; {{ fmtTime(e.start_utc) }}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <h2>Recent examen</h2>
          <div v-if="!stats.examens.length" class="muted small">No examen entries yet.</div>
          <div v-for="e in stats.examens" :key="e.date" class="examen">
            <strong>{{ fmtDate(e.date) }}</strong>
            <div v-if="e.resolution" class="muted small">{{ e.resolution }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
.homehead{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.headcopy{flex:1;min-width:180px}
.saintbadge{width:58px;height:58px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);box-shadow:0 2px 10px rgba(42,38,32,.18)}
.statcard{background:#fbf7ec;border:1px solid var(--line-soft);border-radius:10px;padding:14px}
.label{font-family:var(--serif);font-size:15px;color:var(--gold);font-style:italic}
.big{font-family:var(--serif);font-size:34px;font-weight:600;color:var(--ox);line-height:1}
.twocol{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.history{height:120px;display:flex;align-items:flex-end;gap:5px;border-bottom:1px solid var(--line);padding-top:8px}
.daydot{flex:1;height:100%;display:flex;align-items:flex-end;background:#f5eedf;border-radius:6px 6px 0 0;overflow:hidden}
.daydot span{display:block;width:100%;background:linear-gradient(180deg,var(--gold),var(--ox));min-height:4px}
.minirow{display:flex;justify-content:space-between;gap:12px;border-top:1px solid var(--line-soft);padding:7px 0}
.eventrow{display:flex;gap:10px;border-top:1px solid var(--line-soft);padding:8px 0}
.eventrow i{width:5px;border-radius:5px;flex:0 0 auto}
.examen{border-top:1px solid var(--line-soft);padding:8px 0}
@media (max-width:760px){
  .dashgrid{grid-template-columns:1fr 1fr}
  .twocol{grid-template-columns:1fr;gap:0}
}
@media (max-width:430px){
  .saintbadge{width:52px;height:52px}
  .dashgrid{grid-template-columns:1fr}
}
</style>
