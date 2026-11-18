import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApp } from '../../lib/errors';

const m = vi.hoisted(() => ({
  periodMany: vi.fn(), assignmentMany: vi.fn(), sessionFind: vi.fn(), sessionCreate: vi.fn(),
  enrollmentMany: vi.fn(), markCreate: vi.fn(), auditCreate: vi.fn(), transaction: vi.fn(),
  access: vi.fn(), teacherActive: vi.fn(), permission: vi.fn(),
}));

vi.mock('../../lib/db', () => ({ prisma: {
  period: { findMany: m.periodMany }, teachingAssignment: { findMany: m.assignmentMany },
  attendanceSession: { findUnique: m.sessionFind }, enrollment: { findMany: m.enrollmentMany },
  $transaction: m.transaction,
} }));
vi.mock('../crud/autorizacion', () => ({
  exigirPermiso: m.permission, exigirAccesoSeccionAcademica: m.access,
  docenteAsignadoActivo: m.teacherActive,
  anosAlcanzables: vi.fn(async () => ['2026-2027']), seccionesAlcanzables: vi.fn(async () => ['SEC-1']),
}));

import { editarAsistenciaDiaria, registrarAsistenciaGrupal } from './attendance.service';
import type { Ctx } from '../auth/auth.service';

const ctx = (role = 'DOCENTE', permisos: Record<string, boolean> = { 'asistencia.registrar': true }): Ctx => ({
  id: 'USR-1', usuario: 'docente', nombre: 'Docente', correo: null, rol: role,
  idDocente: 'DOC-1', permisos: Object.keys(permisos), set: permisos as Record<string, true>, debeCambiar: false,
});
const body = { ano: '2026-2027', seccion: 'SEC-1', fecha: '2026-10-01', marcas: [{ estudianteId: 'EST-1', estado: 'PRESENTE' }] };

describe('autorización y registro de asistencia diaria', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.permission.mockImplementation((user: Ctx, key: string) => {
      if (user.set[key] !== true) throw new ErrorApp('No tiene permiso.', 'PERMISO');
    });
    m.periodMany.mockResolvedValue([{ meses: ['oct'] }]);
    m.access.mockResolvedValue({ id: 'SEC-1', courseId: 'CUR-1', course: { grado: '1' }, seccion: 'A' });
    m.assignmentMany.mockResolvedValue([{ teacherId: 'DOC-1', teacher: { nombreCompleto: 'Docente' } }]);
    m.teacherActive.mockResolvedValue(true);
    m.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({
      teachingAssignment: { findFirst: vi.fn(async () => ({ id: 'ASG-1' })) },
      enrollment: { findMany: vi.fn(async () => [{ id: 'ENR-1', studentId: 'EST-1', numLista: 1 }]) },
      attendanceSession: { create: vi.fn(async () => ({ id: 'SES-1' })) },
      attendanceMark: { create: m.markCreate }, auditLog: { create: m.auditCreate },
    }));
    m.markCreate.mockResolvedValue({}); m.auditCreate.mockResolvedValue({});
  });

  it('requiere permiso funcional antes de leer o escribir', async () => {
    await expect(registrarAsistenciaGrupal(ctx('DOCENTE', {}), body)).rejects.toMatchObject({ codigo: 'PERMISO' });
    expect(m.periodMany).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });

  it('rechaza al docente que intenta escribir en una sección fuera de su alcance', async () => {
    m.access.mockRejectedValue(new ErrorApp('Fuera de alcance.', 'NO_ENCONTRADO'));
    await expect(registrarAsistenciaGrupal(ctx(), body)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    expect(m.assignmentMany).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });

  it('rechaza al docente sin asignación activa a la sección', async () => {
    m.assignmentMany.mockResolvedValue([]);
    await expect(registrarAsistenciaGrupal(ctx(), body)).rejects.toMatchObject({ codigo: 'CONFLICTO' });
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it('guarda solo una lista que coincide con la matrícula activa del servidor', async () => {
    await expect(registrarAsistenciaGrupal(ctx(), body)).resolves.toMatchObject({ id: 'SES-1', guardados: 1 });
    expect(m.transaction).toHaveBeenCalledOnce(); expect(m.markCreate).toHaveBeenCalledOnce(); expect(m.auditCreate).toHaveBeenCalledOnce();
  });

  it('rechaza marcas omitidas o agregadas respecto de la matrícula activa', async () => {
    const request = { ...body, marcas: [...body.marcas, { estudianteId: 'EST-OTRO', estado: 'AUSENTE' }] };
    await expect(registrarAsistenciaGrupal(ctx(), request)).rejects.toMatchObject({ codigo: 'CONFLICTO' });
    expect(m.markCreate).not.toHaveBeenCalled();
  });

  it('edición por ID exige motivo y mantiene la relación de responsable', async () => {
    m.sessionFind.mockResolvedValue({
      id: 'SES-1', schoolYearId: '2026-2027', sectionId: 'SEC-1', teacherId: 'DOC-1',
      section: { courseId: 'CUR-1', course: { grado: '1' } },
      marks: [{ id: 'MAR-1', enrollment: { studentId: 'EST-1' }, estado: 'AUSENTE', observacion: null }],
    });
    await expect(editarAsistenciaDiaria(ctx(), 'SES-1', { marcas: body.marcas })).rejects.toMatchObject({ codigo: 'VALIDACION' });
    expect(m.assignmentMany).toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });
});
