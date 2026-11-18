
/*********************************************************************
 * Code.gs — PUNTO DE ENTRADA de la aplicación web
 *
 * SEGURIDAD: google.script.run puede llamar a cualquier función pública del proyecto.
 * Por eso el navegador SOLO puede invocar doGet, apiLogin y apiEjecutar. Todo lo demás
 * está detrás de la tabla RUTAS, que exige sesión válida + permiso en el SERVIDOR.
 *********************************************************************/

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(SGA.NOMBRE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
/** Inserta el contenido de Styles.html / JavaScript.html dentro de Index.html. */
function incluir_(nombre) { return HtmlService.createHtmlOutputFromFile(nombre).getContent(); }

/* ---------------- Rutas: acción → función + permiso ---------------- */
/** Cada ruta recibe (ctx, datos). Es una función para no depender del orden de carga de los archivos. */
function rutas_() {
  return {
    'sesion.bootstrap':        { fn: function (ctx) { return bootstrap_(ctx); }, libre: true },
    'sesion.cerrar':           { fn: function (ctx) { return cerrarSesion_(ctx); }, libre: true },
    'sesion.cambiarClave':     { fn: function (ctx, d) { return cambiarClave_(ctx, d.actual, d.nueva); }, libre: true },
    'cursos.listarLigero':     { fn: cursosListarLigero_, permiso: 'cursos.ver' },
    'cursos.asignaturas':      { fn: asignaturasCurso_, permiso: 'calificaciones.ver' },
    'calificaciones.grid':     { fn: obtenerGrid_ },
    'calificaciones.guardar':  { fn: guardarNotas_ },
    'asistencia.obtener':      { fn: obtenerAsistencia_ },
    'asistencia.guardar':      { fn: guardarAsistencia_ },
    'reportes.curso':          { fn: datosCurso_ },
    'reportes.dashboard':      { fn: dashboard_ },
    'estudiantes.listar':      { fn: listarEstudiantes_ },
    'estudiantes.guardar':     { fn: guardarEstudiante_ },
    'estudiantes.estado':      { fn: estadoEstudiante_ },
    'estudiantes.importar':    { fn: importarEstudiantes_ },
    'estudiantes.sincronizar': { fn: sincronizarRegistro_ },
    'estudiantes.asignar':     { fn: asignarEstudiante_ },
    'estudiantes.buscar':      { fn: function (ctx, d) { return buscarEstudiantes_(ctx, d.q, d.ano); } },
    'estudiantes.consulta':    { fn: consultaEstudiante_ },
    'estudiantes.historial':   { fn: historialAcademico_ },
    'crud.meta':               { fn: function (ctx, d) { return crudMeta_(ctx, d.modulo); } },
    'crud.listar':             { fn: function (ctx, d) { return crudListar_(ctx, d.modulo, d); } },
    'crud.guardar':            { fn: function (ctx, d) { return crudGuardar_(ctx, d.modulo, d); } },
    'crud.estado':             { fn: function (ctx, d) { return crudEstado_(ctx, d.modulo, d); } },
    'crud.opciones':           { fn: function (ctx, d) { return opcionesRef_(String(d.ref), d); } },
    'usuarios.restablecer':    { fn: restablecerAcceso_ },
    'docentes.acceso':         { fn: docenteAcceso_ },
    'docentes.accesosMasivo':  { fn: function (ctx) { return docentesAccesosMasivo_(ctx); } },
    'asignaciones.panel':      { fn: panelAsignaciones_ },
    'asignaciones.asignar':    { fn: asignarDocente_ },
    'asignaciones.copiar':     { fn: copiarAsignaciones_ },
    'observaciones.listar':    { fn: listarObservaciones_ },
    'observaciones.guardar':   { fn: guardarObservacion_ },
    'observaciones.estado':    { fn: estadoObservacion_ },
    'roles.listar':            { fn: rolesListar_ },
    'roles.guardar':           { fn: rolesGuardar_ },
    'periodos.duplicar':       { fn: duplicarPeriodos_ },
    'historial.listar':        { fn: listarHistorial_ },
    'config.obtener':          { fn: configObtener_ },
    'config.guardar':          { fn: configGuardar_ }
  };
}

/** Inicio de sesión. Devuelve el token y los datos de arranque. Nunca revela si el usuario existe. */
function apiLogin(usuario, clave) {
  try {
    const r = login_(usuario, clave);
    const ctx = r.ctx;
    return { ok: true, data: { token: r.token, boot: bootstrap_(ctx) } };
  } catch (e) { return respuestaError_('apiLogin', e, ''); }
}
/** ÚNICA puerta de entrada para el resto de operaciones. */
function apiEjecutar(accion, token, datos) {
  let ctx = null;
  try {
    const ruta = rutas_()[String(accion)];
    if (!ruta) throw new ErrorApp('Operación no válida.');
    ctx = sesionDe_(token);
    if (ctx.debeCambiar && !ruta.libre) throw new ErrorApp('Debe cambiar su contraseña temporal antes de continuar.', 'CAMBIAR_CLAVE');
    if (ruta.permiso) exigirPermiso_(ctx, ruta.permiso);
    const d = (datos && typeof datos === 'object') ? datos : {};
    return { ok: true, data: ruta.fn(ctx, d) };
  } catch (e) { return respuestaError_(String(accion), e, ctx ? ctx.usuario : ''); }
}
/** Errores de negocio → mensaje claro. Errores técnicos → se registran y el usuario ve solo una referencia. */
function respuestaError_(nombre, e, usuario) {
  if (e instanceof ErrorApp || (e && e.name === 'ErrorApp')) return { ok: false, error: e.message, codigo: e.codigo };
  const ref = registrarError_(nombre, e, usuario);
  return { ok: false, error: 'No se pudo completar la operación. Inténtelo de nuevo; si persiste informe al administrador (ref. ' + ref + ').', codigo: 'ERROR' };
}

