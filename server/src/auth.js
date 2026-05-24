import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const COOKIE = 'serviam_sid';
const DAYS = 30;
const secure = String(process.env.SECURE_COOKIES).toLowerCase() === 'true';

const cookieOpts = {
  httpOnly: true,
  secure,                       // requires HTTPS in prod
  sameSite: 'lax',
  path: '/',
  maxAge: DAYS * 24 * 60 * 60 * 1000,
};

export function createSession(res, userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)').run(id, userId, expires);
  res.cookie(COOKIE, id, cookieOpts);
}

export function destroySession(req, res) {
  const sid = req.cookies?.[COOKIE];
  if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
  res.clearCookie(COOKIE, { path: '/' });
}

export function currentUser(req) {
  const sid = req.cookies?.[COOKIE];
  if (!sid) return null;
  const row = db.prepare(
    `SELECT u.id, u.name, u.email, u.role, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`).get(sid);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
    return null;
  }
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'not_authenticated' });
  req.user = user;
  next();
}

export async function verifyLogin(email, password) {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!u) { await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinv'); return null; } // constant-time-ish
  const ok = await bcrypt.compare(password, u.password_hash);
  return ok ? u : null;
}
