import { createApp } from 'vue';
import App from './App.vue';
import router from './router.js';
import './style.css';
import { auth } from './stores/auth.js';

window.addEventListener('unauthorized', (ev) => {
  if (ev.detail?.startedAt && ev.detail.startedAt < auth.lastLoginAt) return;
  auth.user = null;
  if (router.currentRoute.value.path !== '/login') router.push('/login');
});
auth.refresh().finally(() => createApp(App).use(router).mount('#app'));
