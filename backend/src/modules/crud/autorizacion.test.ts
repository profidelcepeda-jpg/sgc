import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  teachingFindMany: vi.fn(), tutoringFindMany: vi.fn(), teachingFindFirst: vi.fn(),
  teachingFindUnique: vi.fn(), tutoringFindFirst: vi.fn(), sectionFindUnique: vi.fn(), periodFindUnique: vi.fn(),
}));
vi.mock('../../lib/db', () => ({ prisma: {
  teachingAssignment: { findMany: mocks.teachingFindMany, findFirst: mocks.teachingFindFirst, findUnique: mocks.teachingFindUnique },
  tutoringAssignment: { findMany: mocks.tutoringFindMany, findFirst: mocks.tutoringFindFirst },
  section: { findUnique: mocks.sectionFindUnique },
  period: { findUnique: mocks.periodFindUnique },
} }));

import { Ctx } from '../auth/auth.service';
import { ErrorApp } from '../../lib/errors';
import { anosAlcanzables, exigirAlcancePorId, exigirAlcanceRegistro, exigirPermiso, filtrarAlcanceListado, seccionesAlcanzables } from './autorizacion';

function ctx(overrides: Partial<Ctx> = {}): Ctx {
  return { id: 'USR-1', usuario: 'docente', nombre: 'Docente', correo: null, rol: 'DOCENTE',
    idDocente: 'DOC-1', permisos: [], set: {}, debeCambiar: false, ...overrides };
}

describe('Autorización central del CRUD', () => {
  beforeEach(() => vi.resetAllMocks());

  it('exige el permiso funcional aunque el usuario esté autenticado', () => {
    expect(() => exigirPermiso(ctx(), 'asignaciones.editar')).toThrow(ErrorApp);
    expect(() => exigirPermiso(ctx({ set: { 'asignaciones.editar': true } }), 'asignaciones.editar')).not.toThrow();
  });

  it('solo ADMINISTRADOR tiene alcance global por rol', async () => {
    const admin = ctx({ rol: 'ADMINISTRADOR' });
    expect(await filtrarAlcanceListado(admin, 'asignaciones')).toEqual({});
  });

  it('restringe asignaciones y tutorías del docente a sus relaciones activas', async () => {
    expect(await filtrarAlcanceListado(ctx(), 'asignaciones', '2026-2027')).toEqual({
      teacherId: 'DOC-1', estado: 'ACTIVO', schoolYearId: '2026-2027',
      section: { estado: 'ACTIVO', course: { schoolYearId: '2026-2027', estado: 'ACTIVO' } },
    });
    expect(await filtrarAlcanceListado(ctx(), 'tutorias')).toEqual({ teacherId: 'DOC-1', estado: 'ACTIVA' });
  });

  it('limita años y secciones a relaciones académicas activas', async () => {
    mocks.teachingFindMany.mockResolvedValue([{ schoolYearId: '2026-2027' }]);
    mocks.tutoringFindMany.mockResolvedValue([{ schoolYearId: '2025-2026' }]);
    expect(await anosAlcanzables(ctx())).toEqual(['2026-2027', '2025-2026']);
    expect(mocks.teachingFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ teacherId: 'DOC-1', estado: 'ACTIVO' }) }));

    mocks.teachingFindMany.mockResolvedValue([{ sectionId: 'SEC-1' }]);
    mocks.tutoringFindMany.mockResolvedValue([{ sectionId: 'SEC-2' }]);
    expect(await seccionesAlcanzables(ctx(), '2026-2027')).toEqual(['SEC-1', 'SEC-2']);
    expect(mocks.tutoringFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ schoolYearId: '2026-2027', estado: 'ACTIVA' }) }));
  });

  it('no permite editar por ID una asignación ajena, aunque el identificador exista', async () => {
    mocks.teachingFindFirst.mockResolvedValue(null);
    await expect(exigirAlcanceRegistro(ctx(), 'asignaciones', 'editar', {
      ano: '2026-2027', seccion: 'SEC-2', docente: 'DOC-2', asignatura: 'ASI-1', estado: 'ACTIVO',
    })).rejects.toThrow('no existe o no está dentro de su alcance');
    expect(mocks.teachingFindFirst).not.toHaveBeenCalled();
  });

  it('resuelve el recurso por ID en la BD y niega el acceso cruzado de docente', async () => {
    mocks.teachingFindUnique.mockResolvedValue({ id: 'ASG-2', schoolYearId: '2026-2027', sectionId: 'SEC-2',
      subjectId: 'ASI-1', teacherId: 'DOC-1', periodId: null, estado: 'ACTIVO' });
    mocks.teachingFindFirst.mockResolvedValue(null);
    await expect(exigirAlcancePorId(ctx(), 'asignaciones', 'editar', 'ASG-2')).rejects.toThrow(ErrorApp);
    expect(mocks.teachingFindUnique).toHaveBeenCalledWith({ where: { id: 'ASG-2' } });
    expect(mocks.teachingFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ teacherId: 'DOC-1' }) }));
  });

  it('no extiende una asignación a otro año ni período por datos del cliente', async () => {
    mocks.teachingFindFirst.mockResolvedValue(null);
    await expect(exigirAlcanceRegistro(ctx(), 'asignaciones', 'leer', {
      ano: '2025-2026', seccion: 'SEC-1', docente: 'DOC-1', asignatura: 'ASI-1', periodo: 'PER-2', estado: 'ACTIVO',
    })).rejects.toThrow(ErrorApp);
    expect(mocks.teachingFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ schoolYearId: '2025-2026', periodId: 'PER-2', teacherId: 'DOC-1' }),
    }));
  });

  it('limita períodos consultables al año respaldado por asignaciones o tutorías', async () => {
    mocks.teachingFindMany.mockResolvedValue([{ schoolYearId: '2026-2027' }]);
    mocks.tutoringFindMany.mockResolvedValue([]);
    expect(await filtrarAlcanceListado(ctx(), 'periodos', '2025-2026')).toEqual({ schoolYearId: { in: [] } });
    expect(await filtrarAlcanceListado(ctx(), 'periodos', '2026-2027')).toEqual({ schoolYearId: { in: ['2026-2027'] } });
  });

  it('rechaza el destino de una edición si cambia a una sección fuera de alcance', async () => {
    mocks.teachingFindFirst.mockResolvedValue(null);
    await expect(exigirAlcanceRegistro(ctx(), 'asignaciones', 'editar', {
      ano: '2026-2027', seccion: 'SEC-OTRA', docente: 'DOC-1', asignatura: 'ASI-1', periodo: 'PER-1', estado: 'ACTIVO',
    })).rejects.toThrow(ErrorApp);
    expect(mocks.teachingFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      schoolYearId: '2026-2027', sectionId: 'SEC-OTRA', periodId: 'PER-1', teacherId: 'DOC-1',
    }) }));
  });

  it('los permisos especiales de administración siguen siendo explícitos', () => {
    expect(() => exigirPermiso(ctx(), 'usuarios.crear')).toThrow(ErrorApp);
    expect(() => exigirPermiso(ctx(), 'periodos.administrar')).toThrow(ErrorApp);
    expect(() => exigirPermiso(ctx({ set: { 'usuarios.crear': true, 'periodos.administrar': true } }), 'usuarios.crear')).not.toThrow();
  });

  it('una tutoría activa concede lectura del curso, no escritura', async () => {
    await expect(exigirAlcanceRegistro(ctx(), 'tutorias', 'leer', {
      ano: '2026-2027', seccion: 'SEC-1', docente: 'DOC-1', estado: 'ACTIVA',
    })).resolves.toBeUndefined();
    await expect(exigirAlcanceRegistro(ctx(), 'tutorias', 'editar', {
      ano: '2026-2027', seccion: 'SEC-1', docente: 'DOC-1', estado: 'ACTIVA',
    })).rejects.toThrow(ErrorApp);
  });
});
