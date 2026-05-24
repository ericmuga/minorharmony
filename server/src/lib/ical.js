// Thin wrapper around node-ical: fetch a secret .ics feed and normalise events.
import ical from 'node-ical';

export async function fetchIcalEvents(url, { horizonDays = 60 } = {}) {
  const data = await ical.async.fromURL(url);
  const now = Date.now();
  const horizon = now + horizonDays * 864e5;
  const past = now - 2 * 864e5;
  const out = [];
  for (const k of Object.keys(data)) {
    const ev = data[k];
    if (!ev || ev.type !== 'VEVENT') continue;
    const start = ev.start instanceof Date ? ev.start : new Date(ev.start);
    const end = ev.end instanceof Date ? ev.end : (ev.end ? new Date(ev.end) : null);
    const t = start.getTime();
    if (isNaN(t) || t < past || t > horizon) continue;     // keep a small window
    out.push({
      uid: ev.uid || `${k}-${t}`,
      title: ev.summary || '(no title)',
      start_utc: start.toISOString(),
      end_utc: end ? end.toISOString() : null,
      all_day: ev.datetype === 'date' ? 1 : 0,
      location: ev.location || null,
    });
  }
  return out;
}
