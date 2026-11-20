import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApp } from '../../lib/errors';

const m = vi.hoisted(() => ({
  teacherFindUnique: vi.fn(),
  teacherFindFirst: vi.fn(),
  teacherFindMany: vi.fn(),
  assignmentFindMany: vi.fn(),
  assignmentFindFirst: vi.fn(),
  enrollmentFindMany: vi.fn(),
  attendanceFindMany: vi.fn(),
  attendanceUpsert: vi.fn(),
  attendanceDeleteMany: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  permission: vi.fn(),
  schoolYearFindMany: vi.fn(),
  periodFindMany: vi.fn(),
}));

vi.mock('../../lib/db', () => ({
  prisma: {
    teacher: {
      findUnique: m.teacherFindUnique,
      findFirst: m.teacherFindFirst,
      findMany: m.teacherFindMany,
    },
    teachingAssignment: {
      findMany: m.assignmentFindMany,
      findFirst: m.assignmentFindFirst,
    },
    enrollment: { findMany: m.enrollmentFindMany },
    attendance: {
      findMany: m.attendanceFindMany,
      upsert: m.attendanceUpsert,
      deleteMany: m.attendanceDeleteMany,
    },
    auditLog: { create: m.auditCreate },
    schoolYear: { findMany: m.schoolYearFindMany },
    period: { findMany: m.periodFindMany },
    $transaction: m.transaction,
  },
}));

vi.mock('../crud/autorizacion', () => ({
  exigirPermiso: m.permission,
  anosAlcanzables: vi.fn(async () => ['2026-2027']),
}));

import {
  MESES_ASISTENCIA,
  guardarAsistenciaMensual,
  guardarMatrizAsistencia,
  obtenerMatrizAsistencia,
  opcionesAsistenciaDocente,
  planillaAsistenciaMensual,
  validarMes,
} from './attendance.service';
import type { Ctx } from '../auth/auth.service';

const ctxDocente = (idDocente = 'DOC-1', permisos: Record<string, boolean> = { 'asistencia.ver': true, 'asistencia.registrar': true }): Ctx => ({
  id: 'USR-1',
  usuario: 'fidel.cepeda',
  nombre: 'Fidel Cepeda',
  correo: null,
  rol: 'DOCENTE',
  idDocente: idDocente,
  permisos: Object.keys(permisos),
  set: permisos as Record<string, true>,
  debeCambiar: false,
});

const ctxAdmin = (): Ctx => ({
  id: 'USR-ADM',
  usuario: 'admin',
  nombre: 'Administrador',
  correo: null,
  rol: 'ADMINISTRADOR',
  idDocente: null,
  permisos: ['asistencia.ver', 'asistencia.registrar'],
  set: { 'asistencia.ver': true, 'asistencia.registrar': true },
  debeCambiar: false,
});

describe('Módulo de Asistencia Mensual vinculada al Maestro', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.permission.mockImplementation((user: Ctx, key: string) => {
      if (user.set[key] !== true) throw new ErrorApp('No tiene permiso.', 'PERMISO');
    });
    m.schoolYearFindMany.mockResolvedValue([{ id: '2026-2027' }]);
    m.periodFindMany.mockResolvedValue([
      { codigo: 'P1', meses: ['ago', 'sep', 'oct'] },
      { codigo: 'P2', meses: ['nov', 'dic', 'ene'] },
      { codigo: 'P3', meses: ['feb', 'mar'] },
      { codigo: 'P4', meses: ['abr', 'may', 'jun'] },
    ]);
    m.teacherFindUnique.mockResolvedValue({ id: 'DOC-1', nombreCompleto: 'Fidel Cepeda', estado: 'ACTIVO' });
    m.teacherFindMany.mockResolvedValue([{ id: 'DOC-1', nombreCompleto: 'Fidel Cepeda' }]);
    m.assignmentFindMany.mockResolvedValue([
      {
        id: 'ASG-1',
        schoolYearId: '2026-2027',
        teacherId: 'DOC-1',
        subjectId: 'SUB-ING',
        courseId: 'CUR-3',
        sectionId: 'SEC-3A',
        subject: { id: 'SUB-ING', nombre: 'Inglés', codigo: 'ING' },
        course: { id: 'CUR-3', grado: '3ro' },
        section: { id: 'SEC-3A', seccion: 'A' },
      },
    ]);
    m.assignmentFindFirst.mockResolvedValue({
      id: 'ASG-1',
      schoolYearId: '2026-2027',
      teacherId: 'DOC-1',
      subjectId: 'SUB-ING',
      courseId: 'CUR-3',
      sectionId: 'SEC-3A',
      subject: { id: 'SUB-ING', nombre: 'Inglés', codigo: 'ING' },
      course: { id: 'CUR-3', grado: '3ro', schoolYearId: '2026-2027' },
      section: { id: 'SEC-3A', courseId: 'CUR-3', seccion: 'A', course: { id: 'CUR-3', schoolYearId: '2026-2027' } },
    });
    m.enrollmentFindMany.mockResolvedValue([
      {
        id: 'ENR-1',
        studentId: 'EST-1',
        numLista: 1,
        student: { id: 'EST-1', nombreCompleto: 'Juan Pérez', matricula: 'MAT-01', estado: 'ACTIVO' },
      },
      {
        id: 'ENR-2',
        studentId: 'EST-2',
        numLista: 2,
        student: { id: 'EST-2', nombreCompleto: 'María Rodríguez', matricula: 'MAT-02', estado: 'ACTIVO' },
      },
    ]);
    m.attendanceFindMany.mockResolvedValue([
      { studentId: 'EST-1', porcentaje: 95 },
    ]);
    m.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({
      attendance: {
        upsert: m.attendanceUpsert,
        deleteMany: m.attendanceDeleteMany,
      },
      auditLog: { create: m.auditCreate },
    }));
    m.attendanceUpsert.mockResolvedValue({});
    m.attendanceDeleteMany.mockResolvedValue({});
    m.auditCreate.mockResolvedValue({});
  });

  describe('1. Regla de meses permitidos', () => {
    it('permite exactamente los meses de agosto a mayo', () => {
      const mesesEsperados = ['ago', 'sep', 'oct', 'nov', 'dic', 'ene', 'feb', 'mar', 'abr', 'may'];
      expect(MESES_ASISTENCIA.map(m => m.codigo)).toEqual(mesesEsperados);
      for (const mCode of mesesEsperados) {
        expect(validarMes(mCode)).toBe(mCode);
      }
    });

    it('rechaza estrictamente junio (jun) y meses fuera del rango', () => {
      expect(() => validarMes('jun')).toThrowError(/no se incluye junio/);
      expect(() => validarMes('jul')).toThrowError(/no se incluye junio/);
      expect(() => validarMes('xyz')).toThrowError(/no se incluye junio/);
    });
  });

  describe('2. Identificación del maestro y visibilidad de clases', () => {
    it('identifica automáticamente al maestro autenticado y muestra sus clases', async () => {
      const res = await opcionesAsistenciaDocente(ctxDocente('DOC-1'), '2026-2027');
      expect(res.maestro.nombreCompleto).toBe('Fidel Cepeda');
      expect(res.clases).toHaveLength(1);
      expect(res.clases[0].asignatura).toBe('Inglés');
      expect(res.clases[0].cursos[0].etiqueta).toBe('3ro "A"');
    });

    it('impide a un maestro ver clases de otro docente', async () => {
      await expect(
        opcionesAsistenciaDocente(ctxDocente('DOC-1'), '2026-2027', 'DOC-OTRO')
      ).rejects.toMatchObject({ codigo: 'PERMISO' });
    });

    it('permite al administrador auditar/seleccionar docentes', async () => {
      const res = await opcionesAsistenciaDocente(ctxAdmin(), '2026-2027', 'DOC-1');
      expect(res.esAdmin).toBe(true);
      expect(res.maestros).toBeDefined();
      expect(res.clases).toHaveLength(1);
    });
  });

  describe('3. Consulta de planilla de estudiantes', () => {
    it('muestra únicamente el listado de estudiantes de la sección del maestro', async () => {
      const res = await planillaAsistenciaMensual(ctxDocente('DOC-1'), {
        ano: '2026-2027',
        asignaturaId: 'SUB-ING',
        seccionId: 'SEC-3A',
        mes: 'ago',
      });

      expect(res.asignatura.nombre).toBe('Inglés');
      expect(res.seccion.etiqueta).toBe('3ro "A"');
      expect(res.mes.nombre).toBe('Agosto');
      expect(res.estudiantes).toHaveLength(2);
      expect(res.estudiantes[0].nombre).toBe('Juan Pérez');
      expect(res.estudiantes[0].porcentaje).toBe(95); // registro previo recuperado
      expect(res.estudiantes[1].nombre).toBe('María Rodríguez');
      expect(res.estudiantes[1].porcentaje).toBeNull(); // sin registrar aún
    });

    it('rechaza si la sección no corresponde a las asignaciones del maestro', async () => {
      m.assignmentFindFirst.mockResolvedValue(null);
      await expect(
        planillaAsistenciaMensual(ctxDocente('DOC-1'), {
          ano: '2026-2027',
          asignaturaId: 'SUB-ING',
          seccionId: 'SEC-OTRA',
          mes: 'ago',
        })
      ).rejects.toMatchObject({ codigo: 'PERMISO' });
    });
  });

  describe('4. Registro y guardado de asistencia', () => {
    it('guarda los porcentajes de asistencia por mes válidos y audita', async () => {
      const body = {
        ano: '2026-2027',
        asignaturaId: 'SUB-ING',
        seccionId: 'SEC-3A',
        mes: 'ago',
        registros: [
          { estudianteId: 'EST-1', porcentaje: 100 },
          { estudianteId: 'EST-2', porcentaje: 85 },
        ],
      };

      const res = await guardarAsistenciaMensual(ctxDocente('DOC-1'), body);
      expect(res.ok).toBe(true);
      expect(res.guardados).toBe(2);
      expect(m.attendanceUpsert).toHaveBeenCalledTimes(2);
      expect(m.auditCreate).toHaveBeenCalledOnce();
    });

    it('rechaza valores de porcentaje inválidos (<0 o >100 o decimales)', async () => {
      const body = {
        ano: '2026-2027',
        asignaturaId: 'SUB-ING',
        seccionId: 'SEC-3A',
        mes: 'ago',
        registros: [
          { estudianteId: 'EST-1', porcentaje: 150 },
        ],
      };

      await expect(guardarAsistenciaMensual(ctxDocente('DOC-1'), body)).rejects.toMatchObject({
        codigo: 'VALIDACION',
      });
      expect(m.attendanceUpsert).not.toHaveBeenCalled();
    });

    it('rechaza el registro si se intenta guardar en junio', async () => {
      const body = {
        ano: '2026-2027',
        asignaturaId: 'SUB-ING',
        seccionId: 'SEC-3A',
        mes: 'jun',
        registros: [
          { estudianteId: 'EST-1', porcentaje: 100 },
        ],
      };

      await expect(guardarAsistenciaMensual(ctxDocente('DOC-1'), body)).rejects.toMatchObject({
        codigo: 'VALIDACION',
      });
      expect(m.attendanceUpsert).not.toHaveBeenCalled();
    });

    describe('5. Asistencia integrada por matriz mensual y período', () => {
      it('consulta meses y períodos configurados, incluido junio en P4', async () => {
        m.attendanceFindMany.mockResolvedValue([
          { studentId: 'EST-1', mes: 'jun', porcentaje: 87 },
        ]);

        const res = await obtenerMatrizAsistencia(ctxDocente(), {
          ano: '2026-2027',
          asignaturaId: 'SUB-ING',
          seccionId: 'SEC-3A',
        });

        expect(res.meses.map(mes => mes.codigo)).toEqual([
          'ago', 'sep', 'oct', 'nov', 'dic', 'ene', 'feb', 'mar', 'abr', 'may', 'jun',
        ]);
        expect(res.periodos[3]).toEqual({ codigo: 'P4', meses: ['abr', 'may', 'jun'] });
        expect(res.estudiantes[0].meses.jun).toBe(87);
        expect(res.estudiantes[1].meses.jun).toBeNull();
      });

      it('impide consultar la matriz de una clase no asignada al docente', async () => {
        m.assignmentFindFirst.mockResolvedValue(null);

        await expect(obtenerMatrizAsistencia(ctxDocente(), {
          ano: '2026-2027',
          asignaturaId: 'SUB-ING',
          seccionId: 'SEC-OTRA',
        })).rejects.toMatchObject({ codigo: 'PERMISO' });
        expect(m.enrollmentFindMany).not.toHaveBeenCalled();
      });

      it('exige permiso de consulta para abrir la matriz', async () => {
        await expect(obtenerMatrizAsistencia(ctxDocente('DOC-1', {}), {
          ano: '2026-2027',
          asignaturaId: 'SUB-ING',
          seccionId: 'SEC-3A',
        })).rejects.toMatchObject({ codigo: 'PERMISO' });
        expect(m.assignmentFindFirst).not.toHaveBeenCalled();
      });

      it('guarda los cambios de varios meses, incluido junio, en una transacción auditada', async () => {
        const res = await guardarMatrizAsistencia(ctxDocente(), {
          ano: '2026-2027',
          asignaturaId: 'SUB-ING',
          seccionId: 'SEC-3A',
          filas: [
            { estudianteId: 'EST-1', cambios: { jun: 87, abr: 93 } },
          ],
        });

        expect(res.guardados).toBe(2);
        expect(m.attendanceUpsert).toHaveBeenCalledTimes(2);
        expect(m.attendanceUpsert).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({
            schoolYearId_sectionId_subjectId_studentId_mes: expect.objectContaining({ mes: 'jun' }),
          }),
        }));
        expect(m.auditCreate).toHaveBeenCalledOnce();
      });

      it('rechaza meses ajenos al calendario integrado y estudiantes de otra sección', async () => {
        const base = {
          ano: '2026-2027',
          asignaturaId: 'SUB-ING',
          seccionId: 'SEC-3A',
        };
        await expect(guardarMatrizAsistencia(ctxDocente(), {
          ...base,
          filas: [{ estudianteId: 'EST-1', cambios: { jul: 80 } }],
        })).rejects.toMatchObject({ codigo: 'VALIDACION' });
        await expect(guardarMatrizAsistencia(ctxDocente(), {
          ...base,
          filas: [{ estudianteId: 'EST-OTRO', cambios: { jun: 80 } }],
        })).rejects.toMatchObject({ codigo: 'CONFLICTO' });
        expect(m.attendanceUpsert).not.toHaveBeenCalled();
      });

      it('exige permiso de registro para guardar la matriz', async () => {
        await expect(guardarMatrizAsistencia(ctxDocente('DOC-1', { 'asistencia.ver': true }), {
          ano: '2026-2027',
          asignaturaId: 'SUB-ING',
          seccionId: 'SEC-3A',
          filas: [],
        })).rejects.toMatchObject({ codigo: 'PERMISO' });
        expect(m.assignmentFindFirst).not.toHaveBeenCalled();
      });
    });
  });
});
