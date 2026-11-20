/*********************************************************************
 * app.ts — Aplicación Express del backend SGA (monolito modular)
 * Exporta la instancia de Express desacoplada del puerto HTTP para
 * permitir pruebas de integración y arranque independiente.
 *********************************************************************/

import dotenv from 'dotenv';
import path from 'path';
// El .env vive junto al schema de Prisma (SGA/database/.env)
dotenv.config({ path: path.resolve(__dirname, '../../database/.env') });

import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from './lib/db';
import authRoutes from './modules/auth/auth.routes';
import crudRoutes from './modules/crud/crud.routes';
import gradesRoutes from './modules/grades/grades.routes';
import reportsRoutes from './modules/reports/reports.routes';
import observationsRoutes from './modules/observations/observations.routes';
import configurationRoutes from './modules/configuration/configuration.routes';
import consultationRoutes from './modules/consultation/consultation.routes';
import studentsRoutes from './modules/students/students.routes';
import securityRoutes from './modules/security/security.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import { ErrorApp, estadoHttpDeCodigo } from './lib/errors';
import { errorDePrisma_ } from './lib/prisma-errors';
import { requireAuth } from './middleware/auth';

export const app = express();
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, servicio: 'sga-backend', version: '0.1.0' });
});

// Verificación de la base de datos: comprueba conectividad con PostgreSQL
app.get('/api/health/db', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'connected' });
  } catch {
    console.error('Falló la comprobación de conectividad con PostgreSQL.');
    res.status(503).json({ ok: false, db: 'unavailable', error: 'Base de datos no disponible.' });
  }
});

// Resumen del sistema para el Panel: solo usuarios autenticados.
// Se mantiene separado de /api/health/db para no exponer conteos sin sesión.
app.get('/api/health/summary', requireAuth, async (req, res, next) => {
  try {
    const fila = await prisma.config.findUnique({ where: { clave: 'ANO_ESCOLAR' }, select: { valor: true } });
    const ano = fila ? fila.valor : '';
    const [students, gradeRecords, resultSummaries, config] = await Promise.all([
      prisma.enrollment.count({ where: { schoolYearId: ano, estado: 'ACTIVO', student: { estado: 'ACTIVO' } } }),
      prisma.gradeRecord.count({ where: { schoolYearId: ano } }),
      prisma.resultSummary.count({ where: { schoolYearId: ano } }),
      prisma.config.count(),
    ]);
    res.json({ ok: true, ano, students, gradeRecords, resultSummaries, config });
  } catch (e) {
    next(e);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/crud', crudRoutes);
app.use('/api/grades', gradesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/observations', observationsRoutes);
app.use('/api/configuration', configurationRoutes);
app.use('/api/consultation', consultationRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/attendance', attendanceRoutes);

// 404 del API: siempre JSON, nunca la página HTML por defecto de Express.
app.use('/api', function (_req, res) {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada.', codigo: 'NO_ENCONTRADO' });
});

// Manejador de errores: ErrorApp → estado HTTP según su código; Prisma conocido
// → 409/404/400 con mensaje legible; cuerpo inválido → 400/413; lo demás → 500.
app.use((e: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (e instanceof ErrorApp) {
    res.status(estadoHttpDeCodigo(e.codigo)).json({ ok: false, error: e.message, codigo: e.codigo });
    return;
  }

  const dePrisma = errorDePrisma_(e);
  if (dePrisma) {
    res.status(estadoHttpDeCodigo(dePrisma.codigo)).json({ ok: false, error: dePrisma.message, codigo: dePrisma.codigo });
    return;
  }

  const tipo = (e as { type?: unknown } | null)?.type;
  if (tipo === 'entity.parse.failed') {
    res.status(400).json({ ok: false, error: 'El cuerpo de la petición no es JSON válido.', codigo: 'VALIDACION' });
    return;
  }
  if (tipo === 'entity.too.large') {
    res.status(413).json({ ok: false, error: 'La petición supera el tamaño permitido.', codigo: 'VALIDACION' });
    return;
  }

  console.error(e);
  // ErrorLog: el legado registraba los errores técnicos y devolvía una referencia.
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

export default app;
