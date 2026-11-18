/*********************************************************************
 * server.ts — Entrada del backend SGA (monolito modular)
 * Fase 3: motor de calificaciones + autenticación (sesiones httpOnly).
 * Los módulos CRUD se agregan en pasos siguientes.
 *********************************************************************/

import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { prisma } from './lib/db';
import authRoutes from './modules/auth/auth.routes';
import crudRoutes from './modules/crud/crud.routes';
import { ErrorApp, estadoHttpDeCodigo } from './lib/errors';

// El .env vive junto al schema de Prisma (SGA/database/.env)
dotenv.config({ path: path.resolve(__dirname, '../../database/.env') });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

/**
 * CORS para el frontend en desarrollo (Vite 5173 → API 4000). Sin esto el
 * navegador bloquea la cookie httpOnly y ninguna llamada llega. En producción
 * se limita a los orígenes declarados en CORS_ORIGINS (nunca "*" con credenciales).
 */
const ORIGENES = String(process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
app.use(function (req, res, next) {
  const origen = String(req.headers.origin || '');
  if (origen && ORIGENES.indexOf(origen) >= 0) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  next();
});

const PORT = Number(process.env.PORT || 4000);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, servicio: 'sga-backend', version: '0.1.0' });
});

// Verificación de la base de datos: cuenta tablas críticas
app.get('/api/health/db', async (_req, res) => {
  try {
    const [students, gradeRecords, resultSummaries, config] = await Promise.all([
      prisma.student.count(),
      prisma.gradeRecord.count(),
      prisma.resultSummary.count(),
      prisma.config.count(),
    ]);
    res.json({ ok: true, db: 'sga_db', students, gradeRecords, resultSummaries, config });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/crud', crudRoutes);

// Manejador de errores: ErrorApp → estado HTTP según su código; lo demás → 500
app.use((e: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (e instanceof ErrorApp) {
    res.status(estadoHttpDeCodigo(e.codigo)).json({ ok: false, error: e.message, codigo: e.codigo });
    return;
  }
  console.error(e);
  // ErrorLog: el legado registraba los errores técnicos y devolvía una referencia.
  // Antes solo se hacía console.error y el fallo se perdía.
  const mensaje = e instanceof Error ? e.message : String(e);
  prisma.errorLog.create({
    data: {
      fecha: new Date(), usuario: req.ctx ? req.ctx.usuario : null,
      funcion: req.method + ' ' + req.originalUrl, referencia: null,
      mensaje: mensaje.slice(0, 500),
      detalle: e instanceof Error ? String(e.stack || '').slice(0, 4000) : null,
    },
  }).catch(function (err) { console.error('ErrorLog no persistido:', err); });
  res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
});

const server = app.listen(PORT, () => {
  console.log('SGA backend escuchando en http://localhost:' + PORT);
});

async function cerrar() {
  await prisma.$disconnect();
  server.close();
}
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
