/*********************************************************************
 * crud.defs.ts — Tipos del motor CRUD y validación PURA
 * Transcripción de Crud.js: cada módulo solo DECLARA su definición
 * (campos con validación, únicos, ganchos) y el motor valida SIEMPRE
 * en el servidor. Las funciones de este archivo no tocan la BD.
 *********************************************************************/

import { ErrorApp, exigir } from '../../lib/errors';
import { correoValido_, limpiar_ } from '../auth/auth.util';

export type TipoCampo = 'texto' | 'num' | 'si_no' | 'correo' | 'enum' | 'ref' | 'patron' | 'csv';

export interface Campo {
  k: string;                       // clave del campo (clave de hoja del legado)
  et: string;                      // etiqueta para los mensajes
  tipo: TipoCampo;
  req?: boolean;
  max?: number;                    // longitud máxima (texto) o máximo (num)
  min?: number;                    // mínimo (num)
  opciones?: string[];             // enum
  ref?: string;                    // lista desplegable (opcionesRef_)
  patron?: string;                 // regex (patron)
  msg?: string;                    // mensaje propio del patron
  minusculas?: boolean;            // patron en minúsculas
  defecto?: unknown;               // valor por defecto cuando no viene
  soloCrear?: boolean;             // no se modifica después de crear
  soloLectura?: boolean;
}

/** Objeto de hoja del legado: claves tipo ANO_ESCOLAR, valores SI/NO y CSV en texto. */
export type ObjHoja = Record<string, unknown>;

/** num_ de Utils.js (para la validación pura). */
export function num_(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isFinite(n) ? n : null;
}

function vacio_(v: unknown): boolean { return v === undefined || v === null || String(v).trim() === ''; }

/**
 * crudValidar_ de Crud.js. Valida cada campo declarado según su tipo y devuelve
 * el objeto limpio {CAMPO: valor} (valores de hoja: texto, SI/NO, CSV en texto).
 * `opciones` son las listas desplegables precalculadas por el servicio
 * (nombre de ref → ids válidos).
 */
export function crudValidar_(
  campos: Campo[], entrada: ObjHoja, previo: ObjHoja | null,
  opciones: Record<string, Array<{ id: string }>>,
): ObjHoja {
  const o: ObjHoja = {};
  campos.forEach(function (c) {
    if (c.soloCrear && previo) return;
    if (c.soloLectura) return;
    let v = entrada[c.k];
    if (v === undefined) { if (previo) return; v = c.defecto !== undefined ? c.defecto : ''; }
    const et = c.et;
    if (c.tipo === 'num') {
      if (vacio_(v)) { if (c.req) throw new ErrorApp('Escriba ' + et + '.'); o[c.k] = ''; return; }
      const n = num_(v);
      exigir(n !== null && n >= (c.min !== undefined ? c.min : -1e9) && n <= (c.max !== undefined ? c.max : 1e9), et + ' no es válido.');
      o[c.k] = n; return;
    }
    if (c.tipo === 'si_no') { o[c.k] = esSi_(v) ? 'SI' : 'NO'; return; }
    if (c.tipo === 'csv') {
      const lista = String(v === undefined || v === null ? '' : v).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      if (c.req && !lista.length) throw new ErrorApp('Complete el campo: ' + et + '.');
      o[c.k] = lista.join(','); return;
    }
    v = limpiar_(v);
    if (c.req && !v) throw new ErrorApp('Complete el campo: ' + et + '.');
    const s = String(v);
    if (!s) { o[c.k] = ''; return; }
    if (c.tipo === 'correo') {
      const c2 = s.toLowerCase();
      exigir(correoValido_(c2), 'El correo electrónico no es válido.');
      o[c.k] = c2; return;
    }
    if (c.tipo === 'enum') {
      exigir((c.opciones || []).indexOf(s) >= 0, et + ' no es válido.');
    } else if (c.tipo === 'ref') {
      exigir((opciones[c.ref || ''] || []).some(function (x) { return String(x.id) === s; }), et + ' no es válido.');
    } else if (c.tipo === 'patron') {
      const p2 = c.minusculas ? s.toLowerCase() : s;
      exigir(new RegExp(c.patron || '').test(p2), c.msg || (et + ' no es válido.'));
      o[c.k] = p2; return;
    } else {
      exigir(s.length <= (c.max || 150), et + ' es demasiado largo.');
    }
    o[c.k] = s;
  });
  return o;
}

/** esSi_ de Utils.js */
export function esSi_(v: unknown): boolean {
  const s = String(v === null || v === undefined ? '' : v).trim().toUpperCase();
  return v === true || s === 'SI' || s === 'TRUE' || s === 'SÍ';
}

/** norm_ de Utils.js (para las claves de unicidad). */
export function norm_(s: unknown): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * crudUnico_ de Crud.js: evita duplicados según listas de columnas
 * (ignora el propio registro y los inactivos). `items` = filas existentes (hoja).
 */
export function crudUnico_(
  listas: string[][], o: ObjHoja, previo: ObjHoja | null, items: ObjHoja[],
  idKey: string, msgUnico?: string,
): void {
  (listas || []).forEach(function (cols) {
    const clave = function (x: ObjHoja): string { return cols.map(function (k) { return norm_(x[k]); }).join('|'); };
    const mio = clave(Object.assign({}, previo || {}, o));
    const dup = items.some(function (x) {
      return (!previo || String(x[idKey]) !== String(previo[idKey]))
        && !/^(INACTIVO|CERRADO)$/.test(String(x.ESTADO || ''))
        && clave(x) === mio;
    });
    if (dup) throw new ErrorApp(msgUnico || 'Ya existe un registro con esos mismos datos.');
  });
}

/** crudCambios_ de Crud.js: {campo: 'antes → después'} para la auditoría. */
export function crudCambios_(previo: ObjHoja | null, nuevo: ObjHoja): ObjHoja {
  const c: ObjHoja = {};
  Object.keys(nuevo).forEach(function (k) {
    if (previo && String(previo[k]) !== String(nuevo[k])) c[k] = String(previo[k]) + ' → ' + String(nuevo[k]);
  });
  return c;
}

/**
 * Combinación previo + campos validados. En el legacy se escribían SOLO las
 * columnas presentes en `o`; aquí `aPrisma` construye el registro completo, así
 * que una edición parcial debe conservar el previo o borraría los campos no
 * enviados (rolId, usaRecuperacion, notaMinima, NOMBRE_COMPLETO…).
 */
export function combinarPrevio_(previo: ObjHoja | null, validado: ObjHoja): ObjHoja {
  return Object.assign({}, previo || {}, validado);
}

/** paginar_ de Utils.js: búsqueda en `buscar`, filtros exactos, orden por campo y página. */
export interface ParamsLista {
  q?: string; filtro?: Record<string, string>; orden?: string; desc?: boolean;
  pag?: number; tam?: number;
}
export function paginar_(items: ObjHoja[], p: ParamsLista, buscar: string[]): { items: ObjHoja[]; total: number; pag: number; paginas: number } {
  let lista = items;
  const q = limpiar_(p.q || '').toLowerCase();
  if (q) {
    lista = lista.filter(function (o) {
      return buscar.some(function (k) { return String(o[k] === undefined || o[k] === null ? '' : o[k]).toLowerCase().indexOf(q) >= 0; });
    });
  }
  Object.keys(p.filtro || {}).forEach(function (k) {
    const v = String(p.filtro?.[k] || '');
    if (v) lista = lista.filter(function (o) { return String(o[k] || '') === v; });
  });
  if (p.orden) {
    const k = p.orden, desc = !!p.desc;
    lista = lista.slice().sort(function (a, b) {
      const x = String(a[k] || ''), y = String(b[k] || '');
      const r = x.localeCompare(y, 'es');
      return desc ? -r : r;
    });
  }
  const tam = Math.max(1, Math.min(200, Math.floor(p.tam || 20)));
  const total = lista.length;
  const paginas = Math.max(1, Math.ceil(total / tam));
  const pag = Math.max(1, Math.min(paginas, Math.floor(p.pag || 1)));
  return { items: lista.slice((pag - 1) * tam, pag * tam), total: total, pag: pag, paginas: paginas };
}

/** generadorId_ de Database.js sobre una lista de ids existentes: siguiente PREFIJO-000001. */
export function siguienteId_(ids: string[], prefijo: string): string {
  const re = new RegExp('^' + prefijo + '-(\\d+)$');
  let max = 0;
  ids.forEach(function (i) { const m = re.exec(String(i)); if (m) max = Math.max(max, Number(m[1])); });
  return prefijo + '-' + String(max + 1).padStart(6, '0');
}
