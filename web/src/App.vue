<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { auth } from './stores/auth.js';
import { useRouter } from 'vue-router';
import { api } from './api.js';

const router = useRouter();
const menuOpen = ref(false);
const remindersOn = ref(localStorage.getItem('serviam_reminders') === '1');
let reminderTimer = null;
const sent = new Set();

function closeMenu() {
  menuOpen.value = false;
}

async function logout(){ await auth.logout(); closeMenu(); router.push('/login'); }

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function eventMin(iso) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png' }); } catch {}
}

async function enableReminders() {
  if (!('Notification' in window)) {
    alert('This browser does not support notifications.');
    return;
  }
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  remindersOn.value = permission === 'granted';
  localStorage.setItem('serviam_reminders', remindersOn.value ? '1' : '0');
  if (remindersOn.value) checkReminders();
}

function toggleReminders() {
  if (remindersOn.value) {
    remindersOn.value = false;
    localStorage.setItem('serviam_reminders', '0');
  } else {
    enableReminders();
  }
}

async function checkReminders() {
  if (!auth.user || !remindersOn.value || document.hidden) return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const horizon = nowMin + 10;
  try {
    const day = await api.get('/planner/day?date=' + todayKey());
    const upcoming = [
      ...day.blocks.map(b => ({ key: 'b' + b.id, title: b.title, min: b.start_min, source: b.lane })),
      ...day.events.map((e, i) => ({ key: 'e' + e.id + i, title: e.title || 'Calendar event', min: eventMin(e.start_utc), source: e.label })),
    ].filter(x => x.min >= nowMin && x.min <= horizon);

    for (const item of upcoming) {
      const key = todayKey() + ':' + item.key + ':' + item.min;
      if (sent.has(key)) continue;
      sent.add(key);
      notify('Serviam next activity', `${item.title} at ${String(Math.floor(item.min / 60)).padStart(2, '0')}:${String(item.min % 60).padStart(2, '0')} (${item.source})`);
    }
  } catch {}
}

onMounted(() => {
  router.afterEach(closeMenu);
  reminderTimer = setInterval(checkReminders, 60000);
  setTimeout(checkReminders, 2500);
});
onBeforeUnmount(() => clearInterval(reminderTimer));
</script>

<template>
  <div class="appshell" style="max-width:920px;margin:0 auto;padding:0 16px 120px">
    <header v-if="auth.user" class="appheader">
      <div class="mobiletop">
        <span class="serif brand">Serviam</span>
        <button class="btn ghost small menutoggle" type="button" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
          {{ menuOpen ? 'Close' : 'Menu' }}
        </button>
      </div>
      <nav class="appnav" :class="{ open: menuOpen }">
        <router-link class="serif navlink" to="/dashboard">Dashboard</router-link>
        <router-link class="serif navlink" to="/calendar">Calendar</router-link>
        <router-link class="serif navlink" to="/planner">Planner</router-link>
        <router-link class="serif navlink" to="/today">Today</router-link>
        <router-link class="serif navlink" to="/goals">Goals</router-link>
        <router-link class="serif navlink" to="/struggle">Struggle</router-link>
        <router-link class="serif navlink" to="/people">People</router-link>
        <router-link class="serif navlink" to="/reading">Reading</router-link>
        <router-link class="serif navlink" to="/counsel">Counsel</router-link>
        <router-link class="serif navlink" to="/briefing">Briefing</router-link>
      </nav>
      <div class="headeractions" :class="{ open: menuOpen }">
        <!-- Kept out of the main nav: it's administration, not a daily tab. -->
        <router-link v-if="auth.user?.role === 'owner'" class="btn ghost small"
                     style="text-decoration:none" to="/logins">Logins</router-link>
        <button class="btn ghost small" @click="toggleReminders">
          {{ remindersOn ? 'Reminders on' : 'Reminders' }}
        </button>
        <button class="btn ghost small" @click="logout">Sign out</button>
      </div>
    </header>
    <router-view />
  </div>
</template>

<style>
a.router-link-active{ color:var(--ox)!important; font-weight:600; }
</style>
