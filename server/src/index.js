import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './db.js';
import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.routes.js';
import plannerRoutes from './routes/planner.routes.js';
import calendarRoutes from './routes/calendars.routes.js';
import captureRoutes from './routes/capture.routes.js';
import activityRoutes from './routes/activities.routes.js';
import briefingRoutes from './routes/briefings.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);                 // behind nginx
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);

// everything below requires a valid session
app.use('/api/planner', requireAuth, plannerRoutes);
app.use('/api/calendars', requireAuth, calendarRoutes);
app.use('/api/capture', requireAuth, captureRoutes);
app.use('/api/activities', requireAuth, activityRoutes);
app.use('/api/briefings', requireAuth, briefingRoutes);
// TODO (Claude Code): /api/goals, /api/norms, /api/struggles, /api/examen, /api/people, /api/library, /api/counsel

// In production, serve the built PWA from web/dist (nginx can also do this directly).
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '..', '..', 'web', 'dist');
  app.use(express.static(dist));
  app.get('*', (req, res, next) =>
    req.path.startsWith('/api') ? next() : res.sendFile(path.join(dist, 'index.html')));
}

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`Serviam API on :${port}`));
