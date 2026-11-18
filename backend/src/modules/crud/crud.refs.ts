/*********************************************************************
 * crud.refs.ts — opcionesRef_ de Crud.js: listas desplegables para los
 * campos tipo "ref" y para los filtros. Traducción a Prisma.
 *********************************************************************/

import { prisma } from '../../lib/db';
import { ErrorApp } from '../../lib/errors';

export interface OpcionRef { id: string; texto: string; }

/** Valores de config con valores por defecto (transcripción de config_()). */
export async function configClaves(claves: string[]): Promise<Record<string, string>> {
  const defecto: Record<string, string> = {
    ANO_ESCOLAR: '2026-2027', NIVEL: 'Secundaria',
    GRADOS: '1ro,2do,3ro,4to,5to,6to', FILAS_POR_PAGINA: '20',
  };
  const filas = await prisma.config.findMany({ where: { clave: { in: Object.keys(defecto).concat(claves) } } });
  filas.forEach(function (f) { defecto[f.clave] = f.valor; });
  return defecto;
}

function nombreDocente_(d: { titulo: string | null; nombreCompleto: string }): string {
  return ((d.titulo ? d.titulo + ' ' : '') + d.nombreCompleto).replace(/\s+/g, ' ').trim();
}

/** opcionesRef_ de Crud.js. `ano` se usa para secciones y períodos. */
export async function opcionesRef_(ref: string, ano?: string): Promise<OpcionRef[]> {
  const cfg = await configClaves([]);
  const a = ano || cfg.ANO_ESCOLAR;
  if (ref === 'docentes') {
    const ds = await prisma.teacher.findMany({ where: { estado: { not: 'INACTIVO' } } });
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
    const secs = await prisma.section.findMany({
      where: { estado: { not: 'INACTIVO' }, course: { schoolYearId: a } },
      include: { course: true },
    });
    return secs.map(function (s) { return { id: s.id, texto: s.course.grado + ' ' + s.seccion + ' (' + s.course.schoolYearId + ')' }; });
  }
  if (ref === 'periodos*') {
    const per = await prisma.period.findMany({
      where: { schoolYearId: a, tipo: 'REGULAR' }, orderBy: { orden: 'asc' },
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
