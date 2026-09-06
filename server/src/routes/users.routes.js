// Managing the handful of people who can log in — replaces `npm run create-user`
// for day-to-day use. Owner-only, and deliberately narrow: no self-service signup
// still holds, this is the owner adding people he knows.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';

const r = Router();
const ROLES = ['owner', 'spouse', 'director'];
const MIN_PASSWORD = 8;

// Only an owner administers logins. Everyone else gets 403 rather than 404:
// they're authenticated and trusted, just not allowed here.
function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') return res.status(403).json({ error: 'owner_only' });
  next();
}
r.use(requireOwner);

const countOwners = () =>
  db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'owner'`).get().n;

r.get('/', (_req, res) => {
  res.json(db.prepare(
    `SELECT u.id, u.name, u.email, u.role, u.created_at,
            (SELECT COUNT(*) FROM sessions s
              WHERE s.user_id = u.id AND s.expires_at > datetime('now')) AS active_sessions
       FROM users u ORDER BY u.id`).all());
});

r.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').toLowerCase().trim();
  const role = ROLES.includes(req.body?.role) ? req.body.role : 'spouse';
  const password = String(req.body?.password || '');

  if (!name) return res.status(400).json({ error: 'name_required' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'bad_email' });
  if (password.length < MIN_PASSWORD) return res.status(400).json({ error: 'password_too_short' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    return res.status(409).json({ error: 'email_taken' });

  const hash = await bcrypt.hash(password, 12);
  const info = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)')
    .run(name, email, hash, role);
  res.json({ id: info.lastInsertRowid, name, email, role });
});

r.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'not_found' });

  const sets = [], vals = [];
  if (typeof req.body?.name === 'string' && req.body.name.trim()) {
    sets.push('name = ?'); vals.push(req.body.name.trim());
  }
  if (ROLES.includes(req.body?.role) && req.body.role !== target.role) {
    // Demoting the only owner would leave nobody able to administer logins,
    // and no UI to fix it — you'd be back to npm run create-user over SSH.
    if (target.role === 'owner' && countOwners() <= 1)
      return res.status(400).json({ error: 'last_owner' });
    sets.push('role = ?'); vals.push(req.body.role);
  }
  if (typeof req.body?.password === 'string' && req.body.password) {
    if (req.body.password.length < MIN_PASSWORD)
      return res.status(400).json({ error: 'password_too_short' });
    sets.push('password_hash = ?'); vals.push(await bcrypt.hash(req.body.password, 12));
    // A password change must end every session that used the old one —
    // otherwise "I reset their password" doesn't actually lock anyone out.
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }
  if (!sets.length) return res.json({ ok: true });

  vals.push(id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ ok: true });
});

// Deleting a user cascades to every row they own — planner blocks, examens,
// library, the lot. That is not recoverable from the UI, so require the caller
// to name the account explicitly rather than just clicking through a confirm.
r.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'cannot_delete_self' });

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (target.role === 'owner' && countOwners() <= 1)
    return res.status(400).json({ error: 'last_owner' });

  if (String(req.query.confirm_email || '').toLowerCase().trim() !== target.email)
    return res.status(400).json({ error: 'confirm_email_mismatch' });

  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default r;
