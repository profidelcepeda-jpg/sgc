/*********************************************************************
 * auth.routes.ts — Rutas REST de autenticación
 * Traducción de apiLogin / cerrarSesion_ / cambiarClave_ del legado:
 *   POST /api/auth/login          → setea cookie httpOnly y devuelve el perfil
 *   GET  /api/auth/bootstrap      → contexto completo (usuario + permisos)
 *   POST /api/auth/logout         → cierra la sesión (revoca el token)
 *   POST /api/auth/cambiar-clave  → cambia el PIN (política de 4 dígitos)
 *********************************************************************/

import { Router } from 'express';
import { cambiarClave, cerrarSesion, login, perfilPublico_ } from './auth.service';
import { requireSesion } from '../../middleware/auth';

const router = Router();

router.post('/login', function (req, res, next) {
  const body = (req.body || {}) as { usuario?: unknown; clave?: unknown };
  login(body.usuario, body.clave).then(function (r) {
    res.cookie('sga_token', r.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: r.duracionMin * 60000,
    });
    res.json({ ok: true, usuario: perfilPublico_(r.ctx) });
  }, next);
});

router.post('/logout', requireSesion, function (req, res, next) {
  cerrarSesion(req.ctx as NonNullable<typeof req.ctx>).then(function () {
    res.clearCookie('sga_token', { path: '/' });
    res.json({ ok: true });
  }, next);
});

router.get('/bootstrap', requireSesion, function (req, res) {
  const ctx = req.ctx as NonNullable<typeof req.ctx>;
  // No se devuelve tokenHash: el cliente solo necesita el perfil y sus permisos.
  res.json({ ok: true, usuario: perfilPublico_(ctx), permisos: ctx.permisos, set: ctx.set });
});

router.post('/cambiar-clave', requireSesion, function (req, res, next) {
  const body = (req.body || {}) as { actual?: unknown; nueva?: unknown };
  cambiarClave(req.ctx as NonNullable<typeof req.ctx>, body.actual, body.nueva).then(function () {
    res.json({ ok: true });
  }, next);
});

export default router;
