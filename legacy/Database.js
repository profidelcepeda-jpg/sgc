/*********************************************************************
 * Database.gs — Acceso a Google Sheets como base de datos
 *  - Lecturas/escrituras POR LOTES (getValues/setValues), nunca celda por celda.
 *  - Columnas por NOMBRE de encabezado (nunca por posición fija).
 *  - Lectura selectiva por clave (hojas grandes) para no cargar toda la tabla.
 *  - IDs únicos con prefijo (EST-000001) y relaciones solo mediante ID.
 *********************************************************************/

const _mem = {};   // caché de UNA ejecución: cada hoja se lee una sola vez por llamada

function ss_() {
  try { const a = SpreadsheetApp.getActiveSpreadsheet(); if (a) return a; } catch (e) { /* aplicación web */ }
  const id = PropertiesService.getScriptProperties().getProperty('DB_ID');
  if (!id) throw new ErrorApp('El sistema no está instalado. El administrador debe ejecutar setupSystem() desde el libro.', 'INSTALACION');
  return SpreadsheetApp.openById(id);
}
function hoja_(nombre) {
  const sh = ss_().getSheetByName(nombre);
  if (!sh) throw new ErrorApp('Falta la hoja ' + nombre + '. El administrador debe ejecutar setupSystem().', 'INSTALACION');
  return sh;
}
function mapaEncabezados_(headers) { const idx = {}; headers.forEach(function (h, i) { idx[h] = i; }); return idx; }

/** Lee una hoja COMPLETA (solo para tablas pequeñas/medianas: catálogos, usuarios, etc.). */
function tabla_(nombre) {
  if (_mem[nombre]) return _mem[nombre];
  const sh = hoja_(nombre);
  const vals = sh.getDataRange().getValues();
  const headers = (vals[0] || []).map(function (h) { return String(h).trim(); });
  const t = { sh: sh, nombre: nombre, headers: headers, idx: mapaEncabezados_(headers), rows: vals.slice(1) };
  _mem[nombre] = t;
  return t;
}
function invalidar_(nombre) { delete _mem[nombre]; }
function invalidarTodo_() { Object.keys(_mem).forEach(function (k) { delete _mem[k]; }); }

/** Convierte las filas de una tabla en objetos {COLUMNA: valor, _fila: n}. Omite filas sin clave. */
function objetos_(t) {
  const out = [];
  for (let i = 0; i < t.rows.length; i++) {
    const r = t.rows[i];
    if (vacio_(r[0])) continue;
    const o = { _fila: (t.filaInicial || 2) + i };
    for (let j = 0; j < t.headers.length; j++) o[t.headers[j]] = fechaTxt_(r[j]);
    out.push(o);
  }
  return out;
}
function todos_(nombre) { return objetos_(tabla_(nombre)); }
function activos_(nombre) { return todos_(nombre).filter(function (o) { return !String(o.ESTADO || 'ACTIVO').match(/^(INACTIVO|ELIMINADO)$/i); }); }
function porId_(nombre, id, col) {
  const k = col || ESQUEMA[nombre].cols[0];
  const l = todos_(nombre).filter(function (o) { return String(o[k]) === String(id); });
  return l.length ? l[0] : null;
}

/**
 * Lectura SELECTIVA por clave: escanea solo la columna clave y lee únicamente los bloques de filas que coinciden.
 * modo 'exacto' (por defecto) o 'prefijo'. Devuelve una "tabla" con .rows y .filas (número de fila real de cada una).
 */
function leerPorClave_(nombre, colClave, valor, modo) {
  const sh = hoja_(nombre);
  const nCols = sh.getLastColumn(), last = sh.getLastRow();
  const headers = nCols ? sh.getRange(1, 1, 1, nCols).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  const idx = mapaEncabezados_(headers);
  const t = { sh: sh, nombre: nombre, headers: headers, idx: idx, rows: [], filas: [] };
  if (last < 2) return t;
  if (idx[colClave] === undefined) throw new ErrorApp('La hoja ' + nombre + ' no tiene la columna ' + colClave + '.', 'INSTALACION');
  const claves = sh.getRange(2, idx[colClave] + 1, last - 1, 1).getValues();
  const buscado = String(valor), esPrefijo = modo === 'prefijo';
  const hit = [];
  for (let i = 0; i < claves.length; i++) {
    const k = String(claves[i][0]);
    if (esPrefijo ? k.indexOf(buscado) === 0 : k === buscado) hit.push(i + 2);
  }
  let a = 0;
  while (a < hit.length) {
    let b = a;
    while (b + 1 < hit.length && hit[b + 1] === hit[b] + 1) b++;
    const bloque = sh.getRange(hit[a], 1, b - a + 1, nCols).getValues();
    for (let k = 0; k < bloque.length; k++) { t.rows.push(bloque[k]); t.filas.push(hit[a] + k); }
    a = b + 1;
  }
  return t;
}
/** Objetos de una lectura selectiva (cada objeto lleva su _fila real). */
function objetosGrupo_(t) {
  return t.rows.map(function (r, i) { const o = { _fila: t.filas[i] }; t.headers.forEach(function (h, j) { o[h] = fechaTxt_(r[j]); }); return o; });
}

/** Escribe filas modificadas agrupando filas consecutivas. mapa = {numeroFila: [valores...]} */
function escribirFilas_(t, mapa) {
  const filas = Object.keys(mapa).map(Number).sort(function (a, b) { return a - b; });
  let i = 0;
  while (i < filas.length) {
    let j = i;
    while (j + 1 < filas.length && filas[j + 1] === filas[j] + 1) j++;
    const bloque = [];
    for (let k = i; k <= j; k++) bloque.push(mapa[filas[k]]);
    t.sh.getRange(filas[i], 1, bloque.length, t.headers.length).setValues(bloque);
    i = j + 1;
  }
}
function agregarFilas_(t, filas) {
  if (!filas.length) return;
  const ultima = Math.max(t.sh.getLastRow(), 1);
  const necesarias = ultima + filas.length;
  if (necesarias > t.sh.getMaxRows()) t.sh.insertRowsAfter(t.sh.getMaxRows(), necesarias - t.sh.getMaxRows());
  t.sh.getRange(ultima + 1, 1, filas.length, t.headers.length).setValues(filas);
}
/** Construye una fila (array) desde un objeto respetando el orden real de los encabezados de la hoja. */
function filaDe_(t, obj) { return t.headers.map(function (h) { const v = obj[h]; return v === undefined || v === null ? '' : v; }); }

/** Generador de IDs: devuelve una función que entrega el siguiente ID (PREFIJO-000001). Úselo dentro de un bloqueo. */
function generadorId_(nombre) {
  const e = ESQUEMA[nombre], pref = e.prefijo, col = e.cols[0];
  const sh = hoja_(nombre), last = sh.getLastRow();
  let max = 0;
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    const re = new RegExp('^' + pref + '-(\\d+)$');
    for (let i = 0; i < ids.length; i++) { const m = re.exec(String(ids[i][0])); if (m) max = Math.max(max, Number(m[1])); }
  }
  return function () { max++; return pref + '-' + ('000000' + max).slice(-6); };
}

/** Bloqueo global para operaciones de escritura (evita que dos usuarios pisen datos). */
function conBloqueo_(fn) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) { throw new ErrorApp('El sistema está ocupado guardando otros cambios. Inténtelo de nuevo en unos segundos.', 'OCUPADO'); }
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------------- Historial (auditoría) y errores ---------------- */
let _bufferHistorial = [];
/** Acumula un registro de auditoría; se escribe en lote con vaciarHistorial_(). */
function historial_(usuario, accion, modulo, idRegistro, descripcion, antes, despues) {
  _bufferHistorial.push([ahora_(), usuario || '', accion, modulo, idRegistro || '', descripcion || '',
    antes === null || antes === undefined ? '' : antes, despues === null || despues === undefined ? '' : despues]);
}
function vaciarHistorial_() {
  if (!_bufferHistorial.length) return;
  try {
    const sh = hoja_(HOJA.HISTORIAL), n = _bufferHistorial.length, ini = Math.max(sh.getLastRow(), 1) + 1;
    if (ini + n - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), ini + n - 1 - sh.getMaxRows());
    sh.getRange(ini, 1, n, 8).setValues(_bufferHistorial);
  } catch (e) { /* la auditoría nunca debe romper la operación */ }
  _bufferHistorial = [];
}
/** Registra un error técnico y devuelve una referencia corta que se muestra al usuario. */
function registrarError_(funcion, e, usuario) {
  const ref = 'E' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  try {
    hoja_(HOJA.ERRORES).appendRow([ahora_(), usuario || '', funcion, ref, String(e && e.message || e).slice(0, 300), String(e && e.stack || '').slice(0, 800)]);
  } catch (x) { /* ignorar */ }
  return ref;
}

/* ---------------- Configuración (CONFIG) con caché ---------------- */
function convertirCfg_(k, v) {
  if (CLAVES_BOOL.indexOf(k) >= 0) return esSi_(v);
  if (CLAVES_NUM.indexOf(k) >= 0) { const n = num_(v); return n === null ? 0 : n; }
  return v === null || v === undefined ? '' : String(v);
}
function config_() {
  if (_mem.__cfg) return _mem.__cfg;
  const cache = CacheService.getScriptCache(), c = cache.get('sga_cfg');
  if (c) { _mem.__cfg = JSON.parse(c); return _mem.__cfg; }
  const cfg = {};
  CONFIG_DEFECTO.forEach(function (f) { cfg[f[0]] = convertirCfg_(f[0], f[1]); });
  tabla_(HOJA.CONFIG).rows.forEach(function (r) { const k = String(r[0]).trim(); if (k) cfg[k] = convertirCfg_(k, r[1]); });
  cache.put('sga_cfg', JSON.stringify(cfg), 300);
  _mem.__cfg = cfg;
  return cfg;
}
function limpiarCacheCfg_() { CacheService.getScriptCache().remove('sga_cfg'); delete _mem.__cfg; }
