import { createRouter, createWebHistory } from 'vue-router';
import Planner from './views/Planner.vue';
import Login from './views/Login.vue';
import Today from './views/Today.vue';
import Goals from './views/Goals.vue';
import Library from './views/Library.vue';
// epub.js only matters once you open a book, so keep it out of the first load.
const Reader = () => import('./views/Reader.vue');
import EscrivaLibrary from './views/EscrivaLibrary.vue';
import Counsel from './views/Counsel.vue';
import Struggle from './views/Struggle.vue';
import People from './views/People.vue';
import Briefing from './views/Briefing.vue';
import Users from './views/Users.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/planner' },
    { path: '/login', component: Login },
    { path: '/planner', component: Planner },
    { path: '/today', component: Today },
    { path: '/goals', component: Goals },
    { path: '/reading', component: Library },
    { path: '/reading/escriva', component: EscrivaLibrary },
    { path: '/reading/:id/read', component: Reader },
    { path: '/struggle', component: Struggle },
    { path: '/people', component: People },
    { path: '/counsel', component: Counsel },
    { path: '/briefing', component: Briefing },
    { path: '/logins', component: Users },
  ],
});
