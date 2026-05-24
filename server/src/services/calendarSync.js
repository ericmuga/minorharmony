import { db } from '../db.js';
import { fetchIcalEvents } from '../lib/ical.js';

// Pull every enabled calendar and cache its events. Provider-abstracted:
// today only 'ical' is implemented; 'google' / 'graph' can be added here later.
export async function syncAllCalendars() {
  const cals = db.prepare('SELECT * FROM external_calendars WHERE enabled = 1').all();
  const replace = db.prepare(
    `INSERT INTO external_events (calendar_id, uid, title, start_utc, end_utc, all_day, location)
     VALUES (@calendar_id,@uid,@title,@start_utc,@end_utc,@all_day,@location)
     ON CONFLICT(calendar_id, uid, start_utc) DO UPDATE SET
       title=excluded.title, end_utc=excluded.end_utc, all_day=excluded.all_day, location=excluded.location`);
  const wipe = db.prepare('DELETE FROM external_events WHERE calendar_id = ?');
  const touch = db.prepare("UPDATE external_calendars SET last_synced_at = datetime('now') WHERE id = ?");

  const results = [];
  for (const c of cals) {
    try {
      if (c.provider !== 'ical' || !c.ics_url) { results.push({ id: c.id, skipped: true }); continue; }
      const events = await fetchIcalEvents(c.ics_url);
      const tx = db.transaction((rows) => {
        wipe.run(c.id);
        for (const e of rows) replace.run({ calendar_id: c.id, ...e });
        touch.run(c.id);
      });
      tx(events);
      results.push({ id: c.id, label: c.label, count: events.length });
    } catch (err) {
      results.push({ id: c.id, label: c.label, error: err.message });
    }
  }
  return results;
}
