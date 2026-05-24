import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyLogin, createSession, destroySession, currentUser, requireAuth } from '../auth.js';

const r = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

r.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing_fields' });
  const user = await verifyLogin(email, password);
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  createSession(res, user.id);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

r.post('/logout', (req, res) => { destroySession(req, res); res.json({ ok: true }); });
r.get('/me', (req, res) => { const u = currentUser(req); u ? res.json({ user: u }) : res.status(401).json({ error: 'not_authenticated' }); });

export default r;
