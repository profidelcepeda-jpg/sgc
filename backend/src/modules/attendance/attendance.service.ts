import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db';
import { ErrorApp } from '../../lib/errors';
import { Ctx } from '../auth/auth.service';
import { anosAlcanzables, docenteAsignadoActivo, exigirAccesoSeccionAcademica, exigirPermiso, seccionesAlcanzables } from '../crud/autorizacion';

export const ESTADOS_ASISTENCIA = ['PRESENTE', 'AUSENTE', 'TARDANZA', 'EXCUSADO'] as const;
type EstadoAsistencia = typeof ESTADOS_ASISTENCIA[number];
type MarcaEntrada = { estudianteId?: unknown; estado?: unknown; observacion?: unknown };

const texto = (v: unknown) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim() : '';
const adminGlobal = (ctx: Ctx) => ctx.rol === 'ADMINISTRADOR' || ctx.set['cursos.ver_todos'] === true;
const autoridadEscrituraGlobal = (ctx: Ctx) => ctx.rol === 'ADMINISTRADOR' || ctx.set['calificaciones.administrar'] === true;
function noVisible(): never { throw new ErrorApp('El registro no existe o está fuera de su alcance.', 'NO_ENCONTRADO'); }
function anoValido(year: string) { if (!/^\d{4}-\d{4}$/.test(year)) throw new ErrorApp('Año escolar inválido.', 'VALIDACION'); }

function fechaIso(value: unknown): string {
  const s = texto(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ErrorApp('Indique una fecha válida (AAAA-MM-DD).', 'VALIDACION');
  const parsed = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== s) throw new ErrorApp('La fecha indicada no es válida.', 'VALIDACION');
  return s;
}
function dateDb(iso: string) { return new Date(`${iso}T00:00:00.000Z`); }
function validateState(value: unknown): EstadoAsistencia {
  const state = texto(value).toUpperCase();
  if (!ESTADOS_ASISTENCIA.includes(state as EstadoAsistencia)) throw new ErrorApp('Estado de asistencia no permitido.', 'VALIDACION');
  return state as EstadoAsistencia;
}
function validateObservation(value: unknown): string | null {
  const note = texto(value);
  if (note.length > 300) throw new ErrorApp('La observación no puede superar 300 caracteres.', 'VALIDACION');
  return note || null;
}
function duplicate(e: unknown) { return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'; }
function conflict(e: unknown) { return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034'; }

async function validateAcademicDate(year: string, iso: string, allowFuture: boolean) {
  anoValido(year);
  const date = dateDb(iso);
  const todayUtc = new Date().toISOString().slice(0, 10);
  if (!allowFuture && iso > todayUtc) throw new ErrorApp('No se puede pasar asistencia a una fecha futura.', 'VALIDACION');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const monthCode = months[date.getUTCMonth()];
  const periods = await prisma.period.findMany({ where: { schoolYearId: year, tipo: 'REGULAR' }, select: { meses: true } });
  if (!periods.some(p => p.meses.includes(monthCode))) throw new ErrorApp('La fecha no pertenece a un mes académico configurado para ese año.', 'VALIDACION');
  return date;
}

async function responsables(year: string, sectionId: string, courseId: string) {
  const assignments = await prisma.teachingAssignment.findMany({
    where: { schoolYearId: year, sectionId, courseId, estado: 'ACTIVO', teacher: { estado: 'ACTIVO' }, section: { estado: 'ACTIVO', course: { schoolYearId: year, estado: 'ACTIVO' } } },
    include: { teacher: true }, orderBy: { teacher: { nombreCompleto: 'asc' } },
  });
  return Array.from(new Map(assignments.map(a => [a.teacherId, { id: a.teacherId, nombre: a.teacher.nombreCompleto }])).values());
}

function resumen(marks: Array<{ estado: string }>) {
  const counts = { PRESENTE: 0, AUSENTE: 0, TARDANZA: 0, EXCUSADO: 0 };
  for (const mark of marks) if (ESTADOS_ASISTENCIA.includes(mark.estado as EstadoAsistencia)) counts[mark.estado as EstadoAsistencia]++;
  // Criterio diario: tardanza cuenta como asistencia; excusas no entran en el denominador.
  const considerados = counts.PRESENTE + counts.AUSENTE + counts.TARDANZA;
  const porcentaje = considerados ? Math.round(((counts.PRESENTE + counts.TARDANZA) / considerados) * 10000) / 100 : null;
  return { ...counts, total: marks.length, considerados, porcentaje };
}

export async function opcionesAsistencia(ctx: Ctx, yearRaw?: unknown) {
  exigirPermiso(ctx, 'asistencia.ver');
  const visibleYears = adminGlobal(ctx)
    ? (await prisma.schoolYear.findMany({ select: { id: true }, orderBy: { id: 'desc' } })).map(y => y.id)
    : await anosAlcanzables(ctx);
  const year = texto(yearRaw);
  if (year) {
    anoValido(year);
    if (!visibleYears.includes(year)) return { anos: [], secciones: [] };
  }
  const years = year ? [year] : visibleYears;
  const visibleSectionIds = adminGlobal(ctx) ? null : Array.from(new Set((await Promise.all(years.map(y => seccionesAlcanzables(ctx, y)))).flat()));
  const sections = await prisma.section.findMany({
    where: { estado: 'ACTIVO', ...(visibleSectionIds ? { id: { in: visibleSectionIds } } : {}), course: { estado: 'ACTIVO', schoolYearId: { in: years } } },
    include: { course: true, assignments: { where: { schoolYearId: { in: years }, estado: 'ACTIVO', teacher: { estado: 'ACTIVO' } }, include: { teacher: true } } },
    orderBy: [{ course: { schoolYearId: 'desc' } }, { course: { grado: 'asc' } }, { seccion: 'asc' }],
  });
  return { anos: years, secciones: sections.map(s => {
    const docs = Array.from(new Map(s.assignments.map(a => [a.teacherId, { id: a.teacherId, nombre: a.teacher.nombreCompleto }])).values());
    const tieneAsignacionPropia = !!ctx.idDocente && docs.some(d => d.id === ctx.idDocente);
    return { id: s.id, ano: s.course.schoolYearId, curso: s.courseId, grado: s.course.grado, seccion: s.seccion,
      etiqueta: `${s.course.schoolYearId} · ${s.course.grado} ${s.seccion}`, docentes: docs,
      puedeRegistrar: (autoridadEscrituraGlobal(ctx) && docs.length > 0) || tieneAsignacionPropia };
  }) };
}

async function seccionVisible(ctx: Ctx, year: string, sectionId: string) {
  return exigirAccesoSeccionAcademica(ctx, year, sectionId);
}

async function responsableEscritura(ctx: Ctx, year: string, sectionId: string, courseId: string, teacherRaw: unknown) {
  const assigned = await responsables(year, sectionId, courseId);
  if (!assigned.length) throw new ErrorApp('La sección no tiene docentes con asignación activa.', 'CONFLICTO');
  let teacherId = '';
  if (autoridadEscrituraGlobal(ctx)) {
    teacherId = texto(teacherRaw) || (ctx.idDocente && assigned.some(d => d.id === ctx.idDocente) ? ctx.idDocente : '');
    if (!teacherId) throw new ErrorApp('Seleccione el docente responsable de esta sesión.', 'VALIDACION');
  } else {
    if (!ctx.idDocente) throw new ErrorApp('No tiene una asignación docente activa para registrar asistencia.', 'PERMISO');
    if (teacherRaw && texto(teacherRaw) !== ctx.idDocente) noVisible();
    teacherId = ctx.idDocente;
  }
  if (!assigned.some(d => d.id === teacherId) || !(await docenteAsignadoActivo(year, sectionId, teacherId))) noVisible();
  return { teacherId, teacher: assigned.find(d => d.id === teacherId)!.nombre };
}

async function roster(year: string, sectionId: string, courseId: string, includeInactive = false) {
  return prisma.enrollment.findMany({
    where: { schoolYearId: year, sectionId, courseId, ...(includeInactive ? {} : { estado: 'ACTIVO', student: { estado: 'ACTIVO' } }) },
    include: { student: true }, orderBy: [{ numLista: 'asc' }, { student: { nombreCompleto: 'asc' } }],
  });
}

export async function asistenciaDiariaSeccion(ctx: Ctx, yearRaw: unknown, sectionId: string, dateRaw: unknown) {
  exigirPermiso(ctx, 'asistencia.ver');
  const year = texto(yearRaw), iso = fechaIso(dateRaw);
  if (!year) throw new ErrorApp('Seleccione el año escolar.', 'VALIDACION');
  const section = await seccionVisible(ctx, year, sectionId);
  await validateAcademicDate(year, iso, true);
  const session = await prisma.attendanceSession.findFirst({ where: { schoolYearId: year, sectionId, fecha: dateDb(iso) }, include: { teacher: true, marks: { include: { enrollment: { include: { student: true } } }, orderBy: { enrollment: { numLista: 'asc' } } } } });
  const enrollments = await roster(year, sectionId, section.courseId, !!session);
  const byEnrollment = new Map((session?.marks || []).map(m => [m.enrollmentId, m]));
  const items = enrollments.map(e => {
    const mark = byEnrollment.get(e.id);
    return { id: e.studentId, enrollmentId: e.id, numLista: e.numLista, nombre: e.student.nombreCompleto, matricula: e.student.matricula,
      estadoMatricula: e.estado, estadoEstudiante: e.student.estado, estado: mark?.estado || null, observacion: mark?.observacion || '' };
  });
  const scopeForWrite = await responsables(year, sectionId, section.courseId);
  const puedeEditar = ctx.set['asistencia.registrar'] === true && ((autoridadEscrituraGlobal(ctx) && scopeForWrite.length > 0) || (!!ctx.idDocente && scopeForWrite.some(d => d.id === ctx.idDocente)));
  return { ano: year, fecha: iso, seccion: { id: section.id, curso: section.courseId, grado: section.course.grado, seccion: section.seccion },
    sesion: session ? { id: session.id, docenteId: session.teacherId, docente: session.teacher.nombreCompleto, creado: session.creado.toISOString(), modificado: session.modificado.toISOString() } : null,
    puedeEditar, marcas: items, resumen: resumen(items.filter(x => x.estado).map(x => ({ estado: x.estado! }))) };
}

function marksInput(raw: unknown): Array<{ estudianteId: string; estado: EstadoAsistencia; observacion: string | null }> {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 500) throw new ErrorApp('La lista de asistencia debe incluir entre 1 y 500 estudiantes.', 'VALIDACION');
  const seen = new Set<string>();
  return raw.map((v: MarcaEntrada) => {
    const estudianteId = texto(v?.estudianteId);
    if (!estudianteId || seen.has(estudianteId)) throw new ErrorApp('La lista contiene un estudiante vacío o duplicado.', 'VALIDACION');
    seen.add(estudianteId);
    return { estudianteId, estado: validateState(v.estado), observacion: validateObservation(v.observacion) };
  });
}

async function revalidarEscrituraEnTx(tx: Prisma.TransactionClient, year: string, sectionId: string, courseId: string, teacherId: string) {
  const assignment = await tx.teachingAssignment.findFirst({ where: { schoolYearId: year, sectionId, courseId, teacherId, estado: 'ACTIVO', teacher: { estado: 'ACTIVO' }, section: { estado: 'ACTIVO', course: { schoolYearId: year, estado: 'ACTIVO' } } }, select: { id: true } });
  if (!assignment) noVisible();
}

export async function registrarAsistenciaGrupal(ctx: Ctx, body: { ano?: unknown; seccion?: unknown; fecha?: unknown; docenteId?: unknown; marcas?: unknown }) {
  exigirPermiso(ctx, 'asistencia.registrar');
  const year = texto(body.ano), sectionId = texto(body.seccion), iso = fechaIso(body.fecha);
  if (!year || !sectionId) throw new ErrorApp('Indique año escolar y sección.', 'VALIDACION');
  const date = await validateAcademicDate(year, iso, false);
  const section = await seccionVisible(ctx, year, sectionId);
  const teacher = await responsableEscritura(ctx, year, sectionId, section.courseId, body.docenteId);
  const incoming = marksInput(body.marcas);
  try {
    return await prisma.$transaction(async tx => {
      await revalidarEscrituraEnTx(tx, year, sectionId, section.courseId, teacher.teacherId);
      const enrollments = await tx.enrollment.findMany({ where: { schoolYearId: year, sectionId, courseId: section.courseId, estado: 'ACTIVO', student: { estado: 'ACTIVO' } }, select: { id: true, studentId: true, numLista: true } });
      const expected = new Set(enrollments.map(e => e.studentId));
      if (incoming.length !== expected.size || incoming.some(x => !expected.has(x.estudianteId))) throw new ErrorApp('La lista cambió o contiene estudiantes fuera de la matrícula activa. Recargue la sección.', 'CONFLICTO');
      const session = await tx.attendanceSession.create({ data: { schoolYearId: year, sectionId, fecha: date, teacherId: teacher.teacherId, registradoPorId: ctx.id } });
      const enrollmentByStudent = new Map(enrollments.map(e => [e.studentId, e]));
      for (const mark of incoming) {
        const enrollment = enrollmentByStudent.get(mark.estudianteId)!;
        await tx.attendanceMark.create({ data: { sessionId: session.id, enrollmentId: enrollment.id, estado: mark.estado, observacion: mark.observacion } });
      }
      const stats = resumen(incoming.map(x => ({ estado: x.estado })));
      await tx.auditLog.create({ data: { fecha: new Date(), usuario: ctx.usuario, accion: 'REGISTRO_GRUPAL', modulo: 'ASISTENCIA', idRegistro: session.id,
        descripcion: `Asistencia ${iso}; año ${year}; sección ${sectionId}; ${incoming.length} estudiantes`, valorNuevo: stats } });
      return { id: session.id, fecha: iso, guardados: incoming.length, resumen: stats };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if (duplicate(e)) throw new ErrorApp('Ya existe un registro de asistencia para esta sección y fecha. Consulte la sesión antes de editarla.', 'CONFLICTO');
    if (conflict(e)) throw new ErrorApp('La matrícula cambió durante el registro. Recargue e intente de nuevo.', 'CONFLICTO');
    throw e;
  }
}

export async function editarAsistenciaDiaria(ctx: Ctx, sessionId: string, body: { marcas?: unknown; motivo?: unknown }) {
  exigirPermiso(ctx, 'asistencia.registrar');
  const session = await prisma.attendanceSession.findUnique({ where: { id: sessionId }, include: { section: { include: { course: true } }, marks: { include: { enrollment: { include: { student: true } } } } } });
  if (!session) noVisible();
  const year = session.schoolYearId, sectionId = session.sectionId, courseId = session.section.courseId;
  await seccionVisible(ctx, year, sectionId);
  // Para perfiles administrativos, la sesión conserva a su responsable original;
  // para docentes, responsableEscritura exige que sea su propia asignación activa.
  const teacher = await responsableEscritura(ctx, year, sectionId, courseId, session.teacherId);
  const incoming = marksInput(body.marcas), current = new Map(session.marks.map(m => [m.enrollment.studentId, m]));
  if (incoming.some(x => !current.has(x.estudianteId))) throw new ErrorApp('La sesión solo permite modificar las marcas que ya contiene.', 'VALIDACION');
  const changes = incoming.filter(x => { const before = current.get(x.estudianteId)!; return before.estado !== x.estado || (before.observacion || null) !== x.observacion; });
  if (!changes.length) return { id: sessionId, modificados: 0, sinCambios: true };
  const motivo = texto(body.motivo);
  if (motivo.length < 8 || motivo.length > 300) throw new ErrorApp('Indique el motivo de la corrección (8 a 300 caracteres).', 'VALIDACION');
  await prisma.$transaction(async tx => {
    await revalidarEscrituraEnTx(tx, year, sectionId, courseId, teacher.teacherId);
    const ahora = new Date();
    for (const change of changes) {
      const before = current.get(change.estudianteId)!;
      await tx.attendanceMark.update({ where: { id: before.id }, data: { estado: change.estado, observacion: change.observacion, modificado: ahora } });
      await tx.auditLog.create({ data: { fecha: ahora, usuario: ctx.usuario, accion: 'EDITAR_ASISTENCIA', modulo: 'ASISTENCIA', idRegistro: before.id,
        descripcion: `Corrección de asistencia del estudiante ${change.estudianteId}. Observación ${before.observacion !== change.observacion ? 'actualizada' : 'sin cambio'}. Motivo: ${motivo}`,
        valorAnterior: { estado: before.estado }, valorNuevo: { estado: change.estado } } });
    }
    await tx.attendanceSession.update({ where: { id: sessionId }, data: { modificadoPorId: ctx.id, modificado: ahora } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { id: sessionId, modificados: changes.length, sinCambios: false };
}

function parseRange(fromRaw: unknown, toRaw: unknown) {
  const from = texto(fromRaw) ? fechaIso(fromRaw) : undefined, to = texto(toRaw) ? fechaIso(toRaw) : undefined;
  if (from && to && from > to) throw new ErrorApp('La fecha inicial debe ser anterior o igual a la fecha final.', 'VALIDACION');
  if (from && to && (dateDb(to).getTime() - dateDb(from).getTime()) > 366 * 86400000) throw new ErrorApp('El rango no puede superar 366 días.', 'VALIDACION');
  return { from, to };
}

export async function historialAsistenciaSeccion(ctx: Ctx, yearRaw: unknown, sectionId: string, fromRaw: unknown, toRaw: unknown, pageRaw: unknown, sizeRaw: unknown) {
  exigirPermiso(ctx, 'asistencia.ver');
  const year = texto(yearRaw); if (!year) throw new ErrorApp('Seleccione el año escolar.', 'VALIDACION'); anoValido(year);
  await seccionVisible(ctx, year, sectionId);
  const { from, to } = parseRange(fromRaw, toRaw), page = Math.max(1, Math.floor(Number(pageRaw) || 1)), size = Math.min(50, Math.max(1, Math.floor(Number(sizeRaw) || 20)));
  const where = { schoolYearId: year, sectionId, ...(from || to ? { fecha: { ...(from ? { gte: dateDb(from) } : {}), ...(to ? { lte: dateDb(to) } : {}) } } : {}) };
  const [total, sessions] = await Promise.all([
    prisma.attendanceSession.count({ where }),
    prisma.attendanceSession.findMany({ where, include: { teacher: true, marks: { include: { enrollment: { include: { student: true } } } } }, orderBy: { fecha: 'desc' }, skip: (page - 1) * size, take: size }),
  ]);
  return { items: sessions.map(s => ({ id: s.id, fecha: s.fecha.toISOString().slice(0, 10), docente: s.teacher.nombreCompleto,
    resumen: resumen(s.marks), estudiantes: s.marks.map(m => ({ id: m.enrollment.studentId, nombre: m.enrollment.student.nombreCompleto, numLista: m.enrollment.numLista, estado: m.estado, observacion: m.observacion })) })), total, pag: page, paginas: Math.ceil(total / size) };
}

export async function historialAsistenciaEstudiante(ctx: Ctx, studentId: string, yearRaw: unknown, fromRaw: unknown, toRaw: unknown) {
  exigirPermiso(ctx, 'asistencia.ver');
  const year = texto(yearRaw), { from, to } = parseRange(fromRaw, toRaw);
  if (year) anoValido(year);
  const enrollments = await prisma.enrollment.findMany({ where: { studentId, ...(year ? { schoolYearId: year } : {}) }, include: { section: { include: { course: true } } }, orderBy: { schoolYearId: 'desc' } });
  const visible = [] as typeof enrollments;
  for (const enrollment of enrollments) {
    try { await seccionVisible(ctx, enrollment.schoolYearId, enrollment.sectionId); visible.push(enrollment); }
    catch (e) { if (e instanceof ErrorApp && e.codigo === 'NO_ENCONTRADO') continue; throw e; }
  }
  if (!visible.length) noVisible();
  const enrollmentIds = visible.map(e => e.id);
  const marks = await prisma.attendanceMark.findMany({
    where: {
      enrollmentId: { in: enrollmentIds },
      ...((from || to) ? { session: { fecha: { ...(from ? { gte: dateDb(from) } : {}), ...(to ? { lte: dateDb(to) } : {}) } } } : {}),
    },
    include: { enrollment: { include: { student: true, section: { include: { course: true } } } }, session: { include: { teacher: true } } },
    orderBy: { session: { fecha: 'desc' } },
  });
  const periodoMeses = new Map<string, Map<string, string>>();
  const years = Array.from(new Set(visible.map(e => e.schoolYearId)));
  const periods = await prisma.period.findMany({ where: { schoolYearId: { in: years }, tipo: 'REGULAR' }, select: { schoolYearId: true, codigo: true, meses: true } });
  for (const period of periods) for (const month of period.meses) { const map = periodoMeses.get(period.schoolYearId) || new Map<string, string>(); map.set(month, period.codigo); periodoMeses.set(period.schoolYearId, map); }
  const items = marks.map(m => ({ id: m.id, fecha: m.session.fecha.toISOString().slice(0, 10), ano: m.enrollment.schoolYearId,
    curso: `${m.enrollment.section.course.grado} ${m.enrollment.section.seccion}`, docente: m.session.teacher.nombreCompleto, estado: m.estado, observacion: m.observacion }));
  const byPeriod = new Map<string, typeof marks>();
  for (const mark of marks) {
    const yearKey = mark.enrollment.schoolYearId, month = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][mark.session.fecha.getUTCMonth()];
    const code = periodoMeses.get(yearKey)?.get(month) || 'SIN_PERIODO', key = `${yearKey}|${code}`;
    byPeriod.set(key, [...(byPeriod.get(key) || []), mark]);
  }
  return { items, resumen: resumen(marks), porPeriodo: Array.from(byPeriod.entries()).map(([key, rows]) => { const [ano, periodo] = key.split('|'); return { ano, periodo, ...resumen(rows) }; }) };
}
