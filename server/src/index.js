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
import normsRoutes from './routes/norms.routes.js';
import examenRoutes from './routes/examen.routes.js';
import goalsRoutes from './routes/goals.routes.js';
import libraryRoutes from './routes/library.routes.js';
import counselRoutes from './routes/counsel.routes.js';
import strugglesRoutes from './routes/struggles.routes.js';
import peopleRoutes from './routes/people.routes.js';

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
app.use('/api/norms', requireAuth, normsRoutes);
app.use('/api/examen', requireAuth, examenRoutes);
app.use('/api/goals', requireAuth, goalsRoutes);
app.use('/api/library', requireAuth, libraryRoutes);
app.use('/api/counsel', requireAuth, counselRoutes);
app.use('/api/struggles', requireAuth, strugglesRoutes);
app.use('/api/people', requireAuth, peopleRoutes);

// In production, serve the built PWA from web/dist (nginx can also do this directly).
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '..', '..', 'web', 'dist');
  app.use(express.static(dist));
  app.get('*', (req, res, next) =>
    req.path.startsWith('/api') ? next() : res.sendFile(path.join(dist, 'index.html')));
}

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`Serviam API on :${port}`));
