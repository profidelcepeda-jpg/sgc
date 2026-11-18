import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { ErrorApp } from '../../lib/errors';
import { asistenciaDiariaSeccion, editarAsistenciaDiaria, historialAsistenciaEstudiante, historialAsistenciaSeccion, opcionesAsistencia, registrarAsistenciaGrupal } from './attendance.service';

const router = Router();
const q = (req: Request, key: string) => typeof req.query[key] === 'string' ? req.query[key] : '';
const param = (req: Request, key: string) => Array.isArray(req.params[key]) ? req.params[key][0] : String(req.params[key] || '');
function h(fn: (req: Request) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try { fn(req).then(data => res.json(Object.assign({ ok: true }, data as object)), next); }
    catch (e) { next(e); }
  };
}

router.use(requireAuth);
router.get('/options', h(req => opcionesAsistencia(req.ctx!, q(req, 'ano'))));
router.get('/sections/:id/daily', h(req => asistenciaDiariaSeccion(req.ctx!, q(req, 'ano'), param(req, 'id'), q(req, 'fecha'))));
router.get('/sections/:id/history', h(req => historialAsistenciaSeccion(req.ctx!, q(req, 'ano'), param(req, 'id'), q(req, 'desde'), q(req, 'hasta'), q(req, 'pag'), q(req, 'tam'))));
router.get('/students/:id/history', h(req => historialAsistenciaEstudiante(req.ctx!, param(req, 'id'), q(req, 'ano'), q(req, 'desde'), q(req, 'hasta'))));
router.post('/bulk', h(req => registrarAsistenciaGrupal(req.ctx!, req.body || {})));
router.patch('/sessions/:id', h(req => editarAsistenciaDiaria(req.ctx!, param(req, 'id'), req.body || {})));
router.all(/.*/, (_req, _res, next) => next(new ErrorApp('Ruta de asistencia no encontrada.', 'NO_ENCONTRADO')));
export default router;
