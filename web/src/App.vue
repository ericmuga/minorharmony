<script setup>
import { auth } from './stores/auth.js';
import { useRouter } from 'vue-router';
const router = useRouter();
async function logout(){ await auth.logout(); router.push('/login'); }
</script>

<template>
  <div style="max-width:920px;margin:0 auto;padding:0 16px 120px">
    <header v-if="auth.user" style="display:flex;align-items:baseline;gap:14px;padding:22px 4px 12px;border-bottom:1px solid var(--line)">
      <span class="serif" style="font-size:30px;font-weight:600">Serviam</span>
      <nav style="display:flex;gap:6px;flex:1">
        <router-link class="serif" style="font-size:17px;text-decoration:none;color:var(--ink-soft);padding:4px 10px" to="/planner">Planner</router-link>
        <router-link class="serif" style="font-size:17px;text-decoration:none;color:var(--ink-soft);padding:4px 10px" to="/today">Today</router-link>
        <router-link class="serif" style="font-size:17px;text-decoration:none;color:var(--ink-soft);padding:4px 10px" to="/goals">Goals</router-link>
        <router-link class="serif" style="font-size:17px;text-decoration:none;color:var(--ink-soft);padding:4px 10px" to="/briefing">Briefing</router-link>
      </nav>
      <button class="btn ghost small" @click="logout">Sign out</button>
    </header>
    <router-view />
  </div>
</template>

<style>
a.router-link-active{ color:var(--ox)!important; font-weight:600; }
</style>
