import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db';
import { ErrorApp } from '../../lib/errors';
import type { Ctx } from '../auth/auth.service';

export const TIPOS_OBSERVACION_BASE = [
  { codigo: 'ACADEMICA', nombre: 'Académica', activo: true },
  { codigo: 'CONDUCTA', nombre: 'Conducta', activo: true },
  { codigo: 'ASISTENCIA', nombre: 'Asistencia', activo: true },
  { codigo: 'FAMILIA', nombre: 'Familia', activo: true },
  { codigo: 'OTRA', nombre: 'Otra', activo: true },
] as const;

const CENTRO = ['CENTRO', 'CODIGO_CENTRO', 'REGIONAL', 'DISTRITO', 'DIRECCION_CENTRO', 'PROVINCIA', 'MUNICIPIO', 'TANDA', 'NIVEL', 'DIRECTOR'] as const;
const CALIFICACIONES = ['NOTA_MINIMA', 'NOTA_MAXIMA', 'NOTA_ENTERA', 'PCT_COMPLETIVA_CF', 'PCT_COMPLETIVA_CEC', 'PCT_EXTRA_CF', 'PCT_EXTRA_CE', 'DECIMALES_COMPETENCIA', 'ACTIVAR_RECUPERACION', 'ACTIVAR_COMPLETIVA', 'ACTIVAR_EXTRAORDINARIA', 'ACTIVAR_ESPECIAL'] as const;
const SEGURIDAD = ['DURACION_SESION_MIN', 'MAX_INTENTOS_LOGIN', 'MINUTOS_BLOQUEO'] as const;
const VALORES_EDITABLES: Record<string, readonly string[]> = {
  general: ['NOMBRE_SISTEMA', 'ANO_ESCOLAR', ...CENTRO],
  seguridad: SEGURIDAD,
  academica: ['GRADOS'],
  reportes: ['FILAS_POR_PAGINA', 'FORMATO_PAPEL', 'ORIENTACION_IMPRESION'],
};
const ETIQUETAS: Record<string, string> = {
  NOMBRE_SISTEMA: 'Nombre del sistema', ANO_ESCOLAR: 'Año escolar activo', CENTRO: 'Centro educativo',
  CODIGO_CENTRO: 'Código del centro', REGIONAL: 'Regional', DISTRITO: 'Distrito', DIRECCION_CENTRO: 'Dirección',
  PROVINCIA: 'Provincia', MUNICIPIO: 'Municipio', TANDA: 'Tanda', NIVEL: 'Nivel', DIRECTOR: 'Director(a)',
  DURACION_SESION_MIN: 'Duración de sesión (minutos)', MAX_INTENTOS_LOGIN: 'Intentos fallidos antes del bloqueo',
  MINUTOS_BLOQUEO: 'Duración del bloqueo (minutos)', GRADOS: 'Grados disponibles', FILAS_POR_PAGINA: 'Filas por página',
  FORMATO_PAPEL: 'Formato de papel', ORIENTACION_IMPRESION: 'Orientación de impresión',
};
const DEFECTOS: Record<string, string> = {
  ANO_ESCOLAR: '2026-2027', NOMBRE_SISTEMA: 'SGA – Sistema de Gestión Académica', NOTA_MINIMA: '70', NOTA_MAXIMA: '100',
  NOTA_ENTERA: 'SI', PCT_COMPLETIVA_CF: '50', PCT_COMPLETIVA_CEC: '50', PCT_EXTRA_CF: '30', PCT_EXTRA_CE: '70',
  DECIMALES_COMPETENCIA: '1', ACTIVAR_RECUPERACION: 'SI', ACTIVAR_COMPLETIVA: 'SI', ACTIVAR_EXTRAORDINARIA: 'SI',
  ACTIVAR_ESPECIAL: 'SI', GRADOS: '1ro,2do,3ro,4to,5to,6to', DURACION_SESION_MIN: '480', MAX_INTENTOS_LOGIN: '5',
  MINUTOS_BLOQUEO: '10', FILAS_POR_PAGINA: '20', NIVEL: 'Secundaria', FORMATO_PAPEL: 'A4', ORIENTACION_IMPRESION: 'LANDSCAPE',
};
const CENTRO_DEFAULTS: Record<string, string> = { CENTRO: '', CODIGO_CENTRO: '', REGIONAL: '', DISTRITO: '', DIRECCION_CENTRO: '', PROVINCIA: '', MUNICIPIO: '', TANDA: '', NIVEL: 'Secundaria', DIRECTOR: '' };

function exigirAdmin(ctx: Ctx) {
  if (ctx.set['configuracion.administrar'] !== true) throw new ErrorApp('No tiene permiso para administrar la configuración.', 'PERMISO');
}
function texto(v: unknown, max = 250): string {
  if (typeof v !== 'string') throw new ErrorApp('El valor de configuración debe ser texto.', 'VALIDACION');
  const r = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (r.length > max) throw new ErrorApp(`El valor no puede exceder ${max} caracteres.`, 'VALIDACION');
  return r;
}
function fecha(v: unknown, campo: string): string {
  const s = texto(v, 10);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : new Date(NaN);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s)
    throw new ErrorApp(`${campo} debe ser una fecha válida (AAAA-MM-DD).`, 'VALIDACION');
  return s;
}
function validarValor(clave: string, valor: unknown): string {
  if (clave === 'FORMATO_PAPEL' && !['A4', 'LETTER', 'LEGAL'].includes(String(valor).toUpperCase())) throw new ErrorApp('El formato de papel debe ser A4, LETTER o LEGAL.', 'VALIDACION');
  if (clave === 'ORIENTACION_IMPRESION' && !['LANDSCAPE', 'PORTRAIT'].includes(String(valor).toUpperCase())) throw new ErrorApp('La orientación debe ser LANDSCAPE o PORTRAIT.', 'VALIDACION');
  if (clave === 'FORMATO_PAPEL' || clave === 'ORIENTACION_IMPRESION') return String(valor).toUpperCase();
  if (['ANO_ESCOLAR'].includes(clave) && (typeof valor !== 'string' || !/^\d{4}-\d{4}$/.test(valor)))
    throw new ErrorApp('El año escolar debe tener el formato AAAA-AAAA.', 'VALIDACION');
  if (['DURACION_SESION_MIN', 'MAX_INTENTOS_LOGIN', 'MINUTOS_BLOQUEO', 'FILAS_POR_PAGINA'].includes(clave)) {
    const n = Number(valor);
    const limites: Record<string, [number, number]> = { DURACION_SESION_MIN: [5, 1440], MAX_INTENTOS_LOGIN: [1, 10], MINUTOS_BLOQUEO: [1, 1440], FILAS_POR_PAGINA: [10, 200] };
    const [min, max] = limites[clave];
    if (!Number.isInteger(n) || n < min || n > max) throw new ErrorApp(`${ETIQUETAS[clave]} debe estar entre ${min} y ${max}.`, 'VALIDACION');
    return String(n);
  }
  if (clave === 'GRADOS') {
    const grados = texto(valor, 250).split(',').map(x => x.trim()).filter(Boolean);
    if (!grados.length || grados.some(x => x.length > 20) || new Set(grados).size !== grados.length)
      throw new ErrorApp('Indique grados únicos separados por comas.', 'VALIDACION');
    return grados.join(',');
  }
  return texto(valor, clave === 'DIRECCION_CENTRO' ? 500 : 250);
}

/** Lectura de configuración compartida por los módulos; no incluye claves de integración ni secretos. */
export async function leerValoresConfig(claves: readonly string[]): Promise<Record<string, string>> {
  const filas = await prisma.config.findMany({ where: { clave: { in: [...claves] } }, select: { clave: true, valor: true } });
  const result: Record<string, string> = {};
  for (const k of claves) result[k] = filas.find(f => f.clave === k)?.valor ?? DEFECTOS[k] ?? '';
  return result;
}

export async function tiposObservacionConfigurados(): Promise<Array<{ codigo: string; nombre: string; activo: boolean }>> {
  const raw = await leerValoresConfig(['TIPOS_OBSERVACION']);
  if (!raw.TIPOS_OBSERVACION) return TIPOS_OBSERVACION_BASE.map(x => ({ ...x }));
  try {
    const data: unknown = JSON.parse(raw.TIPOS_OBSERVACION);
    if (!Array.isArray(data)) return TIPOS_OBSERVACION_BASE.map(x => ({ ...x }));
    const valid = data.filter((x): x is { codigo: string; nombre: string; activo: boolean } => !!x && typeof x.codigo === 'string' && typeof x.nombre === 'string' && typeof x.activo === 'boolean');
    return valid.length ? valid : TIPOS_OBSERVACION_BASE.map(x => ({ ...x }));
  } catch { return TIPOS_OBSERVACION_BASE.map(x => ({ ...x })); }
}

export async function obtenerConfiguracion(ctx: Ctx) {
  exigirAdmin(ctx);
    const claves = [...new Set([...VALORES_EDITABLES.general, ...VALORES_EDITABLES.seguridad, ...VALORES_EDITABLES.academica, ...VALORES_EDITABLES.reportes, ...CENTRO, ...CALIFICACIONES, 'VERSION'])];
  const [valores, periodos, anos, tipos] = await Promise.all([
    leerValoresConfig(claves),
    prisma.period.findMany({ include: { schoolYear: true }, orderBy: [{ schoolYearId: 'desc' }, { orden: 'asc' }] }),
    prisma.schoolYear.findMany({ select: { id: true }, orderBy: { id: 'desc' } }),
    tiposObservacionConfigurados(),
  ]);
  const metadata = (keys: readonly string[], editable: boolean) => keys.map(clave => ({ clave, nombre: ETIQUETAS[clave] || clave, valor: valores[clave] ?? '', editable }));
  const centro = Object.fromEntries(CENTRO.map(k => [k, valores[k] ?? CENTRO_DEFAULTS[k]]));
  const fechasAno = await leerValoresConfig(anos.flatMap(x => [`FECHA_INICIO_${x.id}`, `FECHA_CIERRE_${x.id}`]));
  return {
    general: metadata(VALORES_EDITABLES.general, true), seguridad: metadata(VALORES_EDITABLES.seguridad, true),
    academica: metadata(VALORES_EDITABLES.academica, true),
    calificaciones: metadata(CALIFICACIONES, false), reportes: { opciones: metadata(VALORES_EDITABLES.reportes, true), centro },
    version: valores.VERSION || '1.0.0', anos: anos.map(x => ({ id: x.id, inicio: fechasAno[`FECHA_INICIO_${x.id}`] || '', cierre: fechasAno[`FECHA_CIERRE_${x.id}`] || '' })), periodos: periodos.map(p => ({ id: p.id, ano: p.schoolYearId, codigo: p.codigo, nombre: p.nombre, tipo: p.tipo, etapa: p.etapa, orden: p.orden, meses: p.meses, estado: p.estado })),
    tiposObservacion: tipos,
  };
}

async function guardarGrupo(ctx: Ctx, grupo: keyof typeof VALORES_EDITABLES, cambios: unknown) {
  exigirAdmin(ctx);
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) throw new ErrorApp('Formato de cambios inválido.', 'VALIDACION');
  const data = cambios as Record<string, unknown>;
  const allowed = VALORES_EDITABLES[grupo];
  const keys = Object.keys(data);
  if (!keys.length || keys.some(k => !allowed.includes(k))) throw new ErrorApp('La configuración contiene claves no permitidas.', 'VALIDACION');
  const next: Record<string, string> = {};
  for (const key of keys) next[key] = validarValor(key, data[key]);
  if (next.ANO_ESCOLAR) {
    const year = await prisma.schoolYear.findUnique({ where: { id: next.ANO_ESCOLAR } });
    if (!year) throw new ErrorApp('El año escolar debe existir antes de seleccionarlo como activo.', 'VALIDACION');
    const n = await prisma.period.count({ where: { schoolYearId: next.ANO_ESCOLAR, tipo: 'REGULAR' } });
    if (n !== 4) throw new ErrorApp('El año escolar debe tener configurados sus cuatro períodos regulares.', 'VALIDACION');
  }
  if (next.GRADOS) {
    const oldRows = await prisma.course.findMany({ select: { grado: true } });
    const propuesta = next.GRADOS.split(',');
    const existentes = [...new Set(oldRows.map(x => x.grado))];
    const omitidos = existentes.filter(g => !propuesta.includes(g));
    if (omitidos.length) throw new ErrorApp(`No se pueden retirar grados que tienen cursos registrados: ${omitidos.join(', ')}.`, 'VALIDACION');
  }
  return prisma.$transaction(async tx => {
    let count = 0;
    for (const [clave, valor] of Object.entries(next)) {
      const prev = await tx.config.findUnique({ where: { clave } });
      if (prev?.valor === valor) continue;
      const now = new Date().toISOString();
      if (prev) await tx.config.update({ where: { clave }, data: { valor, fechaModificacion: now } });
      else await tx.config.create({ data: { clave, valor, descripcion: ETIQUETAS[clave] || clave, fechaModificacion: now } });
      await tx.auditLog.create({ data: { fecha: new Date(), usuario: ctx.usuario, accion: 'CONFIGURACION', modulo: 'CONFIGURACION', idRegistro: clave, descripcion: `Parámetro ${clave}`, valorAnterior: prev ? prev.valor : Prisma.JsonNull, valorNuevo: valor } });
      count++;
    }
    return { cambios: count };
  });
}

export async function actualizarConfiguracion(ctx: Ctx, grupo: string, cambios: unknown) {
  if (!Object.prototype.hasOwnProperty.call(VALORES_EDITABLES, grupo)) throw new ErrorApp('Categoría de configuración no válida.', 'VALIDACION');
  return guardarGrupo(ctx, grupo as keyof typeof VALORES_EDITABLES, cambios);
}

export async function actualizarFechasAno(ctx: Ctx, ano: unknown, input: unknown) {
  exigirAdmin(ctx);
  if (typeof ano !== 'string' || !/^\d{4}-\d{4}$/.test(ano)) throw new ErrorApp('Año escolar inválido.', 'VALIDACION');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ErrorApp('Formato de fechas inválido.', 'VALIDACION');
  const year = await prisma.schoolYear.findUnique({ where: { id: ano } });
  if (!year) throw new ErrorApp('El año escolar no existe.', 'NO_ENCONTRADO');
  const body = input as Record<string, unknown>;
  const inicio = fecha(body.inicio, 'La fecha de inicio'), cierre = fecha(body.cierre, 'La fecha de cierre');
  if (inicio >= cierre) throw new ErrorApp('La fecha de inicio debe ser anterior a la fecha de cierre.', 'VALIDACION');
  const valores = { [`FECHA_INICIO_${ano}`]: inicio, [`FECHA_CIERRE_${ano}`]: cierre };
  return prisma.$transaction(async tx => {
    let cambios = 0;
    for (const [clave, valor] of Object.entries(valores)) {
      const prev = await tx.config.findUnique({ where: { clave } });
      if (prev?.valor === valor) continue;
      const now = new Date().toISOString();
      if (prev) await tx.config.update({ where: { clave }, data: { valor, fechaModificacion: now } });
      else await tx.config.create({ data: { clave, valor, descripcion: clave.startsWith('FECHA_INICIO') ? 'Inicio del año escolar' : 'Cierre del año escolar', fechaModificacion: now } });
      await tx.auditLog.create({ data: { fecha: new Date(), usuario: ctx.usuario, accion: 'CONFIGURACION', modulo: 'CONFIGURACION', idRegistro: clave, descripcion: `Fechas del año ${ano}`, valorAnterior: prev ? prev.valor : Prisma.JsonNull, valorNuevo: valor } });
      cambios++;
    }
    return { cambios };
  });
}

export async function actualizarTiposObservacion(ctx: Ctx, input: unknown) {
  exigirAdmin(ctx);
  if (!Array.isArray(input) || !input.length) throw new ErrorApp('Debe conservar al menos un tipo de observación.', 'VALIDACION');
  const recibidos = input.map((x: unknown) => {
    if (!x || typeof x !== 'object') throw new ErrorApp('Tipo de observación inválido.', 'VALIDACION');
    const r = x as Record<string, unknown>, codigo = typeof r.codigo === 'string' ? r.codigo.trim().toUpperCase() : '';
    if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(codigo) || typeof r.activo !== 'boolean') throw new ErrorApp('Cada tipo requiere un código válido y estado activo.', 'VALIDACION');
    return { codigo, nombre: texto(r.nombre, 60), activo: r.activo };
  });
  if (recibidos.some(x => !x.nombre) || new Set(recibidos.map(x => x.codigo)).size !== recibidos.length) throw new ErrorApp('Los nombres y códigos deben ser válidos y únicos.', 'VALIDACION');
  const prev = await prisma.config.findUnique({ where: { clave: 'TIPOS_OBSERVACION' } });
  const incluidos = new Set(recibidos.map(x => x.codigo));
  const tipos = recibidos.concat((await tiposObservacionConfigurados()).filter(x => !incluidos.has(x.codigo)).map(x => ({ ...x, activo: false })));
  const valor = JSON.stringify(tipos);
  if (prev?.valor === valor) return { cambios: 0 };
  await prisma.$transaction(async tx => {
    const now = new Date().toISOString();
    if (prev) await tx.config.update({ where: { clave: 'TIPOS_OBSERVACION' }, data: { valor, fechaModificacion: now } });
    else await tx.config.create({ data: { clave: 'TIPOS_OBSERVACION', valor, descripcion: 'Tipos disponibles de observación', fechaModificacion: now } });
    await tx.auditLog.create({ data: { fecha: new Date(), usuario: ctx.usuario, accion: 'CONFIGURACION', modulo: 'CONFIGURACION', idRegistro: 'TIPOS_OBSERVACION', descripcion: 'Tipos de observación actualizados', valorAnterior: prev?.valor ?? Prisma.JsonNull, valorNuevo: tipos } });
  });
  return { cambios: 1 };
}
