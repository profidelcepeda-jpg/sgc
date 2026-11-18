/*********************************************************************
 * auth.util.ts — Utilidades de seguridad PURAS (sin base de datos)
 * Transcripción literal de Auth.js y Utils.js:
 *   hashClave_ (SHA-256 × SGA.HASH_ITER con sal y pimienta), verificarClave_,
 *   pinDebil_, claveTemporal_, validarPoliticaClave_, iguales_, correoValido_, limpiar_.
 * Los hash NUEVOS usan bcrypt (Credential.version = 3); los legados v1/v2 se
 * verifican igual que en producción y se rehash a bcrypt al iniciar sesión.
 *********************************************************************/

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { ErrorApp } from '../../lib/errors';

/** Config.js: SGA.HASH_ITER — iteraciones del hash de contraseñas legado. */
export const HASH_ITER = 400;

/** Credential.version para los hash NUEVOS (bcrypt). v1/v2 son los legados. */
export const VERSION_BCRYPT = 3;

export function sha256Hex_(s: string | Buffer): string { return crypto.createHash('sha256').update(s).digest('hex'); }

/** nuevaSal_ de Auth.js: 40 caracteres hexadecimales (uuid 32 + 8 del legado). */
export function nuevaSal_(): string { return crypto.randomBytes(20).toString('hex'); }

/** Token de sesión: 64 hex, exactamente lo que el regex del legado exige (^[a-f0-9]{64}$). */
export function nuevoToken_(): string { return crypto.randomBytes(32).toString('hex'); }

function sha256Bytes(b: Buffer): Buffer { return crypto.createHash('sha256').update(b).digest(); }

/**
 * hashClave_ de Auth.js. La "pimienta" es un secreto del servidor que se mezcla
 * en el hash (Propiedades del script en el legado; aquí la variable de entorno
 * SGA_PEPPER). SIN la pimienta correcta, los hash v2 del legado no verifican.
 *   v2: base = sal + ':' + pimienta + ':' + clave   (por defecto)
 *   v1: base = sal + ':' + clave                    (credenciales previas)
 * Luego 400 iteraciones: h = sha256(h ++ salBytes). Salida: "v1|v2$<hex>".
 */
export function hashClave_(clave: string, sal: string, version: 'v1' | 'v2' = 'v2'): string {
  const pepper = process.env.SGA_PEPPER || '';
  const base = version === 'v2' ? sal + ':' + pepper + ':' + clave : sal + ':' + clave;
  let h = sha256Bytes(Buffer.from(base, 'utf8'));
  const salBytes = Buffer.from(sal, 'utf8');
  for (let i = 0; i < HASH_ITER; i++) h = sha256Bytes(Buffer.concat([h, salBytes]));
  return version + '$' + h.toString('hex');
}

/** iguales_ de Utils.js: comparación en tiempo constante (con longitud igual). */
export function iguales_(a: string, b: string): boolean {
  const ba = Buffer.from(String(a), 'utf8'), bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * verificarClave_ de Auth.js, extendida: los hash del legado (v1/v2) se verifican
 * igual que en producción; los NUEVOS (version = 3) son bcrypt.
 */
export function verificarClave_(clave: string, sal: string, guardado: string, version: number): boolean {
  if (version === VERSION_BCRYPT) {
    try { return bcrypt.compareSync(String(clave || ''), String(guardado)); } catch { return false; }
  }
  const v: 'v1' | 'v2' = String(guardado).split('$')[0] === 'v1' ? 'v1' : 'v2';
  return iguales_(hashClave_(String(clave || ''), String(sal), v), String(guardado));
}

/** Hash NUEVO: bcrypt (incluye su propia sal; la columna salt queda como texto de contexto). */
export function hashBcrypt_(clave: string): string { return bcrypt.hashSync(String(clave), 12); }

/** pinDebil_ de Auth.js: se rechazan los PIN evidentes (0000, 1111…, 1234, 4321, 0123). */
export function pinDebil_(pin: string): boolean { return /^(\d)\1{3}$/.test(pin) || pin === '1234' || pin === '4321' || pin === '0123'; }

/** claveTemporal_ de Auth.js: PIN aleatorio de 4 dígitos que no sea débil. */
export function claveTemporal_(): string {
  for (let intento = 0; intento < 50; intento++) {
    const hex = crypto.randomBytes(16).toString('hex');
    let s = '';
    for (let i = 0; i < 4; i++) s += String(parseInt(hex.substr(i * 2, 2), 16) % 10);
    if (!pinDebil_(s)) return s;
  }
  return '5827';
}

/** validarPoliticaClave_ de Auth.js: el acceso es un PIN de exactamente 4 dígitos, no evidente. */
export function validarPoliticaClave_(clave: unknown): void {
  if (!(typeof clave === 'string' && /^\d{4}$/.test(clave))) throw new ErrorApp('El PIN debe tener exactamente 4 dígitos (solo números).');
  if (pinDebil_(clave)) throw new ErrorApp('Ese PIN es demasiado fácil de adivinar (por ejemplo 1111 o 1234). Elija otro.');
}

/** correoValido_ de Utils.js */
export function correoValido_(s: unknown): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '')); }

/** limpiar_ de Utils.js */
export function limpiar_(s: unknown): string { return String(s === null || s === undefined ? '' : s).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim(); }
