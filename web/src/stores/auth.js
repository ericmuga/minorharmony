import { reactive } from 'vue';
import { api } from '../api.js';
export const auth = reactive({
  user: null,
  lastLoginAt: 0,
  async refresh() { try { this.user = (await api.get('/auth/me')).user; } catch { this.user = null; } return this.user; },
  async login(email, password) {
    this.user = (await api.post('/auth/login', { email, password })).user;
    this.lastLoginAt = Date.now();
  },
  async logout() { await api.post('/auth/logout'); this.user = null; },
});
