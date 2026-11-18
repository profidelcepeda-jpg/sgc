/**
 * Política de acceso del CRUD académico.
 * Separa el permiso funcional del alcance de los registros y construye filtros
 * Prisma en servidor. Los IDs del cliente nunca conceden acceso por sí solos.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db';
import { ErrorApp } from '../../lib/errors';
import { Ctx } from '../auth/auth.service';

export type AccionCrud = 'leer' | 'crear' | 'editar' | 'estado';
export type ModuloCrud = 'cursos' | 'asignaciones' | 'tutorias' | 'periodos';

export function exigirPermiso(ctx: Ctx, permiso: string): void {
  if (!ctx || ctx.set[permiso] !== true) {
    throw new ErrorApp('No tiene permiso para realizar esta acción.', 'PERMISO');
  }
}

export function alcanceGlobal(ctx: Ctx, modulo: ModuloCrud): boolean {
  if (ctx.rol === 'ADMINISTRADOR') return true;
  if (modulo === 'cursos') return ctx.set['cursos.ver_todos'] === true ||
    ctx.set['cursos.crear'] === true || ctx.set['cursos.editar'] === true;
  if (modulo === 'asignaciones') return ctx.set['cursos.ver_todos'] === true ||
    ctx.set['asignaciones.crear'] === true || ctx.set['asignaciones.editar'] === true;
  if (modulo === 'tutorias') return ctx.set['cursos.ver_todos'] === true ||
    ctx.set['tutorias.crear'] === true || ctx.set['tutorias.editar'] === true;
  return ctx.set['cursos.ver_todos'] === true || ctx.set['periodos.administrar'] === true;
}

/** Secciones donde el docente tiene relación académica vigente en el año dado. */
export async function seccionesAlcanzables(ctx: Ctx, ano: string): Promise<string[]> {
  if (!ctx.idDocente) return [];
  const [asignaciones, tutorias] = await Promise.all([
    prisma.teachingAssignment.findMany({
      where: { schoolYearId: ano, teacherId: ctx.idDocente, estado: 'ACTIVO',
        section: { estado: 'ACTIVO', course: { schoolYearId: ano, estado: 'ACTIVO' } } },
      select: { sectionId: true },
    }),
    prisma.tutoringAssignment.findMany({
      where: { schoolYearId: ano, teacherId: ctx.idDocente, estado: 'ACTIVA',
        section: { estado: 'ACTIVO', course: { schoolYearId: ano, estado: 'ACTIVO' } } },
      select: { sectionId: true },
    }),
  ]);
  return Array.from(new Set(asignaciones.map(x => x.sectionId).concat(tutorias.map(x => x.sectionId))));
}

export async function anosAlcanzables(ctx: Ctx): Promise<string[]> {
  if (!ctx.idDocente) return [];
  const [asignaciones, tutorias] = await Promise.all([
    prisma.teachingAssignment.findMany({ where: { teacherId: ctx.idDocente, estado: 'ACTIVO',
      section: { estado: 'ACTIVO', course: { estado: 'ACTIVO' } } }, select: { schoolYearId: true } }),
    prisma.tutoringAssignment.findMany({ where: { teacherId: ctx.idDocente, estado: 'ACTIVA',
      section: { estado: 'ACTIVO', course: { estado: 'ACTIVO' } } }, select: { schoolYearId: true } }),
  ]);
  return Array.from(new Set(asignaciones.map(x => x.schoolYearId).concat(tutorias.map(x => x.schoolYearId))));
}

/** Filtro para listados: se combina con el where funcional del módulo. */
export async function filtrarAlcanceListado(
  ctx: Ctx, modulo: ModuloCrud, anoSolicitado?: string,
): Promise<Record<string, unknown>> {
  if (alcanceGlobal(ctx, modulo)) return anoSolicitado ? { schoolYearId: anoSolicitado } : {};
  if (modulo === 'cursos') {
    const ids = await seccionesAlcanzables(ctx, anoSolicitado || '');
    return { id: { in: ids }, ...(anoSolicitado ? { course: { schoolYearId: anoSolicitado } } : {}) };
  }
  if (modulo === 'asignaciones') {
    if (!ctx.idDocente) return { id: { in: [] } };
    return { teacherId: ctx.idDocente, estado: 'ACTIVO', ...(anoSolicitado ? { schoolYearId: anoSolicitado,
      section: { estado: 'ACTIVO', course: { schoolYearId: anoSolicitado, estado: 'ACTIVO' } } } : {}) };
  }
  if (modulo === 'tutorias') {
    if (!ctx.idDocente) return { id: { in: [] } };
    return { teacherId: ctx.idDocente, estado: 'ACTIVA', ...(anoSolicitado ? { schoolYearId: anoSolicitado,
      section: { estado: 'ACTIVO', course: { schoolYearId: anoSolicitado, estado: 'ACTIVO' } } } : {}) };
  }
  const anos = await anosAlcanzables(ctx);
  const visibles = anoSolicitado ? anos.filter(x => x === anoSolicitado) : anos;
  return { schoolYearId: { in: visibles } };
}

function sinAcceso_(): never {
  // No se revela si el ID existe fuera del alcance del usuario.
  throw new ErrorApp('El registro no existe o no está dentro de su alcance.', 'NO_ENCONTRADO');
}

/** Resuelve una sección por ID y valida año, estado y relación académica activa. */
export async function exigirAccesoSeccionAcademica(ctx: Ctx, ano: string, sectionId: string) {
  const section = await prisma.section.findUnique({ where: { id: sectionId }, include: { course: true } });
  if (!section || section.estado !== 'ACTIVO' || section.course.estado !== 'ACTIVO' || section.course.schoolYearId !== ano) sinAcceso_();
  if (ctx.rol === 'ADMINISTRADOR' || ctx.set['cursos.ver_todos'] === true) return section;
  if (!ctx.idDocente) sinAcceso_();
  const [assignment, tutoring] = await Promise.all([
    prisma.teachingAssignment.findFirst({ where: { schoolYearId: ano, sectionId, courseId: section.courseId,
      teacherId: ctx.idDocente, estado: 'ACTIVO', section: { estado: 'ACTIVO', course: { schoolYearId: ano, estado: 'ACTIVO' } } }, select: { id: true } }),
    prisma.tutoringAssignment.findFirst({ where: { schoolYearId: ano, sectionId, courseId: section.courseId,
      teacherId: ctx.idDocente, estado: 'ACTIVA', section: { estado: 'ACTIVO', course: { schoolYearId: ano, estado: 'ACTIVO' } } }, select: { id: true } }),
  ]);
  if (!assignment && !tutoring) sinAcceso_();
  return section;
}

/** Asignación lectiva activa: una tutoría por sí sola nunca habilita la escritura académica. */
export async function docenteAsignadoActivo(ano: string, sectionId: string, teacherId: string): Promise<boolean> {
  const assignment = await prisma.teachingAssignment.findFirst({
    where: { schoolYearId: ano, sectionId, teacherId, estado: 'ACTIVO',
      section: { estado: 'ACTIVO', course: { schoolYearId: ano, estado: 'ACTIVO' } },
      teacher: { estado: 'ACTIVO' } },
    select: { id: true },
  });
  return !!assignment;
}

/** Verifica pertenencia del recurso antes/después de mutaciones genéricas. */
export async function exigirAlcanceRegistro(
  ctx: Ctx, modulo: ModuloCrud, accion: AccionCrud,
  recurso: { ano?: string; seccion?: string; docente?: string; asignatura?: string; periodo?: string; estado?: string },
): Promise<void> {
  if (alcanceGlobal(ctx, modulo)) return;
  if (!recurso.ano) sinAcceso_();
  if (modulo === 'periodos') {
    if (accion === 'leer' && (await anosAlcanzables(ctx)).includes(recurso.ano)) return;
    sinAcceso_();
  }
  if (!recurso.seccion) sinAcceso_();
  if (modulo === 'cursos') {
    if ((await seccionesAlcanzables(ctx, recurso.ano)).includes(recurso.seccion)) return;
    sinAcceso_();
  }
  if (modulo === 'tutorias') {
    if (accion === 'leer' && ctx.idDocente && recurso.docente === ctx.idDocente && recurso.estado === 'ACTIVA') return;
    sinAcceso_();
  }
  if (modulo === 'asignaciones') {
    const propia = !!ctx.idDocente && recurso.docente === ctx.idDocente && recurso.estado === 'ACTIVO';
    if (!propia || !recurso.asignatura) sinAcceso_();
    const asignacion = await prisma.teachingAssignment.findFirst({
      where: { schoolYearId: recurso.ano, sectionId: recurso.seccion, subjectId: recurso.asignatura,
        teacherId: ctx.idDocente!, estado: 'ACTIVO',
        section: { estado: 'ACTIVO', course: { schoolYearId: recurso.ano, estado: 'ACTIVO' } },
        ...(recurso.periodo && recurso.periodo !== '*' ? { periodId: recurso.periodo,
          period: { schoolYearId: recurso.ano } } : {}) },
      select: { id: true },
    });
    if (asignacion && accion === 'leer') return;
    sinAcceso_();
  }
  sinAcceso_();
}

/** Resuelve un ID desde PostgreSQL y valida alcance; nunca toma el alcance del body. */
export async function exigirAlcancePorId(ctx: Ctx, modulo: ModuloCrud, accion: AccionCrud, id: string): Promise<void> {
  if (alcanceGlobal(ctx, modulo)) return;
  if (modulo === 'cursos') {
    const s = await prisma.section.findUnique({ where: { id }, include: { course: true } });
    if (!s) sinAcceso_();
    return exigirAlcanceRegistro(ctx, modulo, accion, { ano: s.course.schoolYearId, seccion: s.id, estado: s.estado });
  }
  if (modulo === 'asignaciones') {
    const a = await prisma.teachingAssignment.findUnique({ where: { id } });
    if (!a) sinAcceso_();
    return exigirAlcanceRegistro(ctx, modulo, accion, { ano: a.schoolYearId, seccion: a.sectionId,
      docente: a.teacherId, asignatura: a.subjectId, periodo: a.periodId || undefined, estado: a.estado });
  }
  if (modulo === 'tutorias') {
    const t = await prisma.tutoringAssignment.findFirst({ where: { id, teacherId: ctx.idDocente || '', estado: 'ACTIVA',
      section: { estado: 'ACTIVO', course: { estado: 'ACTIVO' } } }, include: { section: { include: { course: true } } } });
    if (!t) sinAcceso_();
    if (t.schoolYearId !== t.section.course.schoolYearId) sinAcceso_();
    return exigirAlcanceRegistro(ctx, modulo, accion, { ano: t.schoolYearId, seccion: t.sectionId,
      docente: t.teacherId, estado: t.estado });
  }
  const p = await prisma.period.findUnique({ where: { id } });
  if (!p) sinAcceso_();
  return exigirAlcanceRegistro(ctx, modulo, accion, { ano: p.schoolYearId, estado: p.estado });
}

export function esModuloAcademico(modulo: string): modulo is ModuloCrud {
  return ['cursos', 'asignaciones', 'tutorias', 'periodos'].includes(modulo);
}

export type FiltroPrisma = Prisma.SectionWhereInput | Prisma.TeachingAssignmentWhereInput |
  Prisma.TutoringAssignmentWhereInput | Prisma.PeriodWhereInput;
