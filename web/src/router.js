import { createRouter, createWebHistory } from 'vue-router';
import Planner from './views/Planner.vue';
import Login from './views/Login.vue';
import Today from './views/Today.vue';
import Goals from './views/Goals.vue';
import Library from './views/Library.vue';
import Briefing from './views/Briefing.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/planner' },
    { path: '/login', component: Login },
    { path: '/planner', component: Planner },
    { path: '/today', component: Today },
    { path: '/goals', component: Goals },
    { path: '/reading', component: Library },
    { path: '/briefing', component: Briefing },
  ],
});
