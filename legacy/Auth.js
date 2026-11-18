/*********************************************************************
 * Auth.gs — Autenticación, sesiones, roles y permisos
 *
 * FLUJO: apiLogin(usuario, clave) → valida credenciales (hash con sal, bloqueo por intentos)
 *        → crea sesión (token aleatorio; en SESIONES solo se guarda su HASH) → el navegador envía el
 *        token en cada llamada → apiEjecutar() lo valida en el SERVIDOR antes de cada operación.
 * La aplicación se publica "Ejecutar como: Yo", por eso los docentes NUNCA necesitan acceso a la hoja.
 *********************************************************************/

/* ---------------- Contraseñas ---------------- */
function nuevaSal_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }
/** "Pimienta": secreto del servidor (Propiedades del script) que se mezcla en el hash. Un PIN de 4 dígitos no se puede descifrar con solo copiar la hoja. */
function pimienta_() {
  const p = PropertiesService.getScriptProperties();
  let v = p.getProperty('PEPPER');
  if (!v) { v = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('PEPPER', v); }
  return v;
}
/** version 'v2' (con pimienta, por defecto) o 'v1' (sin pimienta: solo para contraseñas creadas con la versión anterior). */
function hashClave_(clave, sal, version) {
  version = version || 'v2';
  const salBytes = Utilities.newBlob(sal).getBytes();
  const base = version === 'v2' ? sal + ':' + pimienta_() + ':' + clave : sal + ':' + clave;
  let h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, base, Utilities.Charset.UTF_8);
  for (let i = 0; i < SGA.HASH_ITER; i++) h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h.concat(salBytes));
  return version + '$' + bytesHex_(h);
}
function verificarClave_(clave, sal, guardado) {
  const v = String(guardado).split('$')[0] === 'v1' ? 'v1' : 'v2';
  return iguales_(hashClave_(String(clave || ''), String(sal), v), String(guardado));
}
/** El acceso es un PIN de 4 dígitos. Se rechazan los PIN evidentes (0000, 1111…, 1234, 4321). */
function pinDebil_(pin) { return /^(\d)\1{3}$/.test(pin) || pin === '1234' || pin === '4321' || pin === '0123'; }
function claveTemporal_() {
  for (let intento = 0; intento < 50; intento++) {
    const hex = Utilities.getUuid().replace(/-/g, '');
    let s = '';
    for (let i = 0; i < 4; i++) s += String(parseInt(hex.substr(i * 2, 2), 16) % 10);
    if (!pinDebil_(s)) return s;
  }
  return '5827';
}
function validarPoliticaClave_(clave) {
  exigir_(typeof clave === 'string' && /^\d{4}$/.test(clave), 'El PIN debe tener exactamente 4 dígitos (solo números).');
  exigir_(!pinDebil_(clave), 'Ese PIN es demasiado fácil de adivinar (por ejemplo 1111 o 1234). Elija otro.');
}
/** Guarda (o reemplaza) la credencial de un usuario. Úselo dentro de un bloqueo. */
function guardarCredencial_(idUsuario, clave, debeCambiar) {
  const t = tabla_(HOJA.CREDENCIALES);
  const sal = nuevaSal_(), hash = hashClave_(clave, sal);
  const i = t.rows.findIndex(function (r) { return r[0] === idUsuario; });
  const fila = filaDe_(t, { ID_USUARIO: idUsuario, HASH: hash, SALT: sal, DEBE_CAMBIAR: debeCambiar ? 'SI' : 'NO', INTENTOS_FALLIDOS: 0, BLOQUEADO_HASTA: '', FECHA_CAMBIO: ahora_() });
  if (i >= 0) escribirFilas_(t, { [i + 2]: fila }); else agregarFilas_(t, [fila]);
  invalidar_(HOJA.CREDENCIALES);
}

/* ---------------- Roles y permisos ---------------- */
function permisosPorRol_() {
  if (_mem.__rp) return _mem.__rp;
  const cache = CacheService.getScriptCache(), c = cache.get('sga_rp');
  if (c) { _mem.__rp = JSON.parse(c); return _mem.__rp; }
  const m = {};
  tabla_(HOJA.ROL_PERMISOS).rows.forEach(function (r) { if (r[0]) (m[r[0]] = m[r[0]] || []).push(String(r[1])); });
  cache.put('sga_rp', JSON.stringify(m), 600);
  _mem.__rp = m;
  return m;
}
function limpiarCachePermisos_() { CacheService.getScriptCache().remove('sga_rp'); delete _mem.__rp; }
function todosLosPermisos_() { return todos_(HOJA.PERMISOS).map(function (p) { return p.ID_PERMISO; }); }

/** Permisos efectivos = permisos del rol + extras del usuario − denegados del usuario. El ADMINISTRADOR siempre tiene todos. */
function permisosEfectivos_(u) {
  if (u.ROL === 'ADMINISTRADOR') return todosLosPermisos_();
  const set = {};
  (permisosPorRol_()[u.ROL] || []).forEach(function (p) { set[p] = true; });
  String(u.PERMISOS_EXTRA || '').split(',').forEach(function (p) { p = p.trim(); if (p) set[p] = true; });
  String(u.PERMISOS_DENEGADOS || '').split(',').forEach(function (p) { p = p.trim(); if (p) delete set[p]; });
  return Object.keys(set);
}
function tiene_(ctx, permiso) { return !!ctx && ctx.set[permiso] === true; }
function exigirPermiso_(ctx, permiso) {
  if (!tiene_(ctx, permiso)) throw new ErrorApp('No tiene permiso para realizar esta acción.', 'PERMISO');
  return ctx;
}
function contextoDe_(u, debeCambiar) {
  const permisos = permisosEfectivos_(u), set = {};
  permisos.forEach(function (p) { set[p] = true; });
  return { id: u.ID_USUARIO, usuario: u.USUARIO, nombre: (u.NOMBRE + ' ' + (u.APELLIDOS || '')).trim(), correo: u.CORREO, rol: u.ROL,
    idDocente: u.ID_DOCENTE || '', permisos: permisos, set: set, debeCambiar: !!debeCambiar };
}
function perfilPublico_(ctx) { return { id: ctx.id, usuario: ctx.usuario, nombre: ctx.nombre, rol: ctx.rol, idDocente: ctx.idDocente, debeCambiar: ctx.debeCambiar }; }

/* ---------------- Inicio de sesión ---------------- */
function bloqueoCache_(usuarioTxt) { return 'fail:' + sha256Hex_(usuarioTxt).slice(0, 24); }

function login_(usuarioTxt, clave) {
  const cfg = config_();
  usuarioTxt = limpiar_(usuarioTxt).toLowerCase();
  clave = String(clave || '');
  exigir_(usuarioTxt && clave, 'Escriba su usuario y su PIN.');
  const cache = CacheService.getScriptCache(), kf = bloqueoCache_(usuarioTxt);
  const fallosCache = Number(cache.get(kf) || 0);
  const msgBloq = 'Cuenta bloqueada temporalmente por demasiados intentos. Espere ' + cfg.MINUTOS_BLOQUEO + ' minutos o pida al administrador que restablezca su acceso.';
  exigir_(fallosCache < cfg.MAX_INTENTOS_LOGIN * 2, msgBloq, 'BLOQUEO');
  const generico = new ErrorApp('Usuario o PIN incorrectos.', 'LOGIN');

  const u = todos_(HOJA.USUARIOS).filter(function (x) { return String(x.USUARIO).toLowerCase() === usuarioTxt || String(x.CORREO).toLowerCase() === usuarioTxt; })[0];
  const tc = tabla_(HOJA.CREDENCIALES);
  const ci = u ? tc.rows.findIndex(function (r) { return r[0] === u.ID_USUARIO; }) : -1;
  if (!u || ci < 0) {   // se calcula igualmente un hash para no revelar (por tiempo) si el usuario existe
    hashClave_(clave, 'sal-ficticia');
    cache.put(kf, String(fallosCache + 1), cfg.MINUTOS_BLOQUEO * 60);
    throw generico;
  }
  const cred = tc.rows[ci];
  const bloqueadoHasta = String(fechaTxt_(cred[tc.idx.BLOQUEADO_HASTA]) || '');
  if (bloqueadoHasta && bloqueadoHasta > ahora_()) {
    try { cache.put(kf, String(Math.max(fallosCache, cfg.MAX_INTENTOS_LOGIN)), Math.max(cfg.MINUTOS_BLOQUEO * 60, 60)); } catch (e) { /* ignorar */ }
    throw new ErrorApp(msgBloq, 'BLOQUEO');
  }
  const ok = verificarClave_(clave, cred[tc.idx.SALT], cred[tc.idx.HASH]);
  const activo = u.ESTADO === 'ACTIVO' && (todos_(HOJA.ROLES).filter(function (r) { return r.ID_ROL === u.ROL && r.ESTADO !== 'INACTIVO'; }).length > 0);
  if (!ok || !activo) {
    conBloqueo_(function () {
      const fila = tc.rows[ci].slice();
      const n = (Number(fila[tc.idx.INTENTOS_FALLIDOS]) || 0) + 1;
      fila[tc.idx.INTENTOS_FALLIDOS] = n;
      if (n >= cfg.MAX_INTENTOS_LOGIN) { fila[tc.idx.BLOQUEADO_HASTA] = Utilities.formatDate(new Date(Date.now() + cfg.MINUTOS_BLOQUEO * 60000), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); fila[tc.idx.INTENTOS_FALLIDOS] = 0; }
      escribirFilas_(tc, { [ci + 2]: fila });
      historial_(u.USUARIO, 'LOGIN_FALLIDO', 'AUTENTICACION', u.ID_USUARIO, ok ? 'Cuenta inactiva' : 'PIN incorrecto');
      vaciarHistorial_();
    });
    invalidar_(HOJA.CREDENCIALES);
    cache.put(kf, String(fallosCache + 1), cfg.MINUTOS_BLOQUEO * 60);
    throw generico;
  }
  const debeCambiar = esSi_(cred[tc.idx.DEBE_CAMBIAR]);
  const token = conBloqueo_(function () {
    const fila = tc.rows[ci].slice();
    fila[tc.idx.INTENTOS_FALLIDOS] = 0; fila[tc.idx.BLOQUEADO_HASTA] = '';
    escribirFilas_(tc, { [ci + 2]: fila });
    const tu = tabla_(HOJA.USUARIOS), iu = tu.rows.findIndex(function (r) { return r[0] === u.ID_USUARIO; });
    const filaU = tu.rows[iu].slice(); filaU[tu.idx.ULTIMO_ACCESO] = ahora_();
    escribirFilas_(tu, { [iu + 2]: filaU });
    invalidar_(HOJA.CREDENCIALES); invalidar_(HOJA.USUARIOS);
    const t = crearSesion_(u.ID_USUARIO);
    historial_(u.USUARIO, 'LOGIN', 'AUTENTICACION', u.ID_USUARIO, 'Inicio de sesión');
    vaciarHistorial_();
    return t;
  });
  cache.remove(kf);
  const ctx = contextoDe_(todos_(HOJA.USUARIOS).filter(function (x) { return x.ID_USUARIO === u.ID_USUARIO; })[0], debeCambiar);
  return { token: token, ctx: ctx };
}

function crearSesion_(idUsuario) {
  const cfg = config_();
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const th = sha256Hex_(token), tz = Session.getScriptTimeZone();
  const ahoraMs = Date.now(), min = Math.max(cfg.DURACION_SESION_MIN || 480, 5);
  const sh = hoja_(HOJA.SESIONES);
  limpiarSesiones_(sh);
  const nuevoId = generadorId_(HOJA.SESIONES);
  sh.appendRow([nuevoId(), idUsuario, th, Utilities.formatDate(new Date(ahoraMs), tz, 'yyyy-MM-dd HH:mm:ss'),
    Utilities.formatDate(new Date(ahoraMs + min * 60000), tz, 'yyyy-MM-dd HH:mm:ss'), ahora_(), 'ACTIVA']);
  CacheService.getScriptCache().put('ses:' + th, JSON.stringify({ u: idUsuario, c: ahoraMs, e: ahoraMs + min * 60000 }), Math.min(min * 60, 21600));
  return token;
}
/** Elimina sesiones vencidas hace más de un día cuando la hoja crece (están ordenadas por fecha de creación). */
function limpiarSesiones_(sh) {
  const last = sh.getLastRow();
  if (last < 800) return;
  const exp = sh.getRange(2, 5, last - 1, 1).getValues();
  const corte = Utilities.formatDate(new Date(Date.now() - 86400000), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  let n = 0;
  while (n < exp.length && String(fechaTxt_(exp[n][0])) < corte) n++;
  if (n > 0) sh.deleteRows(2, n);
}

/** Valida el token de sesión y devuelve el contexto del usuario (con permisos). Se ejecuta en CADA llamada. */
function sesionDe_(token) {
  const malo = new ErrorApp('Su sesión expiró. Inicie sesión de nuevo.', 'SESION');
  if (!token || !/^[a-f0-9]{64}$/.test(String(token))) throw malo;
  const th = sha256Hex_(token), cache = CacheService.getScriptCache();
  let info = cache.get('ses:' + th);
  info = info ? JSON.parse(info) : null;
  if (!info) {   // la caché pudo vencerse: se consulta la hoja SESIONES
    const f = objetosGrupo_(leerPorClave_(HOJA.SESIONES, 'TOKEN_HASH', th))[0];
    if (!f || f.ESTADO !== 'ACTIVA') throw malo;
    const tz = Session.getScriptTimeZone();
    const e = Utilities.parseDate(String(f.EXPIRA), tz, 'yyyy-MM-dd HH:mm:ss').getTime();
    if (e < Date.now()) throw malo;
    info = { u: f.ID_USUARIO, c: Utilities.parseDate(String(f.CREADA), tz, 'yyyy-MM-dd HH:mm:ss').getTime(), e: e };
    cache.put('ses:' + th, JSON.stringify(info), Math.min(Math.floor((e - Date.now()) / 1000), 21600));
  }
  if (info.e < Date.now()) throw malo;
  const rev = Number(PropertiesService.getScriptProperties().getProperty('REV_' + info.u) || 0);
  if (rev && info.c < rev) throw malo;   // acceso restablecido/desactivado después de crear esta sesión
  const u = todos_(HOJA.USUARIOS).filter(function (x) { return x.ID_USUARIO === info.u; })[0];
  if (!u || u.ESTADO !== 'ACTIVO') throw malo;
  const tc = tabla_(HOJA.CREDENCIALES), cr = tc.rows.find(function (r) { return r[0] === u.ID_USUARIO; });
  const ctx = contextoDe_(u, cr ? esSi_(cr[tc.idx.DEBE_CAMBIAR]) : false);
  ctx.token = th;
  return ctx;
}
/** Invalida todas las sesiones anteriores de un usuario (al restablecer acceso, cambiar rol o desactivar). */
function revocarSesiones_(idUsuario) { PropertiesService.getScriptProperties().setProperty('REV_' + idUsuario, String(Date.now())); }

function cerrarSesion_(ctx) {
  CacheService.getScriptCache().remove('ses:' + ctx.token);
  conBloqueo_(function () {
    const t = leerPorClave_(HOJA.SESIONES, 'TOKEN_HASH', ctx.token);
    if (t.rows.length) { const f = t.rows[0].slice(); f[t.idx.ESTADO] = 'CERRADA'; escribirFilas_(t, { [t.filas[0]]: f }); }
    historial_(ctx.usuario, 'LOGOUT', 'AUTENTICACION', ctx.id, 'Cierre de sesión'); vaciarHistorial_();
  });
  return true;
}

function cambiarClave_(ctx, actual, nueva) {
  const tc = tabla_(HOJA.CREDENCIALES), i = tc.rows.findIndex(function (r) { return r[0] === ctx.id; });
  exigir_(i >= 0, 'No se encontró su credencial.');
  exigir_(verificarClave_(actual, tc.rows[i][tc.idx.SALT], tc.rows[i][tc.idx.HASH]), 'El PIN actual no es correcto.');
  validarPoliticaClave_(nueva);
  exigir_(nueva !== actual, 'El PIN nuevo debe ser distinto del actual.');
  conBloqueo_(function () { guardarCredencial_(ctx.id, nueva, false); historial_(ctx.usuario, 'CAMBIAR_CLAVE', 'AUTENTICACION', ctx.id, 'El usuario cambió su PIN'); vaciarHistorial_(); });
  return true;
}
