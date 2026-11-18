/*********************************************************************
 * Utils.gs — Utilidades generales, validación, respuestas y errores
 *********************************************************************/

/** Error pensado para el usuario: su mensaje SÍ se muestra en pantalla. Cualquier otro error se registra y se oculta. */
class ErrorApp extends Error {
  constructor(mensaje, codigo) { super(mensaje); this.name = 'ErrorApp'; this.codigo = codigo || 'VALIDACION'; }
}

function ahora_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }
function esSi_(v) { const s = String(v === null || v === undefined ? '' : v).trim().toUpperCase(); return v === true || s === 'SI' || s === 'TRUE' || s === 'SÍ'; }
function num_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isFinite(n) ? n : null;
}
function norm_(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function limpiar_(s) { return String(s === null || s === undefined ? '' : s).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim(); }
/** Google Sheets puede convertir textos de fecha en objetos Date: se devuelven siempre como texto (con hora si la tiene). */
function fechaTxt_(v) {
  if (!(v instanceof Date)) return v;
  const tz = Session.getScriptTimeZone(), conHora = Utilities.formatDate(v, tz, 'HH:mm:ss') !== '00:00:00';
  return Utilities.formatDate(v, tz, conHora ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
}
function vacio_(v) { return v === '' || v === null || v === undefined; }

/** Lanza ErrorApp si la condición no se cumple. */
function exigir_(cond, mensaje, codigo) { if (!cond) throw new ErrorApp(mensaje, codigo); }

/** Valida y normaliza un texto. opc: {req, min, max, etiqueta} */
function texto_(v, etiqueta, opc) {
  opc = opc || {};
  const s = limpiar_(v);
  if (opc.req && !s) throw new ErrorApp('Escriba ' + etiqueta + '.');
  if (s && opc.min && s.length < opc.min) throw new ErrorApp(etiqueta + ' es demasiado corto.');
  if (s.length > (opc.max || 200)) throw new ErrorApp(etiqueta + ' es demasiado largo (máximo ' + (opc.max || 200) + ' caracteres).');
  return s;
}
function correoValido_(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '')); }
function idValido_(id, prefijo) { return typeof id === 'string' && new RegExp('^' + prefijo + '-\\d{6}$').test(id); }
/** Valida que un valor pertenezca a una lista permitida. */
function enum_(v, lista, etiqueta) { exigir_(lista.indexOf(v) >= 0, etiqueta + ' no es válido.'); return v; }

/** Convierte una lista de filas-objeto en una página: búsqueda, filtros exactos, orden y paginación. */
function paginar_(items, p, camposBusqueda) {
  p = p || {};
  let lista = items;
  const q = norm_(p.q);
  if (q) lista = lista.filter(function (o) { return camposBusqueda.some(function (c) { return norm_(o[c]).indexOf(q) >= 0; }); });
  Object.keys(p.filtros || {}).forEach(function (k) {
    const v = p.filtros[k];
    if (v !== '' && v !== null && v !== undefined) lista = lista.filter(function (o) { return String(o[k]) === String(v); });
  });
  const tam = Math.min(Math.max(Number(p.tam) || 25, 1), SGA.MAX_POR_PAGINA);
  const total = lista.length, paginas = Math.max(Math.ceil(total / tam), 1);
  const pagina = Math.min(Math.max(Number(p.pagina) || 1, 1), paginas);
  return { items: lista.slice((pagina - 1) * tam, pagina * tam), total: total, pagina: pagina, paginas: paginas, tam: tam };
}

function bytesHex_(bytes) { return bytes.map(function (b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join(''); }
function sha256Hex_(txt) { return bytesHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(txt), Utilities.Charset.UTF_8)); }
function iguales_(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
