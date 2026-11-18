import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db';
import { ErrorApp, exigir } from '../../lib/errors';
import { siguienteIdTx_ } from '../../lib/ids';
import { Ctx } from '../auth/auth.service';
import { exigirPermiso } from '../crud/autorizacion';

const LIMITE_USUARIOS = 50;
const texto = (value: unknown) => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim() : '';
const permisoDeSeguridad = (ctx: Ctx, permiso: string) => exigirPermiso(ctx, permiso);

function normalizarPermisos(value: unknown, validos: Set<string>): string[] {
  if (!Array.isArray(value) || value.some(p => typeof p !== 'string')) {
    throw new ErrorApp('La lista de permisos no es válida.', 'VALIDACION');
  }
  const items = Array.from(new Set((value as string[]).map(p => p.trim()).filter(Boolean)));
  const desconocidos = items.filter(p => !validos.has(p));
  if (desconocidos.length) throw new ErrorApp(`Permiso no existente: ${desconocidos[0]}.`, 'VALIDACION');
  return items;
}

async function catalogoPermisos() {
  return prisma.permission.findMany({ orderBy: [{ modulo: 'asc' }, { id: 'asc' }] });
}

/** Vista segura de roles; no incluye credenciales ni sesiones. */
export async function listarRoles(ctx: Ctx) {
  permisoDeSeguridad(ctx, 'roles.ver');
  const [roles, catalogo] = await Promise.all([
    prisma.role.findMany({
      include: { permissions: { select: { permissionId: true } }, _count: { select: { users: true } } },
      orderBy: [{ esSistema: 'desc' }, { nombre: 'asc' }],
    }),
    catalogoPermisos(),
  ]);
  const todos = catalogo.map(p => p.id);
  return {
    roles: roles.map(r => ({
      id: r.id, nombre: r.nombre, descripcion: r.descripcion, sistema: r.esSistema, estado: r.estado,
      usuarios: r._count.users,
      permisos: r.id === 'ADMINISTRADOR' ? todos : r.permissions.map(p => p.permissionId),
      inmutable: r.id === 'ADMINISTRADOR',
    })),
    catalogo: catalogo.map(p => ({ id: p.id, modulo: p.modulo, descripcion: p.descripcion })),
    puedeAdministrar: ctx.set['roles.administrar'] === true,
  };
}

export async function listarPermisos(ctx: Ctx) {
  permisoDeSeguridad(ctx, 'roles.ver');
  const items = await catalogoPermisos();
  return { items: items.map(p => ({ id: p.id, modulo: p.modulo, descripcion: p.descripcion })) };
}

function nombreDeRol(value: unknown) {
  const nombre = texto(value).slice(0, 40);
  if (nombre.length < 3) throw new ErrorApp('El nombre del rol debe tener entre 3 y 40 caracteres.', 'VALIDACION');
  const id = nombre.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (id.length < 3) throw new ErrorApp('El nombre del rol no es válido.', 'VALIDACION');
  return { id, nombre };
}

function esUnico(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

async function invalidarSesionesDelRol(tx: Prisma.TransactionClient, roleId: string, ahora: Date) {
  const users = await tx.user.findMany({ where: { rolId: roleId }, select: { id: true } });
  const ids = users.map(u => u.id);
  if (!ids.length) return;
  await tx.user.updateMany({ where: { id: { in: ids } }, data: { sesionesRevocadas: ahora } });
  await tx.session.updateMany({ where: { userId: { in: ids }, estado: 'ACTIVA' }, data: { estado: 'CERRADA' } });
}

export async function crearRol(ctx: Ctx, data: { nombre?: unknown; descripcion?: unknown; permisos?: unknown }) {
  permisoDeSeguridad(ctx, 'roles.administrar');
  const { id, nombre } = nombreDeRol(data.nombre);
  const descripcion = texto(data.descripcion).slice(0, 200) || null;
  const catalogo = await catalogoPermisos();
  const permisos = normalizarPermisos(data.permisos ?? [], new Set(catalogo.map(p => p.id)));
  const ahora = new Date();
  try {
    await prisma.$transaction(async tx => {
      await tx.role.create({ data: { id, nombre, descripcion, esSistema: false, estado: 'ACTIVO', creado: ahora, modificado: ahora } });
      if (permisos.length) await tx.rolePermission.createMany({ data: permisos.map(permissionId => ({ roleId: id, permissionId })) });
      await tx.auditLog.create({
        data: { fecha: ahora, usuario: ctx.usuario, accion: 'CREAR', modulo: 'ROLES', idRegistro: id,
          descripcion: `Rol ${id} creado con ${permisos.length} permisos`, valorNuevo: permisos as unknown as Prisma.InputJsonValue },
      });
    });
  } catch (e) {
    if (esUnico(e)) throw new ErrorApp('Ya existe un rol con ese identificador.', 'CONFLICTO');
    throw e;
  }
  return { id };
}

export async function actualizarRol(ctx: Ctx, roleId: string, data: { descripcion?: unknown; estado?: unknown }) {
  permisoDeSeguridad(ctx, 'roles.administrar');
  if (roleId === 'ADMINISTRADOR') throw new ErrorApp('El rol Administrador no se puede modificar.', 'CONFLICTO');
  const previo = await prisma.role.findUnique({ where: { id: roleId }, include: { permissions: { select: { permissionId: true } } } });
  exigir(previo, 'El rol no existe.');
  const descripcion = data.descripcion === undefined ? previo.descripcion : (texto(data.descripcion).slice(0, 200) || null);
  const estado = data.estado === undefined ? previo.estado : texto(data.estado);
  if (!['ACTIVO', 'INACTIVO'].includes(estado)) throw new ErrorApp('Estado de rol no válido.', 'VALIDACION');
  const ahora = new Date();
  await prisma.$transaction(async tx => {
    await tx.role.update({ where: { id: roleId }, data: { descripcion, estado, modificado: ahora } });
    if (estado !== previo.estado) await invalidarSesionesDelRol(tx, roleId, ahora);
    await tx.auditLog.create({
      data: { fecha: ahora, usuario: ctx.usuario, accion: estado !== previo.estado ? 'ESTADO' : 'EDITAR', modulo: 'ROLES', idRegistro: roleId,
        descripcion: `Rol ${roleId} actualizado`, valorAnterior: { descripcion: previo.descripcion, estado: previo.estado },
        valorNuevo: { descripcion, estado } },
    });
  });
  return { id: roleId };
}

export async function reemplazarPermisosRol(ctx: Ctx, roleId: string, permissionsRaw: unknown) {
  permisoDeSeguridad(ctx, 'roles.administrar');
  if (roleId === 'ADMINISTRADOR') throw new ErrorApp('El Administrador siempre tiene todos los permisos.', 'CONFLICTO');
  const catalogo = await catalogoPermisos();
  const permisos = normalizarPermisos(permissionsRaw, new Set(catalogo.map(p => p.id)));
  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { permissions: { select: { permissionId: true } } } });
  exigir(role, 'El rol no existe.');
  const anterior = role.permissions.map(p => p.permissionId).sort();
  const nuevos = [...permisos].sort();
  if (anterior.length === nuevos.length && anterior.every((p, i) => p === nuevos[i])) return { id: roleId, permisos: nuevos.length, sinCambios: true };
  const ahora = new Date();
  await prisma.$transaction(async tx => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (nuevos.length) await tx.rolePermission.createMany({ data: nuevos.map(permissionId => ({ roleId, permissionId })) });
    await tx.role.update({ where: { id: roleId }, data: { modificado: ahora } });
    await invalidarSesionesDelRol(tx, roleId, ahora);
    await tx.auditLog.create({
      data: { fecha: ahora, usuario: ctx.usuario, accion: 'PERMISOS', modulo: 'ROLES', idRegistro: roleId,
        descripcion: `Permisos del rol ${roleId}: ${anterior.length} → ${nuevos.length}`,
        valorAnterior: anterior as unknown as Prisma.InputJsonValue, valorNuevo: nuevos as unknown as Prisma.InputJsonValue },
    });
  });
  return { id: roleId, permisos: nuevos.length, sinCambios: false };
}

export async function usuariosDeRol(ctx: Ctx, roleId: string, pageRaw: unknown, sizeRaw: unknown) {
  permisoDeSeguridad(ctx, 'roles.ver');
  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { permissions: { select: { permissionId: true } } } });
  exigir(role, 'El rol no existe.');
  const page = Math.max(1, Math.floor(Number(pageRaw) || 1));
  const size = Math.min(LIMITE_USUARIOS, Math.max(1, Math.floor(Number(sizeRaw) || 20)));
  const where = { rolId: roleId };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select: { id: true, usuario: true, nombre: true, apellidos: true, correo: true, teacherId: true, estado: true, permisosExtra: true, permisosDenegados: true }, orderBy: { usuario: 'asc' }, skip: (page - 1) * size, take: size }),
  ]);
  const efectivosRol = roleId === 'ADMINISTRADOR' ? (await catalogoPermisos()).map(p => p.id) : role.permissions.map(p => p.permissionId);
  return { items: users.map(u => {
    const efectivos = new Set(efectivosRol);
    if (roleId !== 'ADMINISTRADOR') {
      (u.permisosExtra || []).forEach(p => efectivos.add(p));
      (u.permisosDenegados || []).forEach(p => efectivos.delete(p));
    }
    return { id: u.id, usuario: u.usuario, nombre: `${u.nombre} ${u.apellidos}`.trim(), correo: u.correo, docenteId: u.teacherId, estado: u.estado,
      heredados: efectivosRol, adicionales: u.permisosExtra, denegados: u.permisosDenegados, efectivos: Array.from(efectivos) };
  }), total, pag: page, paginas: Math.ceil(total / size) };
}
