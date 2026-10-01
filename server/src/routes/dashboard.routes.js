import { Router } from 'express';
import { db } from '../db.js';

const r = Router();

const today = () => new Date().toISOString().slice(0, 10);
const isoDate = (d) => d.toISOString().slice(0, 10);
const addDays = (base, n) => {
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
};

function dateWindow(days) {
  const end = today();
  const start = addDays(end, -(days - 1));
  return { start, end };
}

r.get('/', (req, res) => {
  const { start, end } = dateWindow(Math.min(parseInt(req.query.days, 10) || 14, 60));

  const norms = db.prepare(
    `SELECT id, name, cadence FROM norms WHERE user_id = ? ORDER BY sort, id`
  ).all(req.user.id);
  const dailyNormIds = norms.filter(n => n.cadence === 'daily').map(n => n.id);
  const dailyCount = dailyNormIds.length;

  const normRows = db.prepare(
    `SELECT date, norm_id FROM norm_log WHERE user_id = ? AND date BETWEEN ? AND ?`
  ).all(req.user.id, start, end);
  const normHistory = {};
  for (const row of normRows) (normHistory[row.date] ||= []).push(row.norm_id);

  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const done = new Set(normHistory[d] || []);
    const dailyDone = dailyNormIds.filter(id => done.has(id)).length;
    days.push({
      date: d,
      daily_done: dailyDone,
      daily_total: dailyCount,
      pct: dailyCount ? Math.round(100 * dailyDone / dailyCount) : 0,
    });
  }

  const todayLog = days[days.length - 1] || { daily_done: 0, daily_total: dailyCount, pct: 0 };
  const keptDays = days.filter(d => d.daily_total > 0 && d.daily_done === d.daily_total).length;

  const blockStats = db.prepare(
    `SELECT COUNT(*) AS total, COALESCE(SUM(done),0) AS done
       FROM time_blocks
      WHERE user_id = ? AND date = ? AND dismissed = 0`
  ).get(req.user.id, today());

  const nextEvents = db.prepare(
    `SELECT e.title, e.start_utc, e.end_utc, c.label, c.lane, c.color
       FROM external_events e JOIN external_calendars c ON c.id = e.calendar_id
      WHERE c.user_id = ? AND c.enabled = 1 AND e.start_utc >= ?
      ORDER BY e.start_utc LIMIT 8`
  ).all(req.user.id, new Date().toISOString());

  const calendarStats = db.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(enabled),0) AS enabled,
            MAX(last_synced_at) AS last_synced_at
       FROM external_calendars WHERE user_id = ?`
  ).get(req.user.id);

  const readingRows = db.prepare(
    `SELECT rs.date, rs.minutes, rs.book_id, l.title
       FROM reading_sessions rs JOIN library l ON l.id = rs.book_id
      WHERE rs.user_id = ? AND rs.date BETWEEN ? AND ?
      ORDER BY rs.date DESC, rs.id DESC`
  ).all(req.user.id, start, end);
  const readingByDate = {};
  for (const row of readingRows) {
    const bucket = (readingByDate[row.date] ||= { date: row.date, minutes: 0, sessions: 0 });
    bucket.minutes += row.minutes || 0;
    bucket.sessions += 1;
  }

  const readingStats = db.prepare(
    `SELECT COUNT(*) AS sessions, COALESCE(SUM(minutes),0) AS minutes,
            COUNT(DISTINCT book_id) AS books
       FROM reading_sessions WHERE user_id = ? AND date BETWEEN ? AND ?`
  ).get(req.user.id, start, end);

  const libraryStats = db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN state = 'reading' THEN 1 ELSE 0 END) AS reading,
            SUM(CASE WHEN state = 'done' THEN 1 ELSE 0 END) AS done
       FROM library WHERE user_id = ?`
  ).get(req.user.id);

  const goals = db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open
       FROM goals g JOIN domains d ON d.id = g.domain_id
      WHERE d.user_id = ?`
  ).get(req.user.id);

  const bricks = db.prepare(
    `SELECT COUNT(*) AS total, COALESCE(SUM(done),0) AS done
       FROM bricks WHERE user_id = ? AND date BETWEEN ? AND ?`
  ).get(req.user.id, start, end);

  const examens = db.prepare(
    `SELECT date, gratitude, struggle, resolution FROM examen
      WHERE user_id = ? ORDER BY date DESC LIMIT 5`
  ).all(req.user.id);

  res.json({
    window: { start, end },
    plan: { today: todayLog, kept_days: keptDays, days },
    planner: blockStats,
    calendars: { ...calendarStats, next_events: nextEvents },
    reading: {
      ...readingStats,
      library: libraryStats,
      days: Object.values(readingByDate).sort((a, b) => a.date.localeCompare(b.date)),
      recent: readingRows.slice(0, 8),
    },
    goals: { ...goals, bricks },
    examens,
  });
});

export default r;
