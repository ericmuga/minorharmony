import { Router } from 'express';
import { db } from '../db.js';
import { syncAllCalendars } from '../services/calendarSync.js';

const r = Router();

r.get('/', (req, res) => {
  res.json(db.prepare('SELECT id,label,lane,provider,color,enabled,last_synced_at FROM external_calendars WHERE user_id = ?').all(req.user.id));
});

r.post('/', (req, res) => {
  const { label, lane = 'personal', ics_url, color = '#742a2a', provider = 'ical' } = req.body || {};
  if (!label) return res.status(400).json({ error: 'label_required' });
  const info = db.prepare(
    'INSERT INTO external_calendars (user_id,label,lane,provider,ics_url,color) VALUES (?,?,?,?,?,?)')
    .run(req.user.id, label, lane, provider, ics_url || null, color);
  res.json({ id: info.lastInsertRowid });
});

r.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM external_calendars WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// Trigger a sync on demand (cron also calls the service directly).
r.post('/sync', async (req, res) => {
  const results = await syncAllCalendars();
  res.json({ results });
});

export default r;
