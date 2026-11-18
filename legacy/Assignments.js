/*********************************************************************
 * Assignments.gs — Docentes y asignación DOCENTE + ASIGNATURA + CURSO + SECCIÓN + PERÍODO
 * Aquí se decide el ALCANCE de cada docente: es la base de la seguridad de las calificaciones.
 *********************************************************************/

function usuarioDeDocente_(idDocente) { return todos_(HOJA.USUARIOS).filter(function (u) { return u.ID_DOCENTE === idDocente; })[0] || null; }
/** Propone un nombre de usuario libre a partir del nombre del docente (ej. "karina", "karinaf", "karinaf2"). */
function usuarioSugerido_(doc, ocupados) {
  const limpio = function (t) { return norm_(t).replace(/ /g, ''); };
  let base = limpio(doc.NOMBRES || String(doc.NOMBRE_COMPLETO).split(' ')[0]).slice(0, 16);
  if (base.length < 3) base = (base + 'doc').slice(0, 6);
  const ini = limpio(doc.APELLIDOS || '').charAt(0);
  const cand = [base, base + ini];
  for (let i = 2; i < 60; i++) cand.push(base + ini + i);
  return cand.filter(function (c) { return c.length >= 3 && !ocupados[c]; })[0] || (base + Date.now());
}
function usuariosOcupados_() { const o = {}; todos_(HOJA.USUARIOS).forEach(function (u) { o[String(u.USUARIO).toLowerCase()] = true; }); return o; }
/** Crea el acceso (usuario + PIN) de un docente con rol DOCENTE. Sin bloqueo propio: llamar dentro de conBloqueo_. */
function crearAccesoDocente_(ctx, doc, usuario, pin) {
  return guardarUsuarioNL_(ctx, { datos: { NOMBRE: doc.NOMBRES || doc.NOMBRE_COMPLETO, APELLIDOS: doc.APELLIDOS || '', CORREO: doc.CORREO || '', USUARIO: usuario, ROL: 'DOCENTE', ID_DOCENTE: doc.ID_DOCENTE, PIN: pin || '' } });
}
/** Crea el acceso de un docente o, si ya tiene, le asigna un PIN nuevo. p = { id, usuario?, pin? } */
function docenteAcceso_(ctx, p) {
  return conBloqueo_(function () {
    const doc = porId_(HOJA.DOCENTES, p.id); exigir_(doc, 'El docente no existe.');
    const u = usuarioDeDocente_(doc.ID_DOCENTE), pin = limpiar_(p.pin);
    if (pin) validarPoliticaClave_(pin);
    if (u) {
      exigirPermiso_(ctx, 'usuarios.editar');
      const nuevoPin = pin || claveTemporal_();
      guardarCredencial_(u.ID_USUARIO, nuevoPin, false); revocarSesiones_(u.ID_USUARIO);
      CacheService.getScriptCache().remove(bloqueoCache_(String(u.USUARIO).toLowerCase()));
      if (u.ESTADO !== 'ACTIVO') estadoUsuarioNL_(ctx, { id: u.ID_USUARIO, estado: 'ACTIVO' });
      historial_(ctx.usuario, 'RESTABLECER_ACCESO', 'USUARIOS', u.ID_USUARIO, 'PIN restablecido para ' + u.USUARIO); vaciarHistorial_();
      return { usuario: u.USUARIO, pin: nuevoPin, nuevo: false };
    }
    exigirPermiso_(ctx, 'usuarios.crear');
    const usuario = limpiar_(p.usuario).toLowerCase() || usuarioSugerido_(doc, usuariosOcupados_());
    const r = crearAccesoDocente_(ctx, doc, usuario, pin);
    return { usuario: usuario, pin: r.claveTemporal, nuevo: true };
  });
}
/** Crea el acceso de TODOS los docentes activos que aún no lo tienen. Devuelve la lista (los PIN se muestran una sola vez). */
function docentesAccesosMasivo_(ctx) {
  exigirPermiso_(ctx, 'usuarios.crear');
  return conBloqueo_(function () {
    const ocupados = usuariosOcupados_(), con = {}; todos_(HOJA.USUARIOS).forEach(function (u) { if (u.ID_DOCENTE) con[u.ID_DOCENTE] = true; });
    const salida = [];
    activos_(HOJA.DOCENTES).forEach(function (d) {
      if (con[d.ID_DOCENTE]) return;
      const usuario = usuarioSugerido_(d, ocupados); ocupados[usuario] = true;
      const r = crearAccesoDocente_(ctx, d, usuario, '');
      salida.push({ docente: nombreDocente_(d), usuario: usuario, pin: r.claveTemporal });
    });
    return salida;
  });
}

function defDocentes_() {
  return {
    titulo: 'Docentes', singular: 'Docente', hoja: HOJA.DOCENTES, etiqueta: 'NOMBRE_COMPLETO',
    permisos: { ver: 'docentes.ver', crear: 'docentes.crear', editar: 'docentes.editar' },
    columnas: [['NOMBRE_COMPLETO', 'Nombre'], ['TITULO', 'Título'], ['USUARIO_TXT', 'Usuario'], ['ACCESO_TXT', 'Acceso'], ['CORREO', 'Correo'], ['ESTADO', 'Estado']],
    campos: [
      { k: 'TITULO', et: 'Título (Lic., Licda., Prof.)', tipo: 'texto', max: 15 },
      { k: 'NOMBRES', et: 'Nombres', tipo: 'texto', req: true, max: 80 }, { k: 'APELLIDOS', et: 'Apellidos', tipo: 'texto', max: 80 },
      { k: 'CORREO', et: 'Correo', tipo: 'correo' }, { k: 'TELEFONO', et: 'Teléfono', tipo: 'texto', max: 25 },
      { k: 'USUARIO', et: 'Usuario para entrar al sistema (opcional: si lo escribe se crea su acceso)', tipo: 'patron', patron: '^[a-z0-9._-]{3,30}$', minusculas: true, soloCrear: true, msg: 'El usuario debe tener de 3 a 30 caracteres: letras minúsculas, números, punto, guion.' },
      { k: 'PIN', et: 'PIN de 4 dígitos (vacío = automático)', tipo: 'patron', patron: '^\\d{4}$', soloCrear: true, msg: 'El PIN debe tener exactamente 4 dígitos.' }
    ],
    buscar: ['NOMBRE_COMPLETO', 'CORREO', 'USUARIO_TXT'], filtros: [{ k: 'ESTADO', et: 'Estado', opciones: ['ACTIVO', 'INACTIVO'] }],
    acciones: [{ id: 'acceso', et: 'Acceso / PIN', permiso: 'usuarios.crear' }, { id: 'accesos', et: 'Crear accesos a todos', permiso: 'usuarios.crear', global: true }],
    ayuda: 'El docente entra con su usuario y un PIN de 4 dígitos. Con "Acceso / PIN" crea o restablece el acceso de un docente; "Crear accesos a todos" lo hace de una vez para quienes aún no tienen.',
    decorar: function (items) {
      const us = {}; todos_(HOJA.USUARIOS).forEach(function (u) { if (u.ID_DOCENTE) us[u.ID_DOCENTE] = u; });
      return items.map(function (d) { const u = us[d.ID_DOCENTE]; d.USUARIO_TXT = u ? u.USUARIO : ''; d.ACCESO_TXT = u ? (u.ESTADO === 'ACTIVO' ? 'Activo' : 'Inactivo') : 'Sin acceso'; return d; })
        .sort(function (a, b) { return String(a.NOMBRE_COMPLETO).localeCompare(String(b.NOMBRE_COMPLETO)); });
    },
    antes: function (o, ctx, nuevo, previo) {
      const x = Object.assign({}, previo || {}, o); o.NOMBRE_COMPLETO = limpiar_(x.NOMBRES + ' ' + (x.APELLIDOS || ''));
      if (nuevo && (o.USUARIO || o.PIN)) {
        exigir_(o.USUARIO, 'Para crear el acceso escriba también el usuario.');
        exigirPermiso_(ctx, 'usuarios.crear');
        exigir_(!usuariosOcupados_()[o.USUARIO], 'Ya existe un usuario con ese nombre de usuario.');
        if (o.PIN) validarPoliticaClave_(o.PIN);
      }
    },
    despues: function (ctx, id, o, nuevo) {
      if (!nuevo || !o.USUARIO) return null;
      const r = crearAccesoDocente_(ctx, porId_(HOJA.DOCENTES, id), o.USUARIO, o.PIN);
      return { claveTemporal: r.claveTemporal };
    },
    despuesEstado: function (ctx, p) {   // desactivar un docente también desactiva su acceso y cierra sus sesiones
      if (p.estado !== 'INACTIVO') return;
      const u = usuarioDeDocente_(p.id);
      if (u && u.ESTADO === 'ACTIVO') estadoUsuarioNL_(ctx, { id: u.ID_USUARIO, estado: 'INACTIVO' });
    }
  };
}

function defAsignaciones_() {
  return {
    titulo: 'Asignación de docentes', singular: 'Asignación', hoja: HOJA.ASIGNACIONES, etiqueta: 'ID_ASIGNATURA', conAno: true,
    permisos: { ver: 'asignaciones.ver', crear: 'asignaciones.crear', editar: 'asignaciones.editar' },
    columnas: [['ANO_ESCOLAR', 'Año'], ['CURSO_TXT', 'Curso'], ['ASIGNATURA_TXT', 'Asignatura'], ['DOCENTE_TXT', 'Docente'], ['PERIODO_TXT', 'Período'], ['ESTADO', 'Estado']],
    campos: [
      { k: 'ANO_ESCOLAR', et: 'Año escolar (AAAA-AAAA)', tipo: 'patron', patron: '^\\d{4}-\\d{4}$', req: true, soloCrear: true },
      { k: 'ID_SECCION', et: 'Curso y sección', tipo: 'ref', ref: 'secciones', req: true, soloCrear: true },
      { k: 'ID_ASIGNATURA', et: 'Asignatura', tipo: 'ref', ref: 'asignaturas', req: true, soloCrear: true },
      { k: 'ID_DOCENTE', et: 'Docente', tipo: 'ref', ref: 'docentes', req: true },
      { k: 'ID_PERIODO', et: 'Período (Todo el año o uno regular)', tipo: 'ref', ref: 'periodos*', defecto: '*' }
    ],
    buscar: ['CURSO_TXT', 'ASIGNATURA_TXT', 'DOCENTE_TXT'], filtros: [{ k: 'ESTADO', et: 'Estado', opciones: ['ACTIVO', 'INACTIVO'] }],
    ayuda: 'Define qué docente puede registrar calificaciones y asistencia en cada asignatura y curso. Sin asignación, un docente no ve ni modifica nada.',
    decorar: function (items) {
      const docs = {}; todos_(HOJA.DOCENTES).forEach(function (x) { docs[x.ID_DOCENTE] = nombreDocente_(x); });
      const asg = {}; todos_(HOJA.ASIGNATURAS).forEach(function (x) { asg[x.ID_ASIGNATURA] = x.NOMBRE; });
      const secs = {}; seccionesIndice_().forEach(function (s) { secs[s.idSeccion] = etiquetaSeccion_(s); });
      const per = {}; todos_(HOJA.PERIODOS).forEach(function (x) { per[x.ID_PERIODO] = x.CODIGO; });
      return items.map(function (x) { x.DOCENTE_TXT = docs[x.ID_DOCENTE] || ''; x.ASIGNATURA_TXT = asg[x.ID_ASIGNATURA] || ''; x.CURSO_TXT = secs[x.ID_SECCION] || ''; x.PERIODO_TXT = x.ID_PERIODO === '*' || !x.ID_PERIODO ? 'Todo el año' : (per[x.ID_PERIODO] || ''); return x; })
        .sort(function (a, b) { return a.CURSO_TXT.localeCompare(b.CURSO_TXT) || a.ASIGNATURA_TXT.localeCompare(b.ASIGNATURA_TXT); });
    },
    antes: function (o, ctx, nuevo, previo) {
      const x = Object.assign({}, previo || {}, o), sec = seccionPorId_(x.ID_SECCION);
      exigir_(String(sec.ano) === String(x.ANO_ESCOLAR), 'La sección no corresponde al año escolar indicado.');
      exigir_(asignaturasDeGrado_(sec.grado).some(function (a) { return a.ID_ASIGNATURA === x.ID_ASIGNATURA; }), 'Esa asignatura no se imparte en ' + sec.grado + '.');
      o.ID_CURSO = sec.idCurso; if (!x.ID_PERIODO) o.ID_PERIODO = '*';
      if (x.ID_PERIODO && x.ID_PERIODO !== '*') exigir_(periodosAno_(x.ANO_ESCOLAR).porId[x.ID_PERIODO], 'El período no pertenece a ese año escolar.');
      if (nuevo) o.ESTADO = 'ACTIVO';
    },
    unico: [['ANO_ESCOLAR', 'ID_SECCION', 'ID_ASIGNATURA', 'ID_DOCENTE', 'ID_PERIODO']], msgUnico: 'Ese docente ya está asignado a esa asignatura, curso y período.'
  };
}

/* ---------------- Alcance y permisos de trabajo ---------------- */
function asignacionesActivas_(ano) {
  if (!_mem.__asg) _mem.__asg = {};
  if (!_mem.__asg[ano]) _mem.__asg[ano] = todos_(HOJA.ASIGNACIONES).filter(function (a) { return String(a.ANO_ESCOLAR) === String(ano) && a.ESTADO !== 'INACTIVO'; });
  return _mem.__asg[ano];
}
/** Nombres de los docentes asignados a una asignatura de una sección (para reportes). */
function docentesDe_(ano, idSeccion, idAsig) {
  const nombres = [];
  asignacionesActivas_(ano).forEach(function (a) {
    if (a.ID_SECCION === idSeccion && a.ID_ASIGNATURA === idAsig) { const d = porId_(HOJA.DOCENTES, a.ID_DOCENTE); if (d && nombres.indexOf(nombreDocente_(d)) < 0) nombres.push(nombreDocente_(d)); }
  });
  return nombres.join(' / ');
}
/** Asignaciones propias del usuario (docente vinculado) para una asignatura y sección. */
function misAsignaciones_(ctx, ano, idSeccion, idAsig) {
  if (!ctx.idDocente) return [];
  return asignacionesActivas_(ano).filter(function (a) { return a.ID_DOCENTE === ctx.idDocente && a.ID_SECCION === idSeccion && a.ID_ASIGNATURA === idAsig; });
}
/** ¿Puede el usuario modificar esa asignatura/sección (en ese período)? Siempre se decide en el servidor. */
function puedeTrabajar_(ctx, ano, idSeccion, idAsig, idPeriodo) {
  if (tiene_(ctx, 'calificaciones.administrar')) return true;
  const mias = misAsignaciones_(ctx, ano, idSeccion, idAsig);
  return mias.some(function (a) { return !a.ID_PERIODO || a.ID_PERIODO === '*' || !idPeriodo || a.ID_PERIODO === idPeriodo; });
}
/** Secciones que el usuario puede ver: todas (permiso cursos.ver_todos) o solo donde enseña o es tutor. */
function seccionesPermitidas_(ctx, ano) {
  const todas = seccionesDeAno_(ano).filter(function (s) { return s.estado !== 'INACTIVO'; });
  if (tiene_(ctx, 'cursos.ver_todos')) return todas;
  if (!ctx.idDocente) return [];
  const ids = {};
  asignacionesActivas_(ano).forEach(function (a) { if (a.ID_DOCENTE === ctx.idDocente) ids[a.ID_SECCION] = true; });
  todos_(HOJA.TUTORIAS).forEach(function (t) { if (String(t.ANO_ESCOLAR) === String(ano) && t.ID_DOCENTE === ctx.idDocente && t.ESTADO === 'ACTIVA') ids[t.ID_SECCION] = true; });
  return todas.filter(function (s) { return ids[s.idSeccion]; });
}
function exigirSeccion_(ctx, ano, idSeccion) {
  const s = seccionPorId_(idSeccion);
  exigir_(String(s.ano) === String(ano), 'El curso no corresponde al año escolar seleccionado.');
  exigir_(seccionesPermitidas_(ctx, ano).some(function (x) { return x.idSeccion === idSeccion; }), 'No tiene acceso a este curso.', 'PERMISO');
  return s;
}
/** Asignaturas del grado que el usuario puede ver en esa sección (el docente solo las suyas). */
function asignaturasVisibles_(ctx, ano, sec) {
  const todas = asignaturasDeGrado_(sec.grado);
  if (tiene_(ctx, 'calificaciones.administrar') || tiene_(ctx, 'cursos.ver_todos')) return todas;
  return todas.filter(function (a) { return misAsignaciones_(ctx, ano, sec.idSeccion, a.ID_ASIGNATURA).length > 0; });
}

/* ---------------- Panel de asignación (pantalla "Asignación docente") ---------------- */
function panelAsignaciones_(ctx, p) {
  exigirPermiso_(ctx, 'asignaciones.ver');
  const ano = p.ano || config_().ANO_ESCOLAR;
  const docs = {}; todos_(HOJA.DOCENTES).forEach(function (d) { docs[d.ID_DOCENTE] = d; });
  const us = {}; todos_(HOJA.USUARIOS).forEach(function (u) { if (u.ID_DOCENTE) us[u.ID_DOCENTE] = u.USUARIO; });
  const asg = {}; todos_(HOJA.ASIGNATURAS).forEach(function (a) { asg[a.ID_ASIGNATURA] = a.NOMBRE; });
  const per = {}; todos_(HOJA.PERIODOS).forEach(function (x) { per[x.ID_PERIODO] = x.CODIGO; });
  const secs = {}; seccionesIndice_().forEach(function (s) { secs[s.idSeccion] = etiquetaSeccion_(s); });
  const porGrado = {};
  seccionesDeAno_(ano).forEach(function (s) { if (!porGrado[s.grado]) porGrado[s.grado] = asignaturasDeGrado_(s.grado).map(function (a) { return { id: a.ID_ASIGNATURA, nombre: a.NOMBRE }; }); });
  return {
    ano: ano,
    docentes: activos_(HOJA.DOCENTES).map(function (d) { return { id: d.ID_DOCENTE, nombre: nombreDocente_(d), usuario: us[d.ID_DOCENTE] || '' }; }).sort(porNombre_),
    asignaciones: asignacionesActivas_(ano).map(function (a) {
      const d = docs[a.ID_DOCENTE];
      return { id: a.ID_ASIGNACION, idSeccion: a.ID_SECCION, idAsignatura: a.ID_ASIGNATURA, idDocente: a.ID_DOCENTE, idPeriodo: a.ID_PERIODO || '*', docente: d ? nombreDocente_(d) : a.ID_DOCENTE,
        asignatura: asg[a.ID_ASIGNATURA] || a.ID_ASIGNATURA, curso: secs[a.ID_SECCION] || '', periodo: (!a.ID_PERIODO || a.ID_PERIODO === '*') ? 'Todo el año' : (per[a.ID_PERIODO] || ''), valida: !!(d && d.ESTADO !== 'INACTIVO') };
    }),
    asignaturasPorGrado: porGrado,
    puedeCrear: tiene_(ctx, 'asignaciones.crear'), puedeEditar: tiene_(ctx, 'asignaciones.editar')
  };
}
function porNombre_(a, b) { return a.nombre.localeCompare(b.nombre); }

/** Asigna (o quita, si idDocente = '') el docente de UNA asignatura en un curso. Un solo docente por asignatura: reemplaza lo anterior. */
function asignarDocente_(ctx, p) {
  const ano = p.ano || config_().ANO_ESCOLAR, sec = seccionPorId_(p.idSeccion), ida = String(p.idAsignatura || ''), idDoc = String(p.idDocente || '');
  exigir_(String(sec.ano) === String(ano), 'El curso no corresponde al año escolar.');
  exigir_(asignaturasDeGrado_(sec.grado).some(function (a) { return a.ID_ASIGNATURA === ida; }), 'La asignatura no corresponde a ' + sec.grado + '.');
  if (idDoc) { exigirPermiso_(ctx, 'asignaciones.crear'); exigir_(activos_(HOJA.DOCENTES).some(function (d) { return d.ID_DOCENTE === idDoc; }), 'El docente no existe o está inactivo.'); }
  else exigirPermiso_(ctx, 'asignaciones.editar');
  const destinos = p.todasSecciones ? seccionesDeAno_(ano).filter(function (s) { return s.grado === sec.grado && s.estado !== 'INACTIVO'; }) : [sec];
  return conBloqueo_(function () {
    const t = tabla_(HOJA.ASIGNACIONES), nuevoId = generadorId_(HOJA.ASIGNACIONES), ahora = ahora_(), mapa = {}, nuevas = [];
    destinos.forEach(function (d) {
      let reutilizada = false, antes = '';
      t.rows.forEach(function (r, i) {
        if (String(r[t.idx.ANO_ESCOLAR]) !== String(ano) || r[t.idx.ID_SECCION] !== d.idSeccion || r[t.idx.ID_ASIGNATURA] !== ida || r[t.idx.ESTADO] === 'INACTIVO') return;
        const f = (mapa[i + 2] || r).slice(); antes = antes || r[t.idx.ID_DOCENTE];
        if (idDoc && !reutilizada && (r[t.idx.ID_PERIODO] === '*' || !r[t.idx.ID_PERIODO])) { f[t.idx.ID_DOCENTE] = idDoc; f[t.idx.ID_PERIODO] = '*'; reutilizada = true; }
        else f[t.idx.ESTADO] = 'INACTIVO';
        f[t.idx.FECHA_MODIFICACION] = ahora; mapa[i + 2] = f;
      });
      if (idDoc && !reutilizada) nuevas.push(filaDe_(t, { ID_ASIGNACION: nuevoId(), ANO_ESCOLAR: ano, ID_DOCENTE: idDoc, ID_ASIGNATURA: ida, ID_CURSO: d.idCurso, ID_SECCION: d.idSeccion, ID_PERIODO: '*', ESTADO: 'ACTIVO', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora }));
      if (antes !== idDoc) historial_(ctx.usuario, idDoc ? 'ASIGNAR_DOCENTE' : 'QUITAR_DOCENTE', 'ASIGNACIONES', d.idSeccion, ano + ' ' + etiquetaSeccion_(d) + ' · ' + ida, antes, idDoc);
    });
    escribirFilas_(t, mapa); agregarFilas_(t, nuevas);
    invalidar_(HOJA.ASIGNACIONES); delete _mem.__asg; vaciarHistorial_();
    return { aplicadas: destinos.length, quitado: !idDoc };
  });
}
/** Copia las asignaciones de un año a otro emparejando las secciones por grado y letra. No pisa las que ya existan. */
function copiarAsignaciones_(ctx, p) {
  exigirPermiso_(ctx, 'asignaciones.crear');
  const o = limpiar_(p.anoOrigen), d = limpiar_(p.anoDestino);
  exigir_(o && d && o !== d, 'Indique dos años escolares distintos.');
  return conBloqueo_(function () {
    const t = tabla_(HOJA.ASIGNACIONES), nuevoId = generadorId_(HOJA.ASIGNACIONES), ahora = ahora_();
    const secD = {}; seccionesDeAno_(d).forEach(function (s) { secD[s.grado + '|' + s.seccion] = s; });
    const secO = {}; seccionesDeAno_(o).forEach(function (s) { secO[s.idSeccion] = s; });
    const perO = periodosAno_(o).porId, perD = {}; periodosAno_(d).lista.forEach(function (x) { perD[x.CODIGO] = x.ID_PERIODO; });
    const existe = {}; asignacionesActivas_(d).forEach(function (a) { existe[a.ID_SECCION + '|' + a.ID_ASIGNATURA] = true; });
    const nuevas = []; let omitidas = 0, sinCurso = 0;
    asignacionesActivas_(o).forEach(function (a) {
      const so = secO[a.ID_SECCION], sd = so && secD[so.grado + '|' + so.seccion];
      if (!sd) { sinCurso++; return; }
      const k = sd.idSeccion + '|' + a.ID_ASIGNATURA; if (existe[k]) { omitidas++; return; }
      existe[k] = true;
      const pid = (!a.ID_PERIODO || a.ID_PERIODO === '*') ? '*' : (perD[(perO[a.ID_PERIODO] || {}).CODIGO] || '*');
      nuevas.push(filaDe_(t, { ID_ASIGNACION: nuevoId(), ANO_ESCOLAR: d, ID_DOCENTE: a.ID_DOCENTE, ID_ASIGNATURA: a.ID_ASIGNATURA, ID_CURSO: sd.idCurso, ID_SECCION: sd.idSeccion, ID_PERIODO: pid, ESTADO: 'ACTIVO', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora }));
    });
    agregarFilas_(t, nuevas); invalidar_(HOJA.ASIGNACIONES); delete _mem.__asg;
    historial_(ctx.usuario, 'COPIAR_ASIGNACIONES', 'ASIGNACIONES', d, o + ' → ' + d + ': ' + nuevas.length + ' copiadas'); vaciarHistorial_();
    return { copiadas: nuevas.length, omitidas: omitidas, sinCurso: sinCurso };
  });
}
