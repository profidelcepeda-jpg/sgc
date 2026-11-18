/*********************************************************************
 * crud.refs.ts — opcionesRef_ de Crud.js: listas desplegables para los
 * campos tipo "ref" y para los filtros. Traducción a Prisma.
 *********************************************************************/

import { prisma } from '../../lib/db';
import { ErrorApp } from '../../lib/errors';
import { Ctx } from '../auth/auth.service';
import { alcanceGlobal, anosAlcanzables, seccionesAlcanzables } from './autorizacion';
import { leerValoresConfig } from '../configuration/configuration.service';

export interface OpcionRef { id: string; texto: string; }

/** Valores de config con valores por defecto (transcripción de config_()). */
export async function configClaves(claves: string[]): Promise<Record<string, string>> {
  const llaves = ['ANO_ESCOLAR', 'NIVEL', 'GRADOS', 'FILAS_POR_PAGINA', ...claves];
  return leerValoresConfig(Array.from(new Set(llaves)));
}

function nombreDocente_(d: { titulo: string | null; nombreCompleto: string }): string {
  return ((d.titulo ? d.titulo + ' ' : '') + d.nombreCompleto).replace(/\s+/g, ' ').trim();
}

/** opcionesRef_ de Crud.js. `ano` se usa para secciones y períodos. */
export async function opcionesRef_(ref: string, ano?: string, ctx?: Ctx): Promise<OpcionRef[]> {
  const cfg = await configClaves([]);
  const a = ano || cfg.ANO_ESCOLAR;
  if (ref === 'docentes') {
    const puedeVerDirectorio = !ctx || ctx.rol === 'ADMINISTRADOR' || ctx.set['cursos.ver_todos'] === true ||
      ctx.set['usuarios.crear'] === true || ctx.set['usuarios.editar'] === true ||
      ctx.set['docentes.crear'] === true || ctx.set['docentes.editar'] === true ||
      ctx.set['asignaciones.crear'] === true || ctx.set['asignaciones.editar'] === true ||
      ctx.set['tutorias.crear'] === true || ctx.set['tutorias.editar'] === true;
    const ds = await prisma.teacher.findMany({ where: {
      estado: { not: 'INACTIVO' },
      ...(ctx && !puedeVerDirectorio ? { id: ctx.idDocente || '__sin_docente__' } : {}),
    } });
    return ds.map(function (d) { return { id: d.id, texto: nombreDocente_(d) }; })
      .sort(function (x, y) { return x.texto.localeCompare(y.texto, 'es'); });
  }
  if (ref === 'roles') {
    const rs = await prisma.role.findMany({ where: { estado: { not: 'INACTIVO' } } });
    return rs.map(function (r) { return { id: r.id, texto: r.nombre }; });
  }
  if (ref === 'asignaturas') {
    const as = await prisma.subject.findMany({ where: { estado: { not: 'INACTIVO' } } });
    return as.sort(function (x, y) { return (x.orden || 99) - (y.orden || 99); })
      .map(function (x) { return { id: x.id, texto: x.nombre }; });
  }
  if (ref === 'asignaturas*') {
    return [{ id: '*', texto: 'Todas (general)' }].concat(await opcionesRef_('asignaturas'));
  }
  if (ref === 'secciones') {
    const ids = ctx && !alcanceGlobal(ctx, 'cursos') ? await seccionesAlcanzables(ctx, a) : null;
    const secs = await prisma.section.findMany({
      where: { estado: 'ACTIVO', ...(ids ? { id: { in: ids } } : {}), course: { schoolYearId: a, estado: 'ACTIVO' } },
      include: { course: true },
    });
    return secs.map(function (s) { return { id: s.id, texto: s.course.grado + ' ' + s.seccion + ' (' + s.course.schoolYearId + ')' }; });
  }
  if (ref === 'periodos*') {
    const anos = ctx && !alcanceGlobal(ctx, 'periodos') ? await anosAlcanzables(ctx) : null;
    const puedeVerAno = !anos || anos.includes(a);
    if (!puedeVerAno) return [];
    const per = await prisma.period.findMany({
      where: { tipo: 'REGULAR', ...(anos ? { schoolYearId: { in: anos.filter(x => x === a) } } : { schoolYearId: a }) }, orderBy: { orden: 'asc' },
    });
    return [{ id: '*', texto: 'Todo el año' }].concat(per.map(function (x) { return { id: x.id, texto: x.codigo + ' – ' + x.nombre }; }));
  }
  if (ref === 'grados') {
    return String(cfg.GRADOS).split(',').map(function (g) { return g.trim(); }).filter(Boolean)
      .map(function (g) { return { id: g, texto: g }; });
  }
  throw new ErrorApp('Lista no válida.');
}

/** etiqueta de sección del legado (etiquetaSeccion_): "grado sección (año)". */
export async function etiquetasSecciones(ano: string): Promise<Record<string, string>> {
  const secs = await prisma.section.findMany({
    where: { course: { schoolYearId: ano } }, include: { course: true },
  });
  const r: Record<string, string> = {};
  secs.forEach(function (s) { r[s.id] = s.course.grado + ' ' + s.seccion; });
  return r;
}
