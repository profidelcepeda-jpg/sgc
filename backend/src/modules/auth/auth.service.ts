/*********************************************************************
 * auth.service.ts — Autenticación, sesiones, roles y permisos
 * Transcripción del flujo de legacy/Auth.js a Prisma + PostgreSQL:
 *   login → valida credenciales (hash con sal, bloqueo por intentos, contador
 *   en memoria anti-fuerza bruta, hash ficticio anti-enumeración) → crea sesión
 *   (token aleatorio de 64 hex; en la BD solo se guarda su SHA-256) → el cliente
 *   envía el token en cada llamada (cookie httpOnly) → requireAuth lo valida
 *   en el SERVIDOR antes de cada operación.
 *
 * Diferencias deliberadas con el legado (documentadas en docs/architecture/
 * api-y-seguridad-legacy.md): el historial de auditoría se escribe en la MISMA
 * transacción (el buffer del legado podía perder filas en silencio) y las
 * sesiones revocadas usan users.sesiones_revocadas (antes una propiedad).
 *********************************************************************/

import { Prisma, User } from '@prisma/client';
import { prisma } from '../../lib/db';
import { leerValoresConfig } from '../configuration/configuration.service';
import { ErrorApp, exigir } from '../../lib/errors';
import {
  hashBcrypt_, hashClave_, limpiar_, nuevoToken_, sha256Hex_, VERSION_BCRYPT,
  validarPoliticaClave_, verificarClave_,
} from './auth.util';

/* ---------------- Roles y permisos ---------------- */

/** permisosEfectivos_ de Auth.js: rol + extras − denegados; ADMINISTRADOR tiene todos. */
export async function permisosEfectivos_(
  rolId: string, permisosExtra: string[], permisosDenegados: string[],
): Promise<string[]> {
  if (rolId === 'ADMINISTRADOR') {
    return (await prisma.permission.findMany({ select: { id: true } })).map(function (p) { return p.id; });
  }
  const set = new Set<string>();
  (await prisma.rolePermission.findMany({ where: { roleId: rolId }, select: { permissionId: true } }))
    .forEach(function (r) { set.add(r.permissionId); });
  (permisosExtra || []).forEach(function (p) { const t = p.trim(); if (t) set.add(t); });
  (permisosDenegados || []).forEach(function (p) { set.delete(p.trim()); });
  return Array.from(set);
}

/** Contexto del usuario (contextoDe_ de Auth.js). */
export interface Ctx {
  id: string; usuario: string; nombre: string; correo: string | null; rol: string;
  idDocente: string | null; permisos: string[]; set: Record<string, true>;
  debeCambiar: boolean; tokenHash?: string;
}

export async function contextoDe_(
  u: Pick<User, 'id' | 'usuario' | 'nombre' | 'apellidos' | 'correo' | 'rolId' | 'teacherId' | 'permisosExtra' | 'permisosDenegados'>,
  debeCambiar: boolean,
): Promise<Ctx> {
  const permisos = await permisosEfectivos_(u.rolId, u.permisosExtra, u.permisosDenegados);
  const set: Record<string, true> = {};
  permisos.forEach(function (p) { set[p] = true; });
  return {
    id: u.id, usuario: u.usuario, nombre: (u.nombre + ' ' + (u.apellidos || '')).trim(), correo: u.correo,
    rol: u.rolId, idDocente: u.teacherId, permisos: permisos, set: set, debeCambiar: !!debeCambiar,
  };
}

/** perfilPublico_ de Auth.js */
export function perfilPublico_(ctx: Ctx) {
  return { id: ctx.id, usuario: ctx.usuario, nombre: ctx.nombre, rol: ctx.rol, idDocente: ctx.idDocente, debeCambiar: ctx.debeCambiar };
}

/* ---------------- Configuración (Config.js → tabla config) ---------------- */

const CFG_DEFECTO = { DURACION_SESION_MIN: 480, MAX_INTENTOS_LOGIN: 5, MINUTOS_BLOQUEO: 10 };
type CfgSeguridad = typeof CFG_DEFECTO;
let cfgCache: { valores: CfgSeguridad; expira: number } | null = null;

async function configValores(): Promise<CfgSeguridad> {
  if (cfgCache && cfgCache.expira > Date.now()) return cfgCache.valores;
  const v: CfgSeguridad = { ...CFG_DEFECTO };
  const config = await leerValoresConfig(Object.keys(CFG_DEFECTO));
  Object.keys(CFG_DEFECTO).forEach(function (k) {
    const n = parseInt(config[k], 10);
    if (isFinite(n) && n > 0) (v as unknown as Record<string, number>)[k] = n;
  });
  cfgCache = { valores: v, expira: Date.now() + 60_000 };
  return v;
}
export function invalidarCacheConfig(): void { cfgCache = null; }

/* ---------------- Contador de fallos en memoria (bloqueoCache_ del legado) ---------------- */

const fallosMemoria = new Map<string, { n: number; expira: number }>();

function claveFallos_(usuarioTxt: string): string { return sha256Hex_(usuarioTxt).slice(0, 24); }

function fallosDe_(kf: string): number {
  const e = fallosMemoria.get(kf);
  if (!e) return 0;
  if (e.expira < Date.now()) { fallosMemoria.delete(kf); return 0; }
  return e.n;
}

function sumarFallo_(kf: string, minutos: number, minimo?: number): void {
  const e = fallosMemoria.get(kf);
  const previo = e && e.expira >= Date.now() ? e.n : 0;
  fallosMemoria.set(kf, { n: Math.max(previo + 1, minimo || 0), expira: Date.now() + minutos * 60000 });
}

/* ---------------- Creación de sesiones ---------------- */

async function crearSesionEn_(tx: Prisma.TransactionClient, idUsuario: string, duracionMin: number): Promise<string> {
  const token = nuevoToken_();
  const th = sha256Hex_(token); // el token en claro NUNCA se guarda
  const ahora = new Date();
  const expira = new Date(ahora.getTime() + duracionMin * 60000);
  // IDs legados SES-000001…: siguiente al mayor existente
  const ultimo = await tx.session.findFirst({
    where: { id: { startsWith: 'SES-' } }, orderBy: { id: 'desc' }, select: { id: true },
  });
  const m = ultimo ? /^SES-(\d+)$/.exec(ultimo.id) : null;
  const id = m ? 'SES-' + String(parseInt(m[1], 10) + 1).padStart(6, '0')
               : 'SES-' + nuevoToken_().slice(0, 8);
  await tx.session.create({
    data: { id: id, userId: idUsuario, tokenHash: th, creada: ahora, expira: expira, ultimaActividad: ahora, estado: 'ACTIVA' },
  });
  return token;
}

/** revocarSesiones_ de Auth.js: invalida todas las sesiones de un usuario (restablecer acceso, cambiar rol, desactivar). */
export async function revocarSesiones_(idUsuario: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: idUsuario }, data: { sesionesRevocadas: new Date() } }),
    prisma.session.updateMany({ where: { userId: idUsuario, estado: 'ACTIVA' }, data: { estado: 'CERRADA' } }),
  ]);
}

/* ---------------- Inicio de sesión ---------------- */

function msgBloqueo_(min: number): string {
  return 'Cuenta bloqueada temporalmente por demasiados intentos. Espere ' + min +
    ' minutos o pida al administrador que restablezca su acceso.';
}

/**
 * login_ de Auth.js. Devuelve el token (para la cookie httpOnly) y el contexto.
 * Al verificar un hash legado v1/v2 correctamente, la credencial se re-hashea a
 * bcrypt (versión 3) — plan de migración de credenciales decidido en el diseño.
 */
export async function login(usuarioTxt: unknown, claveTxt: unknown): Promise<{ token: string; ctx: Ctx; duracionMin: number }> {
  const cfg = await configValores();
  const usuario = limpiar_(usuarioTxt).toLowerCase();
  const clave = String(claveTxt || '');
  exigir(usuario && clave, 'Escriba su usuario y su PIN.', 'LOGIN');

  const kf = claveFallos_(usuario);
  const fallosCache = fallosDe_(kf);
  exigir(fallosCache < cfg.MAX_INTENTOS_LOGIN * 2, msgBloqueo_(cfg.MINUTOS_BLOQUEO), 'BLOQUEO');
  const generico = new ErrorApp('Usuario o PIN incorrectos.', 'LOGIN');

  const u = await prisma.user.findFirst({
    where: { OR: [{ usuario: { equals: usuario, mode: 'insensitive' } }, { correo: { equals: usuario, mode: 'insensitive' } }] },
    include: { credential: true, role: true },
  });
  if (!u || !u.credential) {
    // se calcula igualmente un hash para no revelar (por tiempo) si el usuario existe
    hashClave_(clave, 'sal-ficticia');
    sumarFallo_(kf, cfg.MINUTOS_BLOQUEO);
    throw generico;
  }
  const cred = u.credential;
  if (cred.bloqueadoHasta && cred.bloqueadoHasta.getTime() > Date.now()) {
    sumarFallo_(kf, Math.max(cfg.MINUTOS_BLOQUEO, 1), cfg.MAX_INTENTOS_LOGIN);
    throw new ErrorApp(msgBloqueo_(cfg.MINUTOS_BLOQUEO), 'BLOQUEO');
  }
  const ok = verificarClave_(clave, cred.salt, cred.hash, cred.version);
  const activo = u.estado === 'ACTIVO' && u.role.estado !== 'INACTIVO';
  if (!ok || !activo) {
    const n = cred.intentosFallidos + 1;
    const bloquear = n >= cfg.MAX_INTENTOS_LOGIN;
    await prisma.$transaction([
      prisma.credential.update({
        where: { userId: u.id },
        data: bloquear
          ? { intentosFallidos: 0, bloqueadoHasta: new Date(Date.now() + cfg.MINUTOS_BLOQUEO * 60000) }
          : { intentosFallidos: { increment: 1 } },
      }),
      prisma.auditLog.create({
        data: { fecha: new Date(), usuario: u.usuario, accion: 'LOGIN_FALLIDO', modulo: 'AUTENTICACION',
                idRegistro: u.id, descripcion: ok ? 'Cuenta inactiva' : 'PIN incorrecto' },
      }),
    ]);
    sumarFallo_(kf, cfg.MINUTOS_BLOQUEO);
    throw generico;
  }

  const debeCambiar = cred.debeCambiar;
  const duracionMin = Math.max(cfg.DURACION_SESION_MIN, 5);
  const rehash = cred.version !== VERSION_BCRYPT; // credencial legado verificada → pasar a bcrypt
  const token = await prisma.$transaction(async function (tx) {
    await tx.credential.update({
      where: { userId: u.id },
      data: rehash
        ? { hash: hashBcrypt_(clave), salt: '(bcrypt)', version: VERSION_BCRYPT, intentosFallidos: 0, bloqueadoHasta: null }
        : { intentosFallidos: 0, bloqueadoHasta: null },
    });
    await tx.user.update({ where: { id: u.id }, data: { ultimoAcceso: new Date() } });
    const t = await crearSesionEn_(tx, u.id, duracionMin);
    await tx.auditLog.create({
      data: { fecha: new Date(), usuario: u.usuario, accion: 'LOGIN', modulo: 'AUTENTICACION', idRegistro: u.id, descripcion: 'Inicio de sesión' },
    });
    return t;
  });
  fallosMemoria.delete(kf);
  const ctx = await contextoDe_(u, debeCambiar);
  return { token: token, ctx: ctx, duracionMin: duracionMin };
}

/* ---------------- Validación de sesión (en CADA llamada) ---------------- */

/** sesionDe_ de Auth.js. */
export async function sesionDe(token: unknown): Promise<Ctx> {
  const malo = new ErrorApp('Su sesión expiró. Inicie sesión de nuevo.', 'SESION');
  if (!token || !/^[a-f0-9]{64}$/.test(String(token))) throw malo;
  const th = sha256Hex_(String(token));
  const s = await prisma.session.findUnique({
    where: { tokenHash: th },
    include: { user: { include: { credential: true, role: true } } },
  });
  if (!s || s.estado !== 'ACTIVA') throw malo;
  if (s.expira.getTime() < Date.now()) throw malo;
  const u = s.user;
  if (!u || u.estado !== 'ACTIVO' || u.role.estado === 'INACTIVO') throw malo;
  // acceso restablecido/desactivado después de crear esta sesión
  if (u.sesionesRevocadas && s.creada < u.sesionesRevocadas) throw malo;
  const ctx = await contextoDe_(u, u.credential ? u.credential.debeCambiar : false);
  ctx.tokenHash = th;
  return ctx;
}

/* ---------------- Cierre de sesión y cambio de PIN ---------------- */

/** cerrarSesion_ de Auth.js */
export async function cerrarSesion(ctx: Ctx): Promise<boolean> {
  await prisma.$transaction([
    prisma.session.updateMany({ where: { tokenHash: ctx.tokenHash || '' }, data: { estado: 'CERRADA' } }),
    prisma.auditLog.create({
      data: { fecha: new Date(), usuario: ctx.usuario, accion: 'LOGOUT', modulo: 'AUTENTICACION', idRegistro: ctx.id, descripcion: 'Cierre de sesión' },
    }),
  ]);
  return true;
}

/** cambiarClave_ de Auth.js. La nueva credencial se guarda con bcrypt (versión 3). */
export async function cambiarClave(ctx: Ctx, actual: unknown, nueva: unknown): Promise<boolean> {
  const cred = await prisma.credential.findUnique({ where: { userId: ctx.id } });
  exigir(cred, 'No se encontró su credencial.');
  exigir(verificarClave_(String(actual || ''), cred.salt, cred.hash, cred.version), 'El PIN actual no es correcto.', 'LOGIN');
  validarPoliticaClave_(nueva);
  exigir(String(nueva) !== String(actual), 'El PIN nuevo debe ser distinto del actual.');
  await prisma.$transaction([
    prisma.credential.update({
      where: { userId: ctx.id },
      data: { hash: hashBcrypt_(String(nueva)), salt: '(bcrypt)', version: VERSION_BCRYPT, debeCambiar: false,
              intentosFallidos: 0, bloqueadoHasta: null, fechaCambio: new Date() },
    }),
    prisma.auditLog.create({
      data: { fecha: new Date(), usuario: ctx.usuario, accion: 'CAMBIAR_CLAVE', modulo: 'AUTENTICACION', idRegistro: ctx.id, descripcion: 'El usuario cambió su PIN' },
    }),
  ]);
  return true;
}
