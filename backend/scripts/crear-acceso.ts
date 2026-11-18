/*********************************************************************
 * crear-acceso.ts — Crea o restablece el acceso de un usuario (CLI)
 *
 * Por diseño NO se migraron las credenciales del legado (PIN de 4 dígitos
 * con hash SHA-256×400: sin la pimienta de las Propiedades del script son
 * irrecuperables). Este script crea la credencial NUEVA (bcrypt, versión 3,
 * debeCambiar = true) para que el usuario entre y cambie su PIN.
 *
 * Uso:  npx tsx scripts/crear-acceso.ts [usuario] [PIN] [--permanente]
 *       npx tsx scripts/crear-acceso.ts              → usuario "admin", PIN aleatorio
 *       npx tsx scripts/crear-acceso.ts 707 4821     → restablece el acceso de "707"
 *       ... 4821 --permanente                        → uso de DEMOSTRACIÓN: no obliga
 *                                                      a cambiar el PIN al entrar
 *********************************************************************/

import dotenv from 'dotenv';
import path from 'path';

// El .env vive junto al schema de Prisma (SGA/database/.env)
dotenv.config({ path: path.resolve(__dirname, '../../database/.env') });

import { prisma } from '../src/lib/db';
import { claveTemporal_, hashBcrypt_, pinDebil_, VERSION_BCRYPT, validarPoliticaClave_, limpiar_ } from '../src/modules/auth/auth.util';

async function main() {
  const args = process.argv.slice(2).filter(function (a) { return a !== '--permanente'; });
  const permanente = process.argv.indexOf('--permanente') >= 0;
  const usuarioArg = limpiar_(args[0] || 'admin').toLowerCase();
  const pin = String(args[1] || claveTemporal_());
  validarPoliticaClave_(pin); // 4 dígitos, no evidente

  const rol = await prisma.role.findUnique({ where: { id: 'ADMINISTRADOR' } });
  if (!rol) throw new Error('No existe el rol ADMINISTRADOR. Ejecute primero el seed (SGA/database).');

  let u = await prisma.user.findFirst({
    where: { usuario: { equals: usuarioArg, mode: 'insensitive' } },
  });
  if (!u) {
    // Nuevo usuario administrador; id legado USR-000001… siguiente al mayor
    const ultimo = await prisma.user.findFirst({
      where: { id: { startsWith: 'USR-' } }, orderBy: { id: 'desc' }, select: { id: true },
    });
    const m = ultimo ? /^USR-(\d+)$/.exec(ultimo.id) : null;
    const id = m ? 'USR-' + String(parseInt(m[1], 10) + 1).padStart(6, '0') : 'USR-000001';
    u = await prisma.user.create({
      data: {
        id: id, nombre: 'Administrador', apellidos: 'Del sistema', usuario: usuarioArg,
        rolId: 'ADMINISTRADOR', estado: 'ACTIVO', creado: new Date(), modificado: new Date(),
      },
    });
    console.log('Usuario creado: ' + u.id);
  } else {
    console.log('Usuario existente: ' + u.id + ' (rol ' + u.rolId + ' — la credencial nueva NO cambia su rol)');
  }

  await prisma.credential.upsert({
    where: { userId: u.id },
    update: {
      hash: hashBcrypt_(pin), salt: '(bcrypt)', version: VERSION_BCRYPT,
      debeCambiar: !permanente, intentosFallidos: 0, bloqueadoHasta: null, fechaCambio: new Date(),
    },
    create: {
      userId: u.id, hash: hashBcrypt_(pin), salt: '(bcrypt)', version: VERSION_BCRYPT,
      debeCambiar: !permanente, fechaCambio: new Date(),
    },
  });
  // El restablecimiento de acceso revoca las sesiones activas (revocarSesiones_ del legado)
  await prisma.session.updateMany({ where: { userId: u.id, estado: 'ACTIVA' }, data: { estado: 'CERRADA' } });
  await prisma.user.update({ where: { id: u.id }, data: { sesionesRevocadas: new Date() } });
  await prisma.auditLog.create({
    data: { fecha: new Date(), usuario: usuarioArg, accion: 'RESTABLECER_ACCESO', modulo: 'AUTENTICACION',
            idRegistro: u.id, descripcion: 'Credencial creada por crear-acceso.ts (debeCambiar=' + (permanente ? 'NO' : 'SI') + ')' },
  });

  console.log('');
  console.log('ACCESO CREADO — usuario: ' + usuarioArg + '   PIN: ' + pin);
  if (permanente) {
    console.log('PIN DEFINITIVO (--permanente): solo para demostración; no se exige cambiarlo.');
  } else {
    console.log('El PIN es temporal (debeCambiar=true): debe cambiarse en el primer inicio de sesión.');
  }
  console.log('Guarde este PIN ahora: no se puede recuperar del hash.');
}

main()
  .catch(function (e) { console.error('ERROR:', e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(function () { return prisma.$disconnect(); });
