<script setup>
import { ref, reactive, onMounted } from 'vue';
import { api } from '../api.js';
import { auth } from '../stores/auth.js';

const users = ref([]);
const err = ref('');
const busy = ref(false);
const np = reactive({ name: '', email: '', role: 'spouse', password: '' });
const editing = ref(null);          // { id, name, role, password }
const confirmDelete = ref(null);    // { id, email, typed }

const ROLE_LABEL = {
  owner: 'Owner — full access, and can manage these logins',
  spouse: 'Spouse — their own planner, reading and examen',
  director: 'Director — their own account, for direction notes',
};

async function load() {
  err.value = '';
  try { users.value = await api.get('/users'); }
  catch (e) { err.value = e.message === 'owner_only' ? 'Only an owner can manage logins.' : e.message; }
}

async function add() {
  err.value = '';
  if (!np.name.trim() || !np.email.trim()) { err.value = 'Name and email are required.'; return; }
  if (np.password.length < 8) { err.value = 'Password must be at least 8 characters.'; return; }
  busy.value = true;
  try {
    await api.post('/users', { name: np.name.trim(), email: np.email.trim(), role: np.role, password: np.password });
    np.name = ''; np.email = ''; np.role = 'spouse'; np.password = '';
    await load();
  } catch (e) {
    err.value = { email_taken: 'That email already has a login.',
                  bad_email: 'That email address doesn’t look right.',
                  password_too_short: 'Password must be at least 8 characters.' }[e.message] || e.message;
  } finally { busy.value = false; }
}

function startEdit(u) { editing.value = { id: u.id, name: u.name, role: u.role, password: '' }; }

async function saveEdit() {
  const e = editing.value;
  err.value = ''; busy.value = true;
  try {
    const body = { name: e.name, role: e.role };
    if (e.password) body.password = e.password;
    await api.patch(`/users/${e.id}`, body);
    editing.value = null;
    await load();
  } catch (ex) {
    err.value = { last_owner: 'There has to be at least one owner.',
                  password_too_short: 'Password must be at least 8 characters.' }[ex.message] || ex.message;
  } finally { busy.value = false; }
}

async function doDelete() {
  const c = confirmDelete.value;
  err.value = ''; busy.value = true;
  try {
    await api.del(`/users/${c.id}?confirm_email=${encodeURIComponent(c.typed.trim())}`);
    confirmDelete.value = null;
    await load();
  } catch (e) {
    err.value = { confirm_email_mismatch: 'That email doesn’t match — nothing was deleted.',
                  cannot_delete_self: 'You can’t delete your own login.',
                  last_owner: 'There has to be at least one owner.' }[e.message] || e.message;
  } finally { busy.value = false; }
}

onMounted(load);
</script>

<template>
  <div style="padding:24px 4px">
    <div class="card">
      <h2>Logins</h2>
      <p class="muted small" style="margin:.1em 0 .8em">
        There is no public signup — an account exists only because you made it here.
        Each login is its own private life-OS: a new person sees their own planner, reading
        list and examen, not yours.
      </p>

      <p v-if="err" class="small" style="color:var(--ox)">{{ err }}</p>

      <div v-for="u in users" :key="u.id" class="row" style="align-items:center;flex-wrap:wrap;gap:6px">
        <div class="rowtext" style="min-width:170px">
          <span class="main">{{ u.name }}</span>
          <div class="meta">
            {{ u.email }}
            <span v-if="u.id === auth.user?.id" style="color:var(--gold)"> · you</span>
          </div>
        </div>
        <span class="rolechip">{{ u.role }}</span>
        <span class="muted small" :title="u.active_sessions + ' active session(s)'">
          {{ u.active_sessions ? '● signed in' : '○ not signed in' }}
        </span>
        <button class="btn ghost small" @click="startEdit(u)">Edit</button>
        <button class="delx" :disabled="u.id === auth.user?.id"
                :title="u.id === auth.user?.id ? 'You can\'t delete your own login' : 'Delete this login'"
                @click="confirmDelete = { id: u.id, email: u.email, typed: '' }">×</button>
      </div>

      <div class="sectlabel">Add a login</div>
      <input class="field" type="text" v-model="np.name" placeholder="Name">
      <div class="addbar">
        <input class="field" type="email" v-model="np.email" placeholder="Email" autocomplete="off">
        <select class="field" v-model="np.role">
          <option value="spouse">Spouse</option>
          <option value="director">Director</option>
          <option value="owner">Owner</option>
        </select>
      </div>
      <div class="addbar">
        <input class="field" type="password" v-model="np.password" autocomplete="new-password"
               placeholder="Temporary password (8+ characters)">
        <button class="btn" :disabled="busy" @click="add">Add</button>
      </div>
      <p class="muted small" style="margin-top:.5em">{{ ROLE_LABEL[np.role] }}</p>
      <p class="muted small">
        You set the first password and tell it to them — there's no email sending here.
        They can't change it themselves yet, so you'd reset it from this screen.
      </p>
    </div>

    <div v-if="editing" class="card" style="border-left:3px solid var(--ox)">
      <h3 style="margin-top:0">Edit login</h3>
      <input class="field" type="text" v-model="editing.name" placeholder="Name">
      <div class="addbar">
        <select class="field" v-model="editing.role">
          <option value="spouse">Spouse</option>
          <option value="director">Director</option>
          <option value="owner">Owner</option>
        </select>
        <input class="field" type="password" v-model="editing.password" autocomplete="new-password"
               placeholder="New password (leave blank to keep)">
      </div>
      <p class="muted small">Changing the password signs them out everywhere.</p>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn" :disabled="busy" @click="saveEdit">Save</button>
        <button class="btn ghost" @click="editing = null">Cancel</button>
      </div>
    </div>

    <div v-if="confirmDelete" class="card" style="border-left:3px solid var(--ox)">
      <h3 style="margin-top:0">Delete {{ confirmDelete.email }}?</h3>
      <p class="small">
        This deletes <strong>everything that login owns</strong> — planner blocks, examens,
        goals, reading list, uploaded books, direction notes. It cannot be undone from here;
        only a database backup would bring it back.
      </p>
      <p class="muted small">Type the email address to confirm:</p>
      <input class="field" type="text" v-model="confirmDelete.typed" :placeholder="confirmDelete.email">
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn" :disabled="busy || confirmDelete.typed.trim().toLowerCase() !== confirmDelete.email"
                @click="doDelete">Delete permanently</button>
        <button class="btn ghost" @click="confirmDelete = null">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.meta{font-size:12.5px;color:var(--ink-soft)}
.rolechip{font-family:var(--serif);font-size:14px;color:var(--ox);border:1px solid var(--line);
          border-radius:20px;padding:2px 11px;background:#fbf3e0;white-space:nowrap}
.delx[disabled]{opacity:.3;cursor:not-allowed}
</style>
