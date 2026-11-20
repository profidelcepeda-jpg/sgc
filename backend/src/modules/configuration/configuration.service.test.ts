import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ configMany: vi.fn(), configFind: vi.fn(), configUpdate: vi.fn(), configCreate: vi.fn(), year: vi.fn(), periodsCount: vi.fn(), courseMany: vi.fn(), audit: vi.fn(), transaction: vi.fn(), txFind: vi.fn(), txUpdate: vi.fn(), txCreate: vi.fn(), txAudit: vi.fn() }));
vi.mock('../../lib/db', () => ({ prisma: {
  config: { findMany: m.configMany, findUnique: m.configFind, update: m.configUpdate, create: m.configCreate },
  schoolYear: { findUnique: m.year, findMany: vi.fn() }, period: { findMany: vi.fn(), count: m.periodsCount },
  course: { findMany: m.courseMany }, auditLog: { create: m.audit },
  $transaction: m.transaction,
} }));
import { actualizarConfiguracion, actualizarFechasAno, actualizarTiposObservacion, obtenerConfiguracion } from './configuration.service';
import type { Ctx } from '../auth/auth.service';
import { ErrorApp } from '../../lib/errors';

const admin: Ctx = { id: 'USR-1', usuario: 'admin', nombre: 'Administrador', correo: null, rol: 'ADMINISTRADOR', idDocente: null, permisos: ['configuracion.administrar'], set: { 'configuracion.administrar': true }, debeCambiar: false };
const sinPermiso: Ctx = { ...admin, rol: 'DOCENTE', set: {}, permisos: [] };
const tx = { config: { findUnique: m.txFind, update: m.txUpdate, create: m.txCreate }, auditLog: { create: m.txAudit } };

describe('servicio de configuración', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.configMany.mockResolvedValue([]); m.configFind.mockResolvedValue(null); m.year.mockResolvedValue({ id: '2026-2027' });
    m.periodsCount.mockResolvedValue(4); m.courseMany.mockResolvedValue([]);
    m.transaction.mockImplementation((fn: (x: typeof tx) => Promise<unknown>) => fn(tx));
    m.txFind.mockResolvedValue(null); m.txUpdate.mockResolvedValue({}); m.txCreate.mockResolvedValue({}); m.txAudit.mockResolvedValue({});
  });
  it('requiere configuracion.administrar para consultar', async () => {
    await expect(obtenerConfiguracion(sinPermiso)).rejects.toMatchObject({ codigo: 'PERMISO' });
    expect(m.configMany).not.toHaveBeenCalled();
  });
  it('rechaza parámetros de calificación como escritura no habilitada', async () => {
    await expect(actualizarConfiguracion(admin, 'calificaciones', { NOTA_MINIMA: '65' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it('valida y audita cambios de seguridad dentro de transacción', async () => {
    await expect(actualizarConfiguracion(admin, 'seguridad', { MAX_INTENTOS_LOGIN: 11 })).rejects.toMatchObject({ codigo: 'VALIDACION' });
    expect(m.transaction).not.toHaveBeenCalled();
    await actualizarConfiguracion(admin, 'seguridad', { MAX_INTENTOS_LOGIN: 4 });
    expect(m.txCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clave: 'MAX_INTENTOS_LOGIN', valor: '4' }) }));
    expect(m.txAudit).toHaveBeenCalledTimes(1);
  });
  it('guarda modalidad y referencia local de logo, y rechaza rutas externas', async () => {
    await expect(actualizarConfiguracion(admin, 'general', { LOGO_CENTRO: 'https://example.com/logo.png' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
    expect(m.transaction).not.toHaveBeenCalled();
    await actualizarConfiguracion(admin, 'general', { MODALIDAD: 'Jornada Escolar Extendida', LOGO_CENTRO: 'logo_liceo.jpg' });
    expect(m.txCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clave: 'MODALIDAD', valor: 'Jornada Escolar Extendida' }) }));
    expect(m.txCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clave: 'LOGO_CENTRO', valor: 'logo_liceo.jpg' }) }));
    expect(m.txAudit).toHaveBeenCalledTimes(2);
  });
  it('no permite activar un año inexistente o sin cuatro períodos regulares', async () => {
    m.year.mockResolvedValue(null);
    await expect(actualizarConfiguracion(admin, 'general', { ANO_ESCOLAR: '2027-2028' })).rejects.toThrow('debe existir');
    m.year.mockResolvedValue({ id: '2027-2028' }); m.periodsCount.mockResolvedValue(3);
    await expect(actualizarConfiguracion(admin, 'general', { ANO_ESCOLAR: '2027-2028' })).rejects.toThrow('cuatro períodos');
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it('valida fechas de año escolar y registra auditoría', async () => {
    await expect(actualizarFechasAno(admin, '2026-2027', { inicio: '2026-02-30', cierre: '2027-06-30' })).rejects.toThrow(ErrorApp);
    await expect(actualizarFechasAno(admin, '2026-2027', { inicio: '2027-06-30', cierre: '2026-02-01' })).rejects.toThrow('anterior');
    await actualizarFechasAno(admin, '2026-2027', { inicio: '2026-08-01', cierre: '2027-06-30' });
    expect(m.txCreate).toHaveBeenCalledTimes(2);
    expect(m.txAudit).toHaveBeenCalledTimes(2);
  });
  it('conserva y audita códigos de observación inactivos sin eliminarlos', async () => {
    const result = await actualizarTiposObservacion(admin, [{ codigo: 'OTRA', nombre: 'Otra', activo: false }]);
    expect(result.cambios).toBe(1);
    expect(m.txCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clave: 'TIPOS_OBSERVACION' }) }));
    const stored = JSON.parse(m.txCreate.mock.calls.find((call: unknown[]) => (call[0] as { data?: { clave?: string } }).data?.clave === 'TIPOS_OBSERVACION')![0].data.valor) as Array<{ codigo: string; activo: boolean }>;
    expect(stored.find(x => x.codigo === 'OTRA')?.activo).toBe(false);
    expect(stored.find(x => x.codigo === 'ACADEMICA')?.activo).toBe(false);
    expect(m.txAudit).toHaveBeenCalledTimes(1);
  });
});
