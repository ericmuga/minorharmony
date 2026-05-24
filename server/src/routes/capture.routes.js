import { Router } from 'express';
import { db } from '../db.js';
const r = Router();

r.get('/', (req, res) =>
  res.json(db.prepare('SELECT * FROM capture_inbox WHERE user_id = ? AND processed = 0 ORDER BY created_at DESC').all(req.user.id)));

r.post('/', (req, res) => {
  const text = (req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text_required' });
  const info = db.prepare('INSERT INTO capture_inbox (user_id, text) VALUES (?,?)').run(req.user.id, text);
  res.json({ id: info.lastInsertRowid });
});

r.post('/:id/process', (req, res) => {
  db.prepare('UPDATE capture_inbox SET processed = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default r;
