/*********************************************************************
 * Users.gs — Usuarios, roles y permisos (administración)
 *********************************************************************/

function defUsuarios_() {
  return {
    titulo: 'Usuarios', singular: 'Usuario', hoja: HOJA.USUARIOS, etiqueta: 'USUARIO',
    permisos: { ver: 'usuarios.ver', crear: 'usuarios.crear', editar: 'usuarios.editar', estado: 'usuarios.eliminar' },
    columnas: [['USUARIO', 'Usuario'], ['NOMBRE_COMPLETO', 'Nombre'], ['CORREO', 'Correo'], ['ROL_TXT', 'Rol'], ['DOCENTE_TXT', 'Docente vinculado'], ['ESTADO', 'Estado'], ['ULTIMO_ACCESO', 'Último acceso']],
    campos: [
      { k: 'NOMBRE', et: 'Nombre', tipo: 'texto', req: true, max: 80 }, { k: 'APELLIDOS', et: 'Apellidos', tipo: 'texto', max: 80 },
      { k: 'CORREO', et: 'Correo (opcional)', tipo: 'correo' },
      { k: 'USUARIO', et: 'Usuario (para iniciar sesión)', tipo: 'patron', patron: '^[a-z0-9._-]{3,30}$', minusculas: true, req: true, soloCrear: true, msg: 'El usuario debe tener de 3 a 30 caracteres: letras minúsculas, números, punto, guion.' },
      { k: 'PIN', et: 'PIN de 4 dígitos (déjelo vacío para que el sistema genere uno; si lo escribe, se cambia el PIN actual)', tipo: 'patron', patron: '^\\d{4}$', msg: 'El PIN debe tener exactamente 4 dígitos.' },
      { k: 'ROL', et: 'Rol', tipo: 'ref', ref: 'roles', req: true }, { k: 'ID_DOCENTE', et: 'Docente vinculado (para el rol Docente)', tipo: 'ref', ref: 'docentes' },
      { k: 'PERMISOS_EXTRA', et: 'Permisos extra (separados por coma)', tipo: 'texto', max: 400 }, { k: 'PERMISOS_DENEGADOS', et: 'Permisos denegados (separados por coma)', tipo: 'texto', max: 400 }
    ],
    buscar: ['USUARIO', 'NOMBRE_COMPLETO', 'CORREO'], filtros: [{ k: 'ROL', et: 'Rol', ref: 'roles' }, { k: 'ESTADO', et: 'Estado', opciones: ['ACTIVO', 'INACTIVO'] }],
    acciones: [{ id: 'restablecer', et: 'Restablecer acceso', permiso: 'usuarios.editar' }],
    ayuda: 'Cada usuario entra con su nombre de usuario y un PIN de 4 dígitos. Al crear un usuario o restablecer su acceso, el PIN se muestra UNA sola vez: anótelo y entréguelo.',
    decorar: function (items) {
      const roles = {}; todos_(HOJA.ROLES).forEach(function (r) { roles[r.ID_ROL] = r.NOMBRE; });
      const docs = {}; todos_(HOJA.DOCENTES).forEach(function (x) { docs[x.ID_DOCENTE] = nombreDocente_(x); });
      return items.map(function (u) { u.NOMBRE_COMPLETO = limpiar_(u.NOMBRE + ' ' + (u.APELLIDOS || '')); u.ROL_TXT = roles[u.ROL] || u.ROL; u.DOCENTE_TXT = docs[u.ID_DOCENTE] || ''; return u; });
    },
    guardar: guardarUsuario_, estado: estadoUsuario_
  };
}
function permisosValidos_(txt) {
  const lista = String(txt || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  const todos = todosLosPermisos_();
  lista.forEach(function (p) { exigir_(todos.indexOf(p) >= 0, 'El permiso "' + p + '" no existe.'); });
  return lista.join(',');
}
function adminsActivos_() { return todos_(HOJA.USUARIOS).filter(function (u) { return u.ROL === 'ADMINISTRADOR' && u.ESTADO === 'ACTIVO'; }); }

function guardarUsuario_(ctx, p) { return conBloqueo_(function () { return guardarUsuarioNL_(ctx, p); }); }
/** Crea/edita un usuario. NL = "sin bloqueo": quien la llama ya debe tener el bloqueo (conBloqueo_). */
function guardarUsuarioNL_(ctx, p) {
  const d = defUsuarios_(), nuevo = !p.id;
  return (function () {
    const t = tabla_(HOJA.USUARIOS);
    const previo = nuevo ? null : objetos_(t).filter(function (o) { return o.ID_USUARIO === p.id; })[0];
    exigir_(nuevo || previo, 'El usuario no existe.');
    const o = crudValidar_(d, p.datos || {}, previo, ctx);
    const pinElegido = o.PIN || ''; delete o.PIN;
    if (pinElegido) validarPoliticaClave_(pinElegido);
    o.PERMISOS_EXTRA = permisosValidos_(o.PERMISOS_EXTRA); o.PERMISOS_DENEGADOS = permisosValidos_(o.PERMISOS_DENEGADOS);
    if (o.ROL === 'DOCENTE') exigir_(o.ID_DOCENTE, 'Para el rol Docente vincule al docente (así se limita su acceso a sus cursos).');
    const todosU = objetos_(t);
    if (o.CORREO) exigir_(!todosU.some(function (x) { return (!previo || x.ID_USUARIO !== previo.ID_USUARIO) && String(x.CORREO).toLowerCase() === o.CORREO; }), 'Ya existe un usuario con ese correo.');
    if (nuevo) exigir_(!todosU.some(function (x) { return String(x.USUARIO).toLowerCase() === o.USUARIO; }), 'Ya existe un usuario con ese nombre de usuario.');
    if (previo && previo.ROL === 'ADMINISTRADOR' && o.ROL !== 'ADMINISTRADOR')
      exigir_(adminsActivos_().some(function (a) { return a.ID_USUARIO !== previo.ID_USUARIO; }), 'No puede quitar el rol al único administrador activo.');
    if (previo && previo.ID_USUARIO === ctx.id) exigir_(o.ROL === previo.ROL, 'No puede cambiar su propio rol.');
    if (o.ROL === 'ADMINISTRADOR') exigirPermiso_(ctx, 'roles.administrar');   // solo quien administra roles crea otros administradores
    const ahora = ahora_();
    let id, clave = null;
    if (nuevo) {
      id = generadorId_(HOJA.USUARIOS)();
      Object.assign(o, { ID_USUARIO: id, ESTADO: 'ACTIVO', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora, ULTIMO_ACCESO: '' });
      agregarFilas_(t, [filaDe_(t, o)]);
      clave = pinElegido || claveTemporal_(); guardarCredencial_(id, clave, false);
    } else {
      id = p.id;
      const i = t.rows.findIndex(function (r) { return r[0] === id; }), fila = t.rows[i].slice();
      Object.keys(o).forEach(function (k) { if (t.idx[k] !== undefined) fila[t.idx[k]] = o[k]; });
      fila[t.idx.FECHA_MODIFICACION] = ahora;
      escribirFilas_(t, { [i + 2]: fila });
      if (pinElegido) { guardarCredencial_(id, pinElegido, false); revocarSesiones_(id); }
      else if (previo.ROL !== o.ROL || previo.PERMISOS_EXTRA !== o.PERMISOS_EXTRA || previo.PERMISOS_DENEGADOS !== o.PERMISOS_DENEGADOS) revocarSesiones_(id);
    }
    invalidar_(HOJA.USUARIOS);
    historial_(ctx.usuario, nuevo ? 'CREAR' : 'EDITAR', 'USUARIOS', id, 'Usuario ' + (o.USUARIO || previo.USUARIO) + (previo && previo.ROL !== o.ROL ? ' (rol: ' + previo.ROL + ' → ' + o.ROL + ')' : ''));
    vaciarHistorial_();
    return { id: id, claveTemporal: clave };
  })();
}
function estadoUsuario_(ctx, p) { return conBloqueo_(function () { return estadoUsuarioNL_(ctx, p); }); }
function estadoUsuarioNL_(ctx, p) {
  return (function () {
    const t = tabla_(HOJA.USUARIOS), i = t.rows.findIndex(function (r) { return r[0] === p.id; });
    exigir_(i >= 0, 'El usuario no existe.');
    exigir_(['ACTIVO', 'INACTIVO'].indexOf(p.estado) >= 0, 'Estado no válido.');
    const u = objetos_(t).filter(function (o) { return o.ID_USUARIO === p.id; })[0];
    if (p.estado === 'INACTIVO') {
      exigir_(u.ID_USUARIO !== ctx.id, 'No puede desactivar su propio usuario.');
      if (u.ROL === 'ADMINISTRADOR') exigir_(adminsActivos_().some(function (a) { return a.ID_USUARIO !== u.ID_USUARIO; }), 'No puede desactivar al único administrador activo.');
    }
    const fila = t.rows[i].slice(); fila[t.idx.ESTADO] = p.estado; fila[t.idx.FECHA_MODIFICACION] = ahora_();
    escribirFilas_(t, { [i + 2]: fila }); invalidar_(HOJA.USUARIOS);
    if (p.estado === 'INACTIVO') revocarSesiones_(p.id);
    historial_(ctx.usuario, 'ESTADO', 'USUARIOS', p.id, 'Usuario ' + u.USUARIO + ': ' + u.ESTADO + ' → ' + p.estado, u.ESTADO, p.estado); vaciarHistorial_();
    return true;
  })();
}
/** Restablece el acceso: asigna un PIN nuevo (el indicado o uno generado; se muestra una sola vez) y cierra sus sesiones. */
function restablecerAcceso_(ctx, p) {
  exigirPermiso_(ctx, 'usuarios.editar');
  return conBloqueo_(function () {
    const u = todos_(HOJA.USUARIOS).filter(function (o) { return o.ID_USUARIO === p.id; })[0];
    exigir_(u, 'El usuario no existe.');
    const pin = limpiar_(p.pin);
    if (pin) validarPoliticaClave_(pin);
    const clave = pin || claveTemporal_();
    guardarCredencial_(u.ID_USUARIO, clave, false);
    revocarSesiones_(u.ID_USUARIO);
    CacheService.getScriptCache().remove(bloqueoCache_(String(u.USUARIO).toLowerCase()));
    historial_(ctx.usuario, 'RESTABLECER_ACCESO', 'USUARIOS', u.ID_USUARIO, 'Acceso restablecido para ' + u.USUARIO); vaciarHistorial_();
    return { claveTemporal: clave, usuario: u.USUARIO };
  });
}

/* ---------------- Roles y permisos ---------------- */
function rolesListar_(ctx) {
  exigirPermiso_(ctx, 'roles.ver');
  const rp = permisosPorRol_(), usados = {};
  todos_(HOJA.USUARIOS).forEach(function (u) { usados[u.ROL] = (usados[u.ROL] || 0) + 1; });
  return {
    roles: todos_(HOJA.ROLES).map(function (r) { return { id: r.ID_ROL, nombre: r.NOMBRE, descripcion: r.DESCRIPCION, sistema: esSi_(r.ES_SISTEMA), estado: r.ESTADO, usuarios: usados[r.ID_ROL] || 0,
      permisos: r.ID_ROL === 'ADMINISTRADOR' ? todosLosPermisos_() : (rp[r.ID_ROL] || []) }; }),
    catalogo: todos_(HOJA.PERMISOS).map(function (p) { return { id: p.ID_PERMISO, modulo: p.MODULO, descripcion: p.DESCRIPCION }; }),
    puedeAdministrar: tiene_(ctx, 'roles.administrar')
  };
}
/** Crea un rol o cambia sus permisos. El rol ADMINISTRADOR no se puede modificar. */
function rolesGuardar_(ctx, p) {
  exigirPermiso_(ctx, 'roles.administrar');
  return conBloqueo_(function () {
    const tr = tabla_(HOJA.ROLES), tp = tabla_(HOJA.ROL_PERMISOS);
    const validos = todosLosPermisos_();
    const perms = (p.permisos || []).filter(function (x, i, a) { return a.indexOf(x) === i; });
    perms.forEach(function (x) { exigir_(validos.indexOf(x) >= 0, 'El permiso "' + x + '" no existe.'); });
    let id = p.id;
    const ahora = ahora_();
    if (!id) {
      const nombre = texto_(p.nombre, 'el nombre del rol', { req: true, max: 40 });
      id = nombre.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
      exigir_(id.length >= 3, 'El nombre del rol no es válido.');
      exigir_(!tr.rows.some(function (r) { return r[0] === id; }), 'Ya existe un rol con ese nombre.');
      agregarFilas_(tr, [filaDe_(tr, { ID_ROL: id, NOMBRE: nombre, DESCRIPCION: texto_(p.descripcion, 'la descripción', { max: 200 }), ES_SISTEMA: 'NO', ESTADO: 'ACTIVO', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora })]);
    } else {
      exigir_(id !== 'ADMINISTRADOR', 'El rol Administrador no se puede modificar: siempre tiene todos los permisos.');
      const i = tr.rows.findIndex(function (r) { return r[0] === id; });
      exigir_(i >= 0, 'El rol no existe.');
      const f = tr.rows[i].slice();
      if (p.descripcion !== undefined) f[tr.idx.DESCRIPCION] = texto_(p.descripcion, 'la descripción', { max: 200 });
      if (p.estado === 'ACTIVO' || p.estado === 'INACTIVO') f[tr.idx.ESTADO] = p.estado;
      f[tr.idx.FECHA_MODIFICACION] = ahora;
      escribirFilas_(tr, { [i + 2]: f });
    }
    if (p.permisos) {   // reemplaza el conjunto de permisos del rol (reescribe la hoja ROL_PERMISOS en un solo lote)
      const resto = tp.rows.filter(function (r) { return r[0] && r[0] !== id; });
      const nuevas = resto.concat(perms.map(function (x) { return [id, x]; }));
      const sh = tp.sh;
      if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
      if (nuevas.length) sh.getRange(2, 1, nuevas.length, 2).setValues(nuevas);
    }
    invalidar_(HOJA.ROLES); invalidar_(HOJA.ROL_PERMISOS); limpiarCachePermisos_();
    todos_(HOJA.USUARIOS).filter(function (u) { return u.ROL === id; }).forEach(function (u) { revocarSesiones_(u.ID_USUARIO); });   // los permisos nuevos rigen de inmediato
    historial_(ctx.usuario, p.id ? 'EDITAR' : 'CREAR', 'ROLES', id, 'Rol ' + id + ': ' + perms.length + ' permisos');
    vaciarHistorial_();
    return { id: id };
  });
}
