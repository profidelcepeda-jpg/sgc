/*********************************************************************
 * auth.middleware.ts — requireAuth y requirePermiso
 * Traducción REST de apiEjecutar(): la sesión se valida en el SERVIDOR
 * antes de cada operación (sesionDe_ del legado).
 *********************************************************************/

import { NextFunction, Request, Response } from 'express';
import { Ctx, sesionDe } from '../modules/auth/auth.service';
import { ErrorApp } from '../lib/errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { ctx?: Ctx; }
  }
}

/** Extrae el token: cookie httpOnly (navegador) o Authorization: Bearer (scripts). */
function tokenDe_(req: Request): string {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies || {};
  const porCookie = cookies['sga_token'];
  if (porCookie) return porCookie;
  const m = /^Bearer ([a-f0-9]{64})$/i.exec(String(req.headers.authorization || ''));
  return m ? m[1] : '';
}

/**
 * Valida la sesión SIN exigir el cambio de clave temporal. Se usa solo en las
 * rutas "libres" del legacy (bootstrap, logout, cambiar clave).
 */
export function requireSesion(req: Request, _res: Response, next: NextFunction): void {
  sesionDe(tokenDe_(req)).then(function (ctx) { req.ctx = ctx; next(); }, next);
}

/**
 * Regla de apiEjecutar (Code.js): con clave temporal (debeCambiar) se bloquea
 * toda operación salvo cambiar la clave, cerrar sesión y el bootstrap.
 * Se expone como función pura para poder probarla sin base de datos.
 */
export function bloqueoPorClaveTemporal_(ctx: Ctx): ErrorApp | null {
  if (!ctx.debeCambiar) return null;
  return new ErrorApp('Debe cambiar su contraseña temporal antes de continuar.', 'CAMBIAR_CLAVE');
}

/**
 * requireAuth: sesión válida y —transcripción de apiEjecutar (Code.js)— si el
 * usuario tiene una clave temporal (debeCambiar) se bloquea TODO lo demás.
 * Antes el backend nuevo no aplicaba esta regla y el PIN temporal daba acceso total.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  sesionDe(tokenDe_(req)).then(function (ctx) {
    const bloqueo = bloqueoPorClaveTemporal_(ctx);
    if (bloqueo) { next(bloqueo); return; }
    req.ctx = ctx;
    next();
  }, next);
}

/** exigirPermiso_ de Auth.js: si no lo tiene, ErrorApp('PERMISO') → 403. */
export function requirePermiso(permiso: string) {
  return function (req: Request, _res: Response, next: NextFunction): void {
    const ctx = req.ctx;
    if (!ctx || ctx.set[permiso] !== true) {
      next(new ErrorApp('No tiene permiso para realizar esta acción.', 'PERMISO'));
      return;
    }
    next();
  };
}
