/*********************************************************************
 * crud.routes.ts — Rutas REST del motor CRUD
 *   GET  /api/crud/:modulo/meta               → definición + opciones + permisos
 *   GET  /api/crud/:modulo?q&pag&tam&orden&f_ → listar (paginado, búsqueda, filtros)
 *   POST /api/crud/:modulo                    → guardar {id?, datos}
 *   POST /api/crud/:modulo/estado             → cambiar estado {id, estado}
 *   POST /api/crud/usuarios/:id/restablecer   → restablecer acceso {pin?}
 *********************************************************************/

import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { ParamsLista } from './crud.defs';
import { crudEstado, crudGuardar, crudListar, crudMeta } from './crud.service';
import {
  docenteAcceso_, docentesAccesosMasivos_, duplicarPeriodos_, restablecerAcceso_,
} from './crud.modulos';

const router = Router();

/** Envoltorio: convierte la promesa del servicio en respuesta JSON {ok: …} o error. */
function h(fn: (req: Request) => Promise<unknown>) {
  return function (req: Request, res: Response, next: NextFunction): void {
    fn(req).then(function (r) { res.json(Object.assign({ ok: true }, r as object)); }, next);
  };
}

function textoQ_(v: unknown): string | undefined { return v === undefined || v === null ? undefined : String(v); }

function paramsDe_(req: Request): ParamsLista {
  const q = req.query as Record<string, unknown>;
  const filtro: Record<string, string> = {};
  Object.keys(q).forEach(function (k) { if (k.indexOf('f_') === 0) filtro[k.slice(2)] = String(q[k]); });
  return {
    q: textoQ_(q.q), filtro: filtro,
    orden: textoQ_(q.orden), desc: q.desc === '1',
    pag: Number(q.pag) || 1, tam: Number(q.tam) || undefined,
  };
}

router.get('/:modulo/meta', requireAuth, h(function (req) { return crudMeta(req.ctx as NonNullable<typeof req.ctx>, String(req.params.modulo)); }));

/* Acciones globales: van antes de las rutas genéricas para que no las capture :modulo. */
router.post('/docentes/accesos-masivos', requireAuth, h(function (req) {
  return docentesAccesosMasivos_(req.ctx as NonNullable<typeof req.ctx>);
}));

router.post('/docentes/:id/acceso', requireAuth, h(function (req) {
  const body = (req.body || {}) as { usuario?: unknown; pin?: unknown };
  return docenteAcceso_(req.ctx as NonNullable<typeof req.ctx>, { id: req.params.id, usuario: body.usuario, pin: body.pin });
}));

router.post('/periodos/duplicar', requireAuth, h(function (req) {
  const body = (req.body || {}) as { origen?: unknown; destino?: unknown };
  return duplicarPeriodos_(req.ctx as NonNullable<typeof req.ctx>, { origen: body.origen, destino: body.destino });
}));

router.get('/:modulo', requireAuth, h(function (req) {
  return crudListar(req.ctx as NonNullable<typeof req.ctx>, String(req.params.modulo), paramsDe_(req));
}));

router.post('/:modulo', requireAuth, h(function (req) {
  const body = (req.body || {}) as { id?: string; datos?: Record<string, unknown> };
  return crudGuardar(req.ctx as NonNullable<typeof req.ctx>, String(req.params.modulo), body);
}));

router.post('/:modulo/estado', requireAuth, h(function (req) {
  const body = (req.body || {}) as { id?: string; estado?: string };
  return crudEstado(req.ctx as NonNullable<typeof req.ctx>, String(req.params.modulo), String(body.id), String(body.estado));
}));

router.post('/usuarios/:id/restablecer', requireAuth, h(function (req) {
  const body = (req.body || {}) as { pin?: unknown };
  return restablecerAcceso_(req.ctx as NonNullable<typeof req.ctx>, String(req.params.id), body.pin);
}));

export default router;
