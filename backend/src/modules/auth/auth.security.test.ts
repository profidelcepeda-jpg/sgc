/*********************************************************************
 * auth.security.test.ts — Pruebas de seguridad básicas
 * Transcripción de las 5 pruebasSeguridad_ de legacy/Tests.js, más las
 * verificaciones de v1/v2/bcrypt y de la comparación en tiempo constante.
 * Son funciones PURAS: no tocan la base de datos.
 *********************************************************************/

import { describe, it, expect } from 'vitest';
import {
  hashClave_, verificarClave_, pinDebil_, claveTemporal_, validarPoliticaClave_,
  iguales_, correoValido_, hashBcrypt_, VERSION_BCRYPT,
} from './auth.util';
import { ErrorApp, estadoHttpDeCodigo } from '../../lib/errors';
import { bloqueoPorClaveTemporal_ } from '../../middleware/auth';

/** rech de pruebasSeguridad_: la política debe rechazar con ErrorApp. */
function rech(v: unknown): boolean {
  try { validarPoliticaClave_(v); return false; } catch (e) { return e instanceof ErrorApp; }
}

describe('Pruebas de seguridad (transcripción de pruebasSeguridad_ de Tests.js)', () => {
  it('1. Hash determinista y distinto con otra clave', () => {
    const h1 = hashClave_('Clave1234', 'sal'), h2 = hashClave_('Clave1234', 'sal'), h3 = hashClave_('Clave1235', 'sal');
    expect(h1 === h2 && h1 !== h3 && h1.indexOf('v2$') === 0
      && verificarClave_('Clave1234', 'sal', h1, 2)
      && !verificarClave_('x', 'sal', h1, 2)).toBe(true);
  });

  it('2. PIN: solo 4 dígitos', () => {
    expect(rech('abc') && rech('12345') && rech('12a4') && rech('') && !rech('4821')).toBe(true);
  });

  it('3. PIN evidente rechazado', () => {
    expect(rech('1111') && rech('1234') && rech('0000')).toBe(true);
  });

  it('4. PIN temporal generado válido', () => {
    expect(/^\d{4}$/.test(claveTemporal_()) && !pinDebil_(claveTemporal_())).toBe(true);
  });

  it('5. Correo inválido', () => {
    expect(!correoValido_('a@b') && correoValido_('a@b.co')).toBe(true);
  });

  it('6. Comparación segura', () => {
    expect(iguales_('abc', 'abc') && !iguales_('abc', 'abd')).toBe(true);
  });

  it('7. v1 (sin pimienta) se verifica con su versión', () => {
    const h = hashClave_('Clave1234', 'sal', 'v1');
    expect(h.startsWith('v1$')).toBe(true);
    expect(verificarClave_('Clave1234', 'sal', h, 1)).toBe(true);
    expect(verificarClave_('Clave1235', 'sal', h, 1)).toBe(false);
  });

  it('8. La pimienta cambia el hash v2 (sin SGA_PEPPER no verifican las credenciales legadas v2)', () => {
    const sinPimienta = hashClave_('Clave1234', 'sal');
    process.env.SGA_PEPPER = 'pimienta-de-prueba';
    const conPimienta = hashClave_('Clave1234', 'sal');
    delete process.env.SGA_PEPPER;
    expect(conPimienta === sinPimienta).toBe(false);
    expect(verificarClave_('Clave1234', 'sal', conPimienta, 2)).toBe(false); // la pimienta correcta no está configurada
  });

  it('9. Hash nuevo bcrypt (versión 3) se verifica', () => {
    const h = hashBcrypt_('4821');
    expect(verificarClave_('4821', '(bcrypt)', h, VERSION_BCRYPT)).toBe(true);
    expect(verificarClave_('5827', '(bcrypt)', h, VERSION_BCRYPT)).toBe(false);
  });

  it('10. PIN débil no se genera nunca como temporal', () => {
    for (let i = 0; i < 20; i++) expect(!pinDebil_(claveTemporal_())).toBe(true);
  });
});

describe('Clave temporal (debeCambiar) — apiEjecutar de Code.js', () => {
  const base = {
    id: 'USR-000001', usuario: 'x', nombre: 'x', correo: null, rol: 'DOCENTE',
    idDocente: null, permisos: [], set: {}, debeCambiar: false,
  };
  it('sin clave temporal no bloquea', () => {
    expect(bloqueoPorClaveTemporal_(base)).toBeNull();
  });
  it('con clave temporal bloquea con código CAMBIAR_CLAVE', () => {
    const e = bloqueoPorClaveTemporal_(Object.assign({}, base, { debeCambiar: true }));
    expect(e instanceof ErrorApp).toBe(true);
    expect(e?.codigo).toBe('CAMBIAR_CLAVE');
    expect(estadoHttpDeCodigo('CAMBIAR_CLAVE')).toBe(403);
  });
});
