import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { ErrorApp } from '../../lib/errors';
import {
  guardarMatrizAsistencia,
  guardarAsistenciaMensual,
  obtenerMatrizAsistencia,
  opcionesAsistenciaDocente,
  planillaAsistenciaMensual,
} from './attendance.service';

const router = Router();
const q = (req: Request, key: string) => typeof req.query[key] === 'string' ? req.query[key] : '';

function h(fn: (req: Request) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      fn(req).then(data => res.json(Object.assign({ ok: true }, data as object)), next);
    } catch (e) {
      next(e);
    }
  };
}

router.use(requireAuth);

// Opciones del maestro: asignaturas y cursos/secciones según TeachingAssignment
router.get('/options', h(req => opcionesAsistenciaDocente(req.ctx!, q(req, 'ano'), q(req, 'docenteId'))));

// Planilla mensual de estudiantes de la sección seleccionada
router.get('/sheet', h(req => planillaAsistenciaMensual(req.ctx!, {
  ano: q(req, 'ano'),
  docenteId: q(req, 'docenteId'),
  asignaturaId: q(req, 'asignaturaId'),
  seccionId: q(req, 'seccionId'),
  mes: q(req, 'mes'),
})));

// Guardar asistencia mensual
router.post('/sheet', h(req => guardarAsistenciaMensual(req.ctx!, req.body || {})));

// Matriz anual mensual para la vista integrada de Calificaciones.
router.get('/matrix', h(req => obtenerMatrizAsistencia(req.ctx!, {
  ano: q(req, 'ano'),
  asignaturaId: q(req, 'asignaturaId'),
  seccionId: q(req, 'seccionId'),
})));
router.post('/matrix', h(req => guardarMatrizAsistencia(req.ctx!, req.body || {})));

router.all(/.*/, (_req, _res, next) => next(new ErrorApp('Ruta de asistencia no encontrada.', 'NO_ENCONTRADO')));

export default router;
