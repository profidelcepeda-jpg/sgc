import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db';
import { ErrorApp } from '../../lib/errors';
import { Ctx } from '../auth/auth.service';
import { anosAlcanzables, exigirPermiso } from '../crud/autorizacion';

export const MESES_ASISTENCIA = [
  { codigo: 'ago', nombre: 'Agosto' },
  { codigo: 'sep', nombre: 'Septiembre' },
  { codigo: 'oct', nombre: 'Octubre' },
  { codigo: 'nov', nombre: 'Noviembre' },
  { codigo: 'dic', nombre: 'Diciembre' },
  { codigo: 'ene', nombre: 'Enero' },
  { codigo: 'feb', nombre: 'Febrero' },
  { codigo: 'mar', nombre: 'Marzo' },
  { codigo: 'abr', nombre: 'Abril' },
  { codigo: 'may', nombre: 'Mayo' },
] as const;

export const MESES_ASISTENCIA_INTEGRADA = [
  ...MESES_ASISTENCIA,
  { codigo: 'jun', nombre: 'Junio' },
] as const;

export type CodigoMes = typeof MESES_ASISTENCIA[number]['codigo'];
export const CODIGOS_MES: readonly string[] = MESES_ASISTENCIA.map(m => m.codigo);
type CodigoMesIntegrado = typeof MESES_ASISTENCIA_INTEGRADA[number]['codigo'];

const texto = (v: unknown) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim() : '';
const esAdminGlobal = (ctx: Ctx) => ctx.rol === 'ADMINISTRADOR' || ctx.set['cursos.ver_todos'] === true;

function anoValido(year: string) {
  if (!/^\d{4}-\d{4}$/.test(year)) throw new ErrorApp('Año escolar inválido.', 'VALIDACION');
}

export function validarMes(mes: unknown): CodigoMes {
  const m = texto(mes).toLowerCase();
  if (!CODIGOS_MES.includes(m)) {
    throw new ErrorApp('Mes no permitido. La asistencia solo se registra de agosto a mayo (no se incluye junio).', 'VALIDACION');
  }
  return m as CodigoMes;
}

export async function resolverDocente(ctx: Ctx, docenteIdRaw?: unknown): Promise<{ id: string; nombreCompleto: string }> {
  if (esAdminGlobal(ctx)) {
    const dId = texto(docenteIdRaw) || ctx.idDocente;
    if (dId) {
      const doc = await prisma.teacher.findUnique({ where: { id: dId } });
      if (doc && doc.estado === 'ACTIVO') return { id: doc.id, nombreCompleto: doc.nombreCompleto };
    }
    const primerDocente = await prisma.teacher.findFirst({
      where: { estado: 'ACTIVO', assignments: { some: { estado: 'ACTIVO' } } },
      orderBy: { nombreCompleto: 'asc' },
    });
    if (primerDocente) return { id: primerDocente.id, nombreCompleto: primerDocente.nombreCompleto };
    const cualquierDoc = await prisma.teacher.findFirst({ where: { estado: 'ACTIVO' } });
    if (!cualquierDoc) throw new ErrorApp('No hay docentes registrados en el sistema.', 'CONFLICTO');
    return { id: cualquierDoc.id, nombreCompleto: cualquierDoc.nombreCompleto };
  }

  if (!ctx.idDocente) {
    throw new ErrorApp('El usuario autenticado no tiene un perfil docente asignado.', 'PERMISO');
  }
  if (docenteIdRaw && texto(docenteIdRaw) !== ctx.idDocente) {
    throw new ErrorApp('Un maestro solamente puede ver sus propias clases.', 'PERMISO');
  }
  const teacher = await prisma.teacher.findUnique({ where: { id: ctx.idDocente } });
  if (!teacher || teacher.estado !== 'ACTIVO') {
    throw new ErrorApp('El docente asignado no se encuentra activo.', 'PERMISO');
  }
  return { id: teacher.id, nombreCompleto: teacher.nombreCompleto };
}

export async function opcionesAsistenciaDocente(ctx: Ctx, anoRaw?: unknown, docenteIdRaw?: unknown) {
  exigirPermiso(ctx, 'asistencia.ver');
  const visibleYears = esAdminGlobal(ctx)
    ? (await prisma.schoolYear.findMany({ select: { id: true }, orderBy: { id: 'desc' } })).map(y => y.id)
    : await anosAlcanzables(ctx);

  const year = texto(anoRaw) || visibleYears[0] || '';
  if (year) anoValido(year);

  const maestro = await resolverDocente(ctx, docenteIdRaw);

  const todosDocentes = esAdminGlobal(ctx)
    ? (await prisma.teacher.findMany({
        where: { estado: 'ACTIVO' },
        select: { id: true, nombreCompleto: true },
        orderBy: { nombreCompleto: 'asc' },
      }))
    : [];

  const asignaciones = await prisma.teachingAssignment.findMany({
    where: {
      schoolYearId: year,
      teacherId: maestro.id,
      estado: 'ACTIVO',
      teacher: { estado: 'ACTIVO' },
      section: { estado: 'ACTIVO', course: { schoolYearId: year, estado: 'ACTIVO' } },
    },
    include: {
      subject: true,
      course: true,
      section: true,
    },
    orderBy: [
      { subject: { nombre: 'asc' } },
      { course: { grado: 'asc' } },
      { section: { seccion: 'asc' } },
    ],
  });

  const clasesMap = new Map<string, {
    asignaturaId: string;
    asignatura: string;
    codigo: string;
    cursos: Array<{
      cursoId: string;
      grado: string;
      seccionId: string;
      seccion: string;
      etiqueta: string;
    }>;
  }>();

  for (const a of asignaciones) {
    if (!clasesMap.has(a.subjectId)) {
      clasesMap.set(a.subjectId, {
        asignaturaId: a.subjectId,
        asignatura: a.subject.nombre,
        codigo: a.subject.codigo,
        cursos: [],
      });
    }
    const c = clasesMap.get(a.subjectId)!;
    if (!c.cursos.some(s => s.seccionId === a.sectionId)) {
      c.cursos.push({
        cursoId: a.courseId,
        grado: a.course.grado,
        seccionId: a.sectionId,
        seccion: a.section.seccion,
        etiqueta: `${a.course.grado} "${a.section.seccion}"`,
      });
    }
  }

  const clases = Array.from(clasesMap.values());

  return {
    anos: visibleYears,
    anoSeleccionado: year,
    esAdmin: esAdminGlobal(ctx),
    maestro,
    maestros: todosDocentes,
    clases,
    meses: MESES_ASISTENCIA,
    puedeRegistrar: ctx.set['asistencia.registrar'] === true,
  };
}

export async function planillaAsistenciaMensual(
  ctx: Ctx,
  query: { ano?: unknown; docenteId?: unknown; asignaturaId?: unknown; seccionId?: unknown; mes?: unknown },
) {
  exigirPermiso(ctx, 'asistencia.ver');
  const year = texto(query.ano);
  if (!year) throw new ErrorApp('Indique el año escolar.', 'VALIDACION');
  anoValido(year);

  const mes = validarMes(query.mes);
  const asignaturaId = texto(query.asignaturaId);
  const seccionId = texto(query.seccionId);
  if (!asignaturaId || !seccionId) {
    throw new ErrorApp('Seleccione la clase (asignatura) y el curso/sección.', 'VALIDACION');
  }

  const maestro = await resolverDocente(ctx, query.docenteId);

  const asignacion = await prisma.teachingAssignment.findFirst({
    where: {
      schoolYearId: year,
      teacherId: maestro.id,
      subjectId: asignaturaId,
      sectionId: seccionId,
      estado: 'ACTIVO',
      section: { estado: 'ACTIVO', course: { schoolYearId: year, estado: 'ACTIVO' } },
    },
    include: {
      subject: true,
      course: true,
      section: true,
    },
  });

  if (!asignacion) {
    throw new ErrorApp('La clase o curso/sección seleccionado no corresponde al maestro asignado.', 'PERMISO');
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolYearId: year,
      sectionId: seccionId,
      courseId: asignacion.courseId,
      estado: 'ACTIVO',
      student: { estado: 'ACTIVO' },
    },
    include: { student: true },
    orderBy: [
      { numLista: 'asc' },
      { student: { nombreCompleto: 'asc' } },
    ],
  });

  const studentIds = enrollments.map(e => e.studentId);
  const registrosExistentes = await prisma.attendance.findMany({
    where: {
      schoolYearId: year,
      sectionId: seccionId,
      subjectId: asignaturaId,
      mes: mes,
      studentId: { in: studentIds },
    },
  });

  const asistenciaMap = new Map<string, number>(registrosExistentes.map(r => [r.studentId, r.porcentaje]));
  const mesObj = MESES_ASISTENCIA.find(m => m.codigo === mes)!;

  return {
    ano: year,
    maestro,
    asignatura: {
      id: asignacion.subject.id,
      nombre: asignacion.subject.nombre,
      codigo: asignacion.subject.codigo,
    },
    curso: {
      id: asignacion.course.id,
      grado: asignacion.course.grado,
    },
    seccion: {
      id: asignacion.section.id,
      seccion: asignacion.section.seccion,
      etiqueta: `${asignacion.course.grado} "${asignacion.section.seccion}"`,
    },
    mes: {
      codigo: mesObj.codigo,
      nombre: mesObj.nombre,
    },
    estudiantes: enrollments.map(e => ({
      estudianteId: e.studentId,
      enrollmentId: e.id,
      numLista: e.numLista,
      nombre: e.student.nombreCompleto,
      matricula: e.student.matricula,
      porcentaje: asistenciaMap.has(e.studentId) ? asistenciaMap.get(e.studentId)! : null,
    })),
    puedeRegistrar: ctx.set['asistencia.registrar'] === true,
  };
}

export async function guardarAsistenciaMensual(
  ctx: Ctx,
  body: { ano?: unknown; docenteId?: unknown; asignaturaId?: unknown; seccionId?: unknown; mes?: unknown; registros?: unknown },
) {
  exigirPermiso(ctx, 'asistencia.registrar');
  const year = texto(body.ano);
  if (!year) throw new ErrorApp('Indique el año escolar.', 'VALIDACION');
  anoValido(year);

  const mes = validarMes(body.mes);
  const asignaturaId = texto(body.asignaturaId);
  const seccionId = texto(body.seccionId);
  if (!asignaturaId || !seccionId) {
    throw new ErrorApp('Seleccione la clase y el curso/sección.', 'VALIDACION');
  }

  const maestro = await resolverDocente(ctx, body.docenteId);

  const asignacion = await prisma.teachingAssignment.findFirst({
    where: {
      schoolYearId: year,
      teacherId: maestro.id,
      subjectId: asignaturaId,
      sectionId: seccionId,
      estado: 'ACTIVO',
    },
  });
  if (!asignacion) {
    throw new ErrorApp('La clase o sección no corresponde a las asignaciones del maestro.', 'PERMISO');
  }

  if (!Array.isArray(body.registros)) {
    throw new ErrorApp('Formato de registros de asistencia inválido.', 'VALIDACION');
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolYearId: year,
      sectionId: seccionId,
      estado: 'ACTIVO',
      student: { estado: 'ACTIVO' },
    },
    select: { studentId: true },
  });
  const estudiantesPermitidos = new Set(enrollments.map(e => e.studentId));

  const parsedRegistros: Array<{ estudianteId: string; porcentaje: number | null }> = [];
  for (const item of body.registros as Array<{ estudianteId?: unknown; porcentaje?: unknown }>) {
    const estudianteId = texto(item?.estudianteId);
    if (!estudianteId || !estudiantesPermitidos.has(estudianteId)) {
      throw new ErrorApp('Registro con estudiante inválido o no matriculado en esta sección.', 'CONFLICTO');
    }
    let pct: number | null = null;
    if (item.porcentaje !== null && item.porcentaje !== undefined && item.porcentaje !== '') {
      const n = Number(item.porcentaje);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 100) {
        throw new ErrorApp('El valor de asistencia debe ser un número entero entre 0 y 100.', 'VALIDACION');
      }
      pct = n;
    }
    parsedRegistros.push({ estudianteId, porcentaje: pct });
  }

  return await prisma.$transaction(async tx => {
    let guardados = 0;
    for (const r of parsedRegistros) {
      if (r.porcentaje === null) {
        await tx.attendance.deleteMany({
          where: {
            schoolYearId: year,
            sectionId: seccionId,
            subjectId: asignaturaId,
            studentId: r.estudianteId,
            mes: mes,
          },
        });
      } else {
        await tx.attendance.upsert({
          where: {
            schoolYearId_sectionId_subjectId_studentId_mes: {
              schoolYearId: year,
              sectionId: seccionId,
              subjectId: asignaturaId,
              studentId: r.estudianteId,
              mes: mes,
            },
          },
          update: { porcentaje: r.porcentaje },
          create: {
            schoolYearId: year,
            sectionId: seccionId,
            subjectId: asignaturaId,
            studentId: r.estudianteId,
            mes: mes,
            porcentaje: r.porcentaje,
          },
        });
        guardados++;
      }
    }

    await tx.auditLog.create({
      data: {
        fecha: new Date(),
        usuario: ctx.usuario,
        accion: 'REGISTRO_MENSUAL',
        modulo: 'ASISTENCIA',
        idRegistro: `${year}:${asignaturaId}:${seccionId}:${mes}`,
        descripcion: `Asistencia mensual ${mes} registrada por maestro ${maestro.id} (${guardados} estudiantes)`,
      },
    });

    return { ok: true, guardados };
  });
}

async function asignacionMatrizAsistencia(ctx: Ctx, year: string, subjectId: string, sectionId: string) {
  const assignment = await prisma.teachingAssignment.findFirst({
    where: {
      schoolYearId: year,
      subjectId,
      sectionId,
      estado: 'ACTIVO',
      ...(esAdminGlobal(ctx) ? {} : { teacherId: ctx.idDocente || '' }),
      teacher: { estado: 'ACTIVO' },
      section: { estado: 'ACTIVO', course: { schoolYearId: year, estado: 'ACTIVO' } },
    },
    include: { subject: true, course: true, section: { include: { course: true } } },
  });
  if (!assignment) {
    throw new ErrorApp('La clase o sección no corresponde a las asignaciones del maestro.', 'PERMISO');
  }
  if (assignment.courseId !== assignment.section.courseId || assignment.courseId !== assignment.section.course.id) {
    throw new ErrorApp('La asignación no coincide con el curso de la sección seleccionada.', 'PERMISO');
  }
  return assignment;
}

function validarMesIntegrado(mes: unknown): CodigoMesIntegrado {
  const codigo = texto(mes).toLowerCase();
  if (!MESES_ASISTENCIA_INTEGRADA.some(m => m.codigo === codigo)) {
    throw new ErrorApp('Mes no permitido para la asistencia integrada.', 'VALIDACION');
  }
  return codigo as CodigoMesIntegrado;
}

export async function obtenerMatrizAsistencia(
  ctx: Ctx,
  query: { ano?: unknown; asignaturaId?: unknown; seccionId?: unknown },
) {
  exigirPermiso(ctx, 'asistencia.ver');
  const year = texto(query.ano);
  const subjectId = texto(query.asignaturaId);
  const sectionId = texto(query.seccionId);
  if (!year) throw new ErrorApp('Indique el año escolar.', 'VALIDACION');
  anoValido(year);
  if (!subjectId || !sectionId) {
    throw new ErrorApp('Seleccione la asignatura y el curso/sección.', 'VALIDACION');
  }

  const [assignment, periodRows] = await Promise.all([
    asignacionMatrizAsistencia(ctx, year, subjectId, sectionId),
    prisma.period.findMany({
      where: { schoolYearId: year, tipo: 'REGULAR' },
      orderBy: { orden: 'asc' },
    }),
  ]);
  if (periodRows.length !== 4) {
    throw new ErrorApp('El año escolar debe tener exactamente cuatro períodos regulares.', 'VALIDACION');
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolYearId: year,
      sectionId,
      courseId: assignment.courseId,
      estado: 'ACTIVO',
      student: { estado: 'ACTIVO' },
    },
    include: { student: true },
    orderBy: [{ numLista: 'asc' }, { student: { nombreCompleto: 'asc' } }],
  });
  const studentIds = enrollments.map(e => e.studentId);
  const attendanceRows = studentIds.length
    ? await prisma.attendance.findMany({
        where: { schoolYearId: year, sectionId, subjectId, studentId: { in: studentIds } },
      })
    : [];
  const monthsByStudent = new Map<string, Partial<Record<CodigoMesIntegrado, number>>>();
  for (const row of attendanceRows) {
    const month = MESES_ASISTENCIA_INTEGRADA.find(m => m.codigo === row.mes);
    if (!month || !studentIds.includes(row.studentId)) continue;
    const values = monthsByStudent.get(row.studentId) || {};
    values[month.codigo] = row.porcentaje;
    monthsByStudent.set(row.studentId, values);
  }

  return {
    ano: year,
    asignatura: { id: assignment.subject.id, nombre: assignment.subject.nombre },
    curso: { id: assignment.course.id, grado: assignment.course.grado },
    seccion: { id: assignment.section.id, seccion: assignment.section.seccion },
    meses: MESES_ASISTENCIA_INTEGRADA,
    periodos: periodRows.map(p => ({
      codigo: p.codigo,
      meses: p.meses.filter(m => MESES_ASISTENCIA_INTEGRADA.some(permitido => permitido.codigo === m)),
    })),
    puedeRegistrar: ctx.set['asistencia.registrar'] === true,
    estudiantes: enrollments.map(e => ({
      estudianteId: e.studentId,
      numLista: e.numLista,
      nombre: e.student.nombreCompleto,
      matricula: e.student.matricula,
      meses: Object.fromEntries(
        MESES_ASISTENCIA_INTEGRADA.map(m => [m.codigo, monthsByStudent.get(e.studentId)?.[m.codigo] ?? null]),
      ),
    })),
  };
}

export async function guardarMatrizAsistencia(
  ctx: Ctx,
  body: { ano?: unknown; asignaturaId?: unknown; seccionId?: unknown; filas?: unknown },
) {
  exigirPermiso(ctx, 'asistencia.registrar');
  const year = texto(body.ano);
  const subjectId = texto(body.asignaturaId);
  const sectionId = texto(body.seccionId);
  if (!year) throw new ErrorApp('Indique el año escolar.', 'VALIDACION');
  anoValido(year);
  if (!subjectId || !sectionId) {
    throw new ErrorApp('Seleccione la asignatura y el curso/sección.', 'VALIDACION');
  }
  const assignment = await asignacionMatrizAsistencia(ctx, year, subjectId, sectionId);
  if (!Array.isArray(body.filas)) {
    throw new ErrorApp('Formato de registros de asistencia inválido.', 'VALIDACION');
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolYearId: year,
      sectionId,
      courseId: assignment.courseId,
      estado: 'ACTIVO',
      student: { estado: 'ACTIVO' },
    },
    select: { studentId: true },
  });
  const permittedStudents = new Set(enrollments.map(e => e.studentId));
  const seenStudents = new Set<string>();
  const cells: Array<{ estudianteId: string; mes: CodigoMesIntegrado; porcentaje: number | null }> = [];

  for (const raw of body.filas as Array<{ estudianteId?: unknown; cambios?: unknown }>) {
    const estudianteId = texto(raw?.estudianteId);
    if (!estudianteId || !permittedStudents.has(estudianteId)) {
      throw new ErrorApp('Registro con estudiante inválido o no matriculado en esta sección.', 'CONFLICTO');
    }
    if (seenStudents.has(estudianteId)) {
      throw new ErrorApp('La solicitud contiene estudiantes duplicados.', 'VALIDACION');
    }
    seenStudents.add(estudianteId);
    if (!raw.cambios || typeof raw.cambios !== 'object' || Array.isArray(raw.cambios)) {
      throw new ErrorApp('Formato de cambios de asistencia inválido.', 'VALIDACION');
    }
    for (const [monthRaw, value] of Object.entries(raw.cambios as Record<string, unknown>)) {
      const month = validarMesIntegrado(monthRaw);
      let percentage: number | null = null;
      if (value !== null && value !== undefined && value !== '') {
        const n = Number(value);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 100) {
          throw new ErrorApp('El valor de asistencia debe ser un número entero entre 0 y 100.', 'VALIDACION');
        }
        percentage = n;
      }
      cells.push({ estudianteId, mes: month, porcentaje: percentage });
    }
  }

  if (!cells.length) return { ok: true, guardados: 0 };

  return prisma.$transaction(async tx => {
    for (const cell of cells) {
      if (cell.porcentaje === null) {
        await tx.attendance.deleteMany({
          where: {
            schoolYearId: year,
            sectionId,
            subjectId,
            studentId: cell.estudianteId,
            mes: cell.mes,
          },
        });
      } else {
        await tx.attendance.upsert({
          where: {
            schoolYearId_sectionId_subjectId_studentId_mes: {
              schoolYearId: year,
              sectionId,
              subjectId,
              studentId: cell.estudianteId,
              mes: cell.mes,
            },
          },
          update: { porcentaje: cell.porcentaje },
          create: {
            schoolYearId: year,
            sectionId,
            subjectId,
            studentId: cell.estudianteId,
            mes: cell.mes,
            porcentaje: cell.porcentaje,
          },
        });
      }
    }
    await tx.auditLog.create({
      data: {
        fecha: new Date(),
        usuario: ctx.usuario,
        accion: 'REGISTRO_MENSUAL',
        modulo: 'ASISTENCIA',
        idRegistro: `${year}:${subjectId}:${sectionId}:MATRIZ`,
        descripcion: `Asistencia mensual actualizada por ${cells.length} celda(s) para maestro ${ctx.idDocente || ctx.usuario}`,
      },
    });
    return { ok: true, guardados: cells.length };
  });
}
