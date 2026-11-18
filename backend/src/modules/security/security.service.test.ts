import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApp } from '../../lib/errors';

const m = vi.hoisted(() => ({
  roleFindMany: vi.fn(), roleFindUnique: vi.fn(), roleCreate: vi.fn(), roleUpdate: vi.fn(),
  permissionFindMany: vi.fn(), userCount: vi.fn(), userFindMany: vi.fn(),
  transaction: vi.fn(), rpDeleteMany: vi.fn(), rpCreateMany: vi.fn(), auditCreate: vi.fn(),
  txRoleCreate: vi.fn(), txRoleUpdate: vi.fn(), txUserFindMany: vi.fn(), txUserUpdateMany: vi.fn(), txSessionUpdateMany: vi.fn(), txAuditCreate: vi.fn(),
}));

vi.mock('../../lib/db', () => ({ prisma: {
  role: { findMany: m.roleFindMany, findUnique: m.roleFindUnique, create: m.roleCreate, update: m.roleUpdate },
  permission: { findMany: m.permissionFindMany }, user: { count: m.userCount, findMany: m.userFindMany },
  $transaction: m.transaction,
} }));
vi.mock('../crud/autorizacion', () => ({ exigirPermiso: (ctx: { set: Record<string, boolean> }, key: string) => {
  if (ctx.set[key] !== true) throw new ErrorApp('No tiene permiso.', 'PERMISO');
} }));

import { actualizarRol, crearRol, listarRoles, reemplazarPermisosRol, usuariosDeRol } from './security.service';
import type { Ctx } from '../auth/auth.service';

const ctx = (permissions: Record<string, true> = { 'roles.ver': true, 'roles.administrar': true }): Ctx => ({
  id: 'USR-1', usuario: 'adminsec', nombre: 'Security Admin', correo: null, rol: 'COORDINADOR', idDocente: null,
  permisos: Object.keys(permissions), set: permissions, debeCambiar: false,
});
const catalog = [{ id: 'estudiantes.ver', modulo: 'estudiantes', descripcion: 'Ver estudiantes' }, { id: 'reportes.ver', modulo: 'reportes', descripcion: 'Ver reportes' }];

describe('servicio de roles y permisos', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.permissionFindMany.mockResolvedValue(catalog);
    m.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      role: { create: m.txRoleCreate, update: m.txRoleUpdate },
      rolePermission: { deleteMany: m.rpDeleteMany, createMany: m.rpCreateMany },
      user: { findMany: m.txUserFindMany, updateMany: m.txUserUpdateMany },
      session: { updateMany: m.txSessionUpdateMany }, auditLog: { create: m.txAuditCreate },
    }));
  });

  it('requiere roles.ver antes de listar el catálogo', async () => {
    await expect(listarRoles(ctx({}))).rejects.toMatchObject({ codigo: 'PERMISO' });
    expect(m.roleFindMany).not.toHaveBeenCalled();
  });

  it('presenta todos los permisos al ADMINISTRADOR como efectivos e inmutables', async () => {
    m.roleFindMany.mockResolvedValue([{ id: 'ADMINISTRADOR', nombre: 'Administrador', descripcion: null, esSistema: true, estado: 'ACTIVO', permissions: [], _count: { users: 1 } }]);
    const result = await listarRoles(ctx({ 'roles.ver': true }));
    expect(result.roles[0].permisos).toEqual(catalog.map(p => p.id));
    expect(result.roles[0].inmutable).toBe(true);
    expect(result.puedeAdministrar).toBe(false);
  });

  it('rechaza permisos que no están en el catálogo antes de abrir transacción', async () => {
    m.roleFindUnique.mockResolvedValue({ id: 'DOCENTE', permissions: [] });
    await expect(reemplazarPermisosRol(ctx(), 'DOCENTE', ['inventado.admin'])).rejects.toMatchObject({ codigo: 'VALIDACION' });
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it('conserva la excepción del ADMINISTRADOR e impide cambiar sus permisos', async () => {
    await expect(reemplazarPermisosRol(ctx(), 'ADMINISTRADOR', [])).rejects.toMatchObject({ codigo: 'CONFLICTO' });
    expect(m.permissionFindMany).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it('reemplaza permisos, audita y revoca sesiones de usuarios del rol atómicamente', async () => {
    m.roleFindUnique.mockResolvedValue({ id: 'DOCENTE', permissions: [{ permissionId: 'estudiantes.ver' }] });
    m.txUserFindMany.mockResolvedValue([{ id: 'USR-2' }]);
    await expect(reemplazarPermisosRol(ctx(), 'DOCENTE', ['reportes.ver'])).resolves.toMatchObject({ permisos: 1, sinCambios: false });
    expect(m.rpDeleteMany).toHaveBeenCalledWith({ where: { roleId: 'DOCENTE' } });
    expect(m.rpCreateMany).toHaveBeenCalledWith({ data: [{ roleId: 'DOCENTE', permissionId: 'reportes.ver' }] });
    expect(m.txUserUpdateMany).toHaveBeenCalled();
    expect(m.txSessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: { in: ['USR-2'] }, estado: 'ACTIVA' } }));
    expect(m.txAuditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ modulo: 'ROLES', accion: 'PERMISOS', valorAnterior: ['estudiantes.ver'], valorNuevo: ['reportes.ver'] }) }));
  });

  it('permite crear un rol sin asignarle permisos por defecto', async () => {
    await expect(crearRol(ctx(), { nombre: 'Apoyo Aula' })).resolves.toEqual({ id: 'APOYO_AULA' });
    expect(m.txRoleCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ id: 'APOYO_AULA', esSistema: false, estado: 'ACTIVO' }) }));
    expect(m.rpCreateMany).not.toHaveBeenCalled();
  });

  it('rechaza desactivar al administrador', async () => {
    await expect(actualizarRol(ctx(), 'ADMINISTRADOR', { estado: 'INACTIVO' })).rejects.toMatchObject({ codigo: 'CONFLICTO' });
    expect(m.roleFindUnique).not.toHaveBeenCalled();
  });

  it('lista miembros con selección explícita sin campos de credenciales', async () => {
    m.roleFindUnique.mockResolvedValue({ id: 'DOCENTE', permissions: [{ permissionId: 'estudiantes.ver' }] });
    m.userCount.mockResolvedValue(1);
    m.userFindMany.mockResolvedValue([{ id: 'USR-2', usuario: 'docente1', nombre: 'Ana', apellidos: 'Pérez', correo: null, teacherId: 'DOC-1', estado: 'ACTIVO' }]);
    await usuariosDeRol(ctx({ 'roles.ver': true }), 'DOCENTE', 1, 20);
    expect(m.userFindMany.mock.calls[0][0].select).toEqual({ id: true, usuario: true, nombre: true, apellidos: true, correo: true, teacherId: true, estado: true, permisosExtra: true, permisosDenegados: true });
    expect(JSON.stringify(m.userFindMany.mock.calls[0][0])).not.toMatch(/hash|token|credential|pin/i);
  });
});
