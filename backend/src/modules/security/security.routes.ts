import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { actualizarRol, crearRol, listarPermisos, listarRoles, reemplazarPermisosRol, usuariosDeRol } from './security.service';

const router = Router();
const id = (req: Request) => Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id || '');
const query = (req: Request, key: string) => typeof req.query[key] === 'string' ? req.query[key] : '';
function h(fn: (req: Request) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try { fn(req).then(data => res.json(Object.assign({ ok: true }, data as object)), next); } catch (e) { next(e); }
  };
}

router.use(requireAuth);
router.get('/roles', h(req => listarRoles(req.ctx!)));
router.post('/roles', h(req => crearRol(req.ctx!, req.body || {})));
router.patch('/roles/:id', h(req => actualizarRol(req.ctx!, id(req), req.body || {})));
router.put('/roles/:id/permissions', h(req => reemplazarPermisosRol(req.ctx!, id(req), req.body?.permisos)));
router.get('/roles/:id/users', h(req => usuariosDeRol(req.ctx!, id(req), query(req, 'pag'), query(req, 'tam'))));
router.get('/permissions', h(req => listarPermisos(req.ctx!)));

export default router;
