/*********************************************************************
 * Setup.gs — Instalación, mantenimiento, datos de demostración y menú
 * Estas funciones SOLO las puede ejecutar el dueño del libro desde el editor/menú
 * (exigirDueno_): aunque el navegador pudiera invocarlas, se rechazan.
 *********************************************************************/

function exigirDueno_() {
  let a = '', e = '';
  try { a = Session.getActiveUser().getEmail(); } catch (x) { /* */ }
  try { e = Session.getEffectiveUser().getEmail(); } catch (x) { /* */ }
  if (!a || !e || a.toLowerCase() !== e.toLowerCase()) throw new Error('Operación reservada al propietario del libro.');
}
function aviso_(txt) { Logger.log(txt); try { SpreadsheetApp.getUi().alert(txt); } catch (e) { /* sin interfaz */ } }

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('SGA')
      .addItem('Instalar / reparar sistema (setupSystem)', 'menuInstalar')
      .addItem('Ver dirección de la aplicación web', 'menuUrl')
      .addSeparator()
      .addItem('Recalcular todos los resultados', 'menuRecalcular')
      .addItem('Corregir orden de competencias (CC-CRP-CEC-CT)', 'menuCorregirOrdenCompetencias')
      .addItem('Crear respaldo (copia en Drive)', 'crearRespaldo')
      .addItem('Ejecutar pruebas', 'ejecutarPruebas')
      .addSeparator()
      .addItem('Restablecer PIN del administrador', 'restablecerClaveAdmin')
      .addToUi();
  } catch (e) { /* ejecución sin interfaz */ }
}
function menuInstalar() { setupSystem(); }
function menuUrl() { exigirDueno_(); let u = ''; try { u = ScriptApp.getService().getUrl(); } catch (e) { /* */ } aviso_(u ? 'Dirección de la aplicación:\n' + u : 'Aún no la ha publicado: Implementar > Nueva implementación > Aplicación web.'); }
/** Corrección única del orden de competencias: de CC–CRP–CT–CEC a CC–CRP–CEC–CT.
 *  Solo intercambia código y orden de CT y CEC en la hoja COMPETENCIAS. Las notas guardadas NO se mueven: la 3.ª columna de notas
 *  pasa a llamarse CEC y la 4.ª CT (igual que en las tarjetas "Entrega" del registro en Excel). Si ya está corregido, no hace nada. */
function menuCorregirOrdenCompetencias() {
  exigirDueno_();
  const t = tabla_(HOJA.COMPETENCIAS), mapa = {};
  t.rows.forEach(function (r, i) {
    const cod = String(r[t.idx.CODIGO]).trim(), ab = String(r[t.idx.ABREV]).trim().toUpperCase();
    let nuevo = null;
    if (cod === 'C3' && ab === 'CT') nuevo = { c: 'C4', o: 4 };
    else if (cod === 'C4' && ab === 'CEC') nuevo = { c: 'C3', o: 3 };
    if (!nuevo) return;
    const f = r.slice(); f[t.idx.CODIGO] = nuevo.c; f[t.idx.ORDEN] = nuevo.o; mapa[i + 2] = f;
  });
  const n = Object.keys(mapa).length;
  if (!n) { aviso_('El orden de competencias ya es CC – CRP – CEC – CT. No se hizo ningún cambio.'); return; }
  conBloqueo_(function () { escribirFilas_(t, mapa); invalidar_(HOJA.COMPETENCIAS); historial_('setup', 'CORREGIR_ORDEN_COMPETENCIAS', 'COMPETENCIAS', '', 'Orden CC-CRP-CEC-CT (' + n + ' filas)'); vaciarHistorial_(); });
  aviso_('Listo: ' + n + ' filas de COMPETENCIAS actualizadas. Nuevo orden: CC – CRP – CEC – CT.');
}
function menuRecalcular() { exigirDueno_(); aviso_('Resultados recalculados: ' + reconstruirResultados_() + ' registros.'); }

/** Crea las hojas que falten, completa encabezados y siembra configuración, roles, permisos, períodos y administrador. NO sobrescribe datos. */
function setupSystem() {
  exigirDueno_();
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  let mensaje;
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    PropertiesService.getScriptProperties().setProperty('DB_ID', ss.getId());
    pimienta_();   // crea el secreto del servidor para el hash de los PIN (una sola vez)
    invalidarTodo_();
    crearHojas_(ss);
    sembrarConfig_(); sembrarRoles_(); sembrarPeriodos_();
    const adm = crearAdminInicial_();
    aplicarValidaciones_(ss);
    limpiarCacheCfg_(); limpiarCachePermisos_(); invalidarTodo_();
    const n = reconstruirResultados_();
    mensaje = 'SGA instalado correctamente.\nResultados calculados: ' + n + ' registros.\n\n' +
      (adm ? 'ADMINISTRADOR INICIAL\nUsuario: ' + adm.usuario + '\nPIN: ' + adm.clave + '\n(Se muestra UNA sola vez. Puede cambiarlo dentro del sistema, en "PIN".)\n\n' : 'Ya existía un administrador activo: no se creó otro.\n\n') +
      'Siguiente paso: Implementar > Nueva implementación > Aplicación web (Ejecutar como: Yo · Acceso: Cualquier persona).';
  } finally { lock.releaseLock(); }
  aviso_(mensaje);
  return true;
}
function crearHojas_(ss) {
  ORDEN_HOJAS.forEach(function (nombre) {
    const enc = ESQUEMA[nombre].cols;
    let sh = ss.getSheetByName(nombre);
    if (!sh) sh = ss.insertSheet(nombre);
    const actuales = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    if (!actuales.length) { sh.getRange(1, 1, 1, enc.length).setValues([enc]); actuales.push.apply(actuales, enc); }
    else enc.forEach(function (h) { if (actuales.indexOf(h) < 0) { sh.getRange(1, actuales.length + 1).setValue(h); actuales.push(h); } });
    sh.getRange(1, 1, 1, actuales.length).setBackground('#1f3a5f').setFontColor('#ffffff').setFontWeight('bold');
    sh.setFrozenRows(1);
    // Fechas, matrículas, teléfonos y hashes se guardan como TEXTO: así Google Sheets no los convierte en fechas ni números.
    actuales.forEach(function (h, i) { if (/^(FECHA|CREADA$|EXPIRA$|ULTIMA_ACTIVIDAD$|BLOQUEADO_HASTA$|ULTIMO_ACCESO$|MATRICULA$|TELEFONO$|SALT$|TOKEN_HASH$|HASH$)/.test(h)) sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@'); });
  });
  const s1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() <= 1 && ss.getSheets().length > 1) ss.deleteSheet(s1);
}
function sembrarConfig_() {
  const t = tabla_(HOJA.CONFIG), existentes = {}; t.rows.forEach(function (r) { existentes[String(r[0])] = true; });
  const nuevas = CONFIG_DEFECTO.filter(function (f) { return !existentes[f[0]]; }).map(function (f) { return [f[0], f[1], f[2], ahora_()]; });
  agregarFilas_(t, nuevas); invalidar_(HOJA.CONFIG);
}
function sembrarRoles_() {
  const tr = tabla_(HOJA.ROLES), tp = tabla_(HOJA.PERMISOS), trp = tabla_(HOJA.ROL_PERMISOS), ahora = ahora_();
  const rolesEx = {}; tr.rows.forEach(function (r) { rolesEx[r[0]] = true; });
  agregarFilas_(tr, ROLES_BASE.filter(function (r) { return !rolesEx[r[0]]; }).map(function (r) { return filaDe_(tr, { ID_ROL: r[0], NOMBRE: r[1], DESCRIPCION: r[2], ES_SISTEMA: 'SI', ESTADO: 'ACTIVO', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora }); }));
  const permEx = {}; tp.rows.forEach(function (r) { permEx[r[0]] = true; });
  const pares = {}; trp.rows.forEach(function (r) { pares[r[0] + '|' + r[1]] = true; });
  const mapaRol = { C: 'COORDINADOR', D: 'DOCENTE', S: 'CONSULTA' }, nuevosP = [], nuevosRP = [];
  PERMISOS_CATALOGO.forEach(function (p) {
    if (!permEx[p[0]]) {   // solo permisos NUEVOS reciben sus roles por defecto (no se pisan cambios del administrador)
      nuevosP.push([p[0], p[1], p[2]]);
      p[3].split('').forEach(function (l) { if (!pares[mapaRol[l] + '|' + p[0]]) nuevosRP.push([mapaRol[l], p[0]]); });
    }
  });
  agregarFilas_(tp, nuevosP); agregarFilas_(trp, nuevosRP);
  invalidar_(HOJA.ROLES); invalidar_(HOJA.PERMISOS); invalidar_(HOJA.ROL_PERMISOS);
}
function sembrarPeriodos_() {
  const ano = config_().ANO_ESCOLAR, t = tabla_(HOJA.PERIODOS);
  if (objetos_(t).some(function (p) { return String(p.ANO_ESCOLAR) === String(ano); })) return;
  const id = generadorId_(HOJA.PERIODOS), ahora = ahora_();
  agregarFilas_(t, PERIODOS_BASE.map(function (p) { return filaDe_(t, { ID_PERIODO: id(), ANO_ESCOLAR: ano, CODIGO: p[0], NOMBRE: p[1], TIPO: p[2], ETAPA: p[3], ORDEN: p[4], MESES: p[5], ESTADO: 'ABIERTO', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora }); }));
  invalidar_(HOJA.PERIODOS);
}
/** Crea el administrador inicial solo si no existe ninguno activo. Devuelve {usuario, clave} o null. */
function crearAdminInicial_() {
  if (adminsActivos_().length) return null;
  const tu = tabla_(HOJA.USUARIOS), ahora = ahora_();
  let correo = ''; try { correo = Session.getEffectiveUser().getEmail(); } catch (e) { /* */ }
  const usuario = todos_(HOJA.USUARIOS).some(function (u) { return String(u.USUARIO).toLowerCase() === 'admin'; }) ? 'administrador' : 'admin';
  const id = generadorId_(HOJA.USUARIOS)(), clave = claveTemporal_();
  agregarFilas_(tu, [filaDe_(tu, { ID_USUARIO: id, NOMBRE: 'Administrador', APELLIDOS: 'del sistema', CORREO: correo || 'admin@local', USUARIO: usuario, ROL: 'ADMINISTRADOR', ESTADO: 'ACTIVO', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora })]);
  invalidar_(HOJA.USUARIOS); guardarCredencial_(id, clave, false);
  historial_('setup', 'CREAR', 'USUARIOS', id, 'Administrador inicial creado'); vaciarHistorial_();
  return { usuario: usuario, clave: clave };
}
/** Asigna un PIN nuevo al primer administrador activo (por si lo olvidó). */
function restablecerClaveAdmin() {
  exigirDueno_();
  const a = adminsActivos_()[0];
  if (!a) { aviso_('No hay administrador activo. Ejecute setupSystem().'); return; }
  const clave = claveTemporal_();
  conBloqueo_(function () { guardarCredencial_(a.ID_USUARIO, clave, false); revocarSesiones_(a.ID_USUARIO); historial_('setup', 'RESTABLECER_ACCESO', 'USUARIOS', a.ID_USUARIO, 'Restablecido desde el editor'); vaciarHistorial_(); });
  aviso_('Usuario: ' + a.USUARIO + '\nPIN: ' + clave + '\n(Puede cambiarlo dentro del sistema, en "PIN".)');
}
/** Validación de datos: solo números de 0 a 100 en las notas. */
function aplicarValidaciones_(ss) {
  const sh = ss.getSheetByName(HOJA.CALIFICACIONES), h = ESQUEMA.CALIFICACIONES.cols;
  const ini = h.indexOf('C1') + 1, fin = h.indexOf('NOTA_ETAPA') + 1;
  const regla = SpreadsheetApp.newDataValidation().requireNumberBetween(0, 100).setAllowInvalid(false).setHelpText('Debe introducir una calificación entre 0 y 100.').build();
  sh.getRange(2, ini, Math.max(sh.getMaxRows() - 1, 1), fin - ini + 1).setDataValidation(regla);
}
function crearRespaldo() {
  exigirDueno_();
  const ss = ss_(), copia = DriveApp.getFileById(ss.getId()).makeCopy('RESPALDO_SGA_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm'));
  aviso_('Respaldo creado: ' + copia.getName());
  return copia.getUrl();
}

/** Datos de demostración. NUNCA se ejecuta solo: requiere PERMITIR_DEMO=SI en CONFIG y una base sin estudiantes. */
function crearDatosDemo() {
  exigirDueno_();
  exigir_(config_().PERMITIR_DEMO === 'SI' || String(tabla_(HOJA.CONFIG).rows.filter(function (r) { return r[0] === 'PERMITIR_DEMO'; }).map(function (r) { return r[1]; })[0]).toUpperCase() === 'SI', 'Ponga PERMITIR_DEMO = SI en la hoja CONFIG para crear datos de prueba.');
  exigir_(!todos_(HOJA.ESTUDIANTES).length, 'La base ya tiene estudiantes: los datos de demostración solo se crean en una base vacía.');
  const ctx = { usuario: 'demo', set: {} }, ano = config_().ANO_ESCOLAR;
  const sec = (function () { guardarCurso_({ usuario: 'demo' }, { datos: { ANO_ESCOLAR: ano, GRADO: '1ro', SECCION: 'Z' } }); return seccionesDeAno_(ano).filter(function (s) { return s.seccion === 'Z'; })[0]; })();
  conBloqueo_(function () { crearEstudiantes_(ctx, ano, sec, ['Demo Uno, Ana', 'Demo Dos, Luis', 'Demo Tres, Rosa'].map(function (n) { return { nombre: n }; })); vaciarHistorial_(); });
  aviso_('Datos de demostración creados en el curso 1ro Z.');
}
