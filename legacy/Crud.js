/*********************************************************************
 * Crud.gs — Motor genérico de mantenimiento (listar / guardar / activar)
 * Cada módulo (Users.gs, Subjects.gs, Assignments.gs…) solo DECLARA su definición:
 * hoja, permisos, campos con validación y ganchos. El motor valida SIEMPRE en el servidor.
 *********************************************************************/

/** Registro de módulos CRUD. Es una función (no una constante) para no depender del orden de carga de los archivos. */
function definiciones_() {
  return { usuarios: defUsuarios_(), docentes: defDocentes_(), asignaturas: defAsignaturas_(), competencias: defCompetencias_(),
    asignaciones: defAsignaciones_(), tutorias: defTutorias_(), periodos: defPeriodos_(), cursos: defCursos_() };
}
function def_(modulo) {
  const d = definiciones_()[modulo];
  exigir_(d, 'Módulo no válido.');
  return d;
}

/** Opciones para campos de tipo "ref" (listas desplegables). */
function opcionesRef_(ref, p) {
  p = p || {};
  const ano = p.ano || config_().ANO_ESCOLAR;
  if (ref === 'docentes') return activos_(HOJA.DOCENTES).map(function (d) { return { id: d.ID_DOCENTE, texto: nombreDocente_(d) }; }).sort(porTexto_);
  if (ref === 'roles') return todos_(HOJA.ROLES).filter(function (r) { return r.ESTADO !== 'INACTIVO'; }).map(function (r) { return { id: r.ID_ROL, texto: r.NOMBRE }; });
  if (ref === 'asignaturas') return activos_(HOJA.ASIGNATURAS).sort(function (a, b) { return (num_(a.ORDEN) || 99) - (num_(b.ORDEN) || 99); }).map(function (a) { return { id: a.ID_ASIGNATURA, texto: a.NOMBRE }; });
  if (ref === 'asignaturas*') return [{ id: '*', texto: 'Todas (general)' }].concat(opcionesRef_('asignaturas'));
  if (ref === 'secciones') return seccionesDeAno_(ano).filter(function (s) { return s.estado !== 'INACTIVO'; }).map(function (s) { return { id: s.idSeccion, texto: s.grado + ' ' + s.seccion + ' (' + s.ano + ')' }; });
  if (ref === 'periodos*') return [{ id: '*', texto: 'Todo el año' }].concat(todos_(HOJA.PERIODOS).filter(function (x) { return String(x.ANO_ESCOLAR) === String(ano) && x.TIPO === 'REGULAR'; }).sort(function (a, b) { return a.ORDEN - b.ORDEN; }).map(function (x) { return { id: x.ID_PERIODO, texto: x.CODIGO + ' – ' + x.NOMBRE }; }));
  if (ref === 'grados') return String(config_().GRADOS).split(',').map(function (g) { return g.trim(); }).filter(Boolean).map(function (g) { return { id: g, texto: g }; });
  throw new ErrorApp('Lista no válida.');
}
function porTexto_(a, b) { return a.texto.localeCompare(b.texto); }
function nombreDocente_(d) { return limpiar_((d.TITULO ? d.TITULO + ' ' : '') + d.NOMBRE_COMPLETO); }

function crudMeta_(ctx, modulo) {
  const d = def_(modulo);
  exigirPermiso_(ctx, d.permisos.ver);
  return { modulo: modulo, idKey: d.idKey || ESQUEMA[d.hoja].cols[0], titulo: d.titulo, singular: d.singular, columnas: d.columnas, campos: d.campos, filtros: d.filtros || [], conAno: !!d.conAno,
    estados: d.estados || ['ACTIVO', 'INACTIVO'], acciones: (d.acciones || []).filter(function (a) { return tiene_(ctx, a.permiso); }),
    puedeCrear: tiene_(ctx, d.permisos.crear), puedeEditar: tiene_(ctx, d.permisos.editar), puedeEstado: tiene_(ctx, d.permisos.estado || d.permisos.editar),
    ayuda: d.ayuda || '' };
}
function crudListar_(ctx, modulo, p) {
  const d = def_(modulo);
  exigirPermiso_(ctx, d.permisos.ver);
  p = p || {};
  p.tam = p.tam || config_().FILAS_POR_PAGINA;
  if (d.listar) return d.listar(ctx, p);
  let items = todos_(d.hoja);
  if (d.conAno && p.ano) items = items.filter(function (o) { return String(o.ANO_ESCOLAR) === String(p.ano); });
  if (d.decorar) items = d.decorar(items, ctx);
  items = items.map(function (o) { const c = Object.assign({}, o); delete c._fila; return c; });
  return paginar_(items, p, d.buscar || []);
}
function crudGuardar_(ctx, modulo, p) {
  const d = def_(modulo);
  p = p || {};
  const nuevo = !p.id;
  exigirPermiso_(ctx, nuevo ? d.permisos.crear : d.permisos.editar);
  if (d.guardar) return d.guardar(ctx, p);
  return conBloqueo_(function () {
    const t = tabla_(d.hoja), idCol = d.hoja && ESQUEMA[d.hoja].cols[0];
    const filaPrevia = nuevo ? -1 : t.rows.findIndex(function (r) { return String(r[0]) === String(p.id); });
    exigir_(nuevo || filaPrevia >= 0, 'El registro no existe.');
    const previo = nuevo ? null : objetos_(t).filter(function (o) { return String(o[idCol]) === String(p.id); })[0];
    const o = crudValidar_(d, p.datos || {}, previo, ctx);
    if (d.antes) d.antes(o, ctx, nuevo, previo);
    crudUnico_(d, o, previo, t);
    const ahora = ahora_();
    let id;
    if (nuevo) {
      id = generadorId_(d.hoja)();
      o[idCol] = id; o.FECHA_CREACION = ahora; o.FECHA_MODIFICACION = ahora;
      if (t.idx.ESTADO !== undefined && !o.ESTADO) o.ESTADO = (d.estados || ['ACTIVO'])[0];
      agregarFilas_(t, [filaDe_(t, o)]);
    } else {
      id = p.id;
      const fila = t.rows[filaPrevia].slice();
      Object.keys(o).forEach(function (k) { if (t.idx[k] !== undefined) fila[t.idx[k]] = o[k]; });
      if (t.idx.FECHA_MODIFICACION !== undefined) fila[t.idx.FECHA_MODIFICACION] = ahora;
      escribirFilas_(t, { [filaPrevia + 2]: fila });
    }
    invalidar_(d.hoja); invalidar_('__sec');
    historial_(ctx.usuario, nuevo ? 'CREAR' : 'EDITAR', d.hoja, id, d.singular + ': ' + (o[d.etiqueta] || id),
      nuevo ? '' : JSON.stringify(crudCambios_(previo, o)).slice(0, 400), nuevo ? '' : '');
    vaciarHistorial_();
    const extra = d.despues ? d.despues(ctx, id, o, nuevo) : null;
    return Object.assign({ id: id }, extra || {});
  });
}
function crudCambios_(previo, nuevo) { const c = {}; Object.keys(nuevo).forEach(function (k) { if (previo && String(previo[k]) !== String(nuevo[k])) c[k] = previo[k] + ' → ' + nuevo[k]; }); return c; }

/** Valida cada campo declarado según su tipo. Devuelve el objeto limpio {COLUMNA: valor}. */
function crudValidar_(d, entrada, previo, ctx) {
  const o = {};
  d.campos.forEach(function (c) {
    if (c.soloCrear && previo) return;
    if (c.soloLectura) return;
    let v = entrada[c.k];
    if (v === undefined) { if (previo) return; v = c.defecto !== undefined ? c.defecto : ''; }
    const et = c.et;
    if (c.tipo === 'num') {
      if (vacio_(v)) { if (c.req) throw new ErrorApp('Escriba ' + et + '.'); o[c.k] = ''; return; }
      const n = num_(v); exigir_(n !== null && n >= (c.min !== undefined ? c.min : -1e9) && n <= (c.max !== undefined ? c.max : 1e9), et + ' no es válido.'); o[c.k] = n; return;
    }
    if (c.tipo === 'si_no') { o[c.k] = esSi_(v) ? 'SI' : 'NO'; return; }
    v = limpiar_(v);
    if (c.req && !v) throw new ErrorApp('Complete el campo: ' + et + '.');
    if (!v) { o[c.k] = ''; return; }
    if (c.tipo === 'correo') { v = v.toLowerCase(); exigir_(correoValido_(v), 'El correo electrónico no es válido.'); }
    else if (c.tipo === 'enum') { exigir_(c.opciones.indexOf(v) >= 0, et + ' no es válido.'); }
    else if (c.tipo === 'ref') { exigir_(opcionesRef_(c.ref, { ano: entrada.ANO_ESCOLAR }).some(function (x) { return String(x.id) === v; }), et + ' no es válido.'); }
    else if (c.tipo === 'patron') { v = c.minusculas ? v.toLowerCase() : v; exigir_(new RegExp(c.patron).test(v), c.msg || (et + ' no es válido.')); }
    else { exigir_(v.length <= (c.max || 150), et + ' es demasiado largo.'); }
    o[c.k] = v;
  });
  return o;
}
/** Evita duplicados según d.unico = [[columnas...], ...] (ignora el propio registro y los inactivos). */
function crudUnico_(d, o, previo, t) {
  (d.unico || []).forEach(function (cols) {
    const clave = function (x) { return cols.map(function (k) { return norm_(x[k]); }).join('|'); };
    const mio = clave(Object.assign({}, previo || {}, o));
    const dup = objetos_(t).some(function (x) {
      return (!previo || x[ESQUEMA[d.hoja].cols[0]] !== previo[ESQUEMA[d.hoja].cols[0]]) && !/^(INACTIVO|CERRADO)$/.test(String(x.ESTADO || '')) && clave(x) === mio;
    });
    if (dup) throw new ErrorApp(d.msgUnico || 'Ya existe un registro con esos mismos datos.');
  });
}
function crudEstado_(ctx, modulo, p) {
  const d = def_(modulo);
  exigirPermiso_(ctx, d.permisos.estado || d.permisos.editar);
  if (d.estado) return d.estado(ctx, p);
  return conBloqueo_(function () {
    const t = tabla_(d.hoja), idCol = ESQUEMA[d.hoja].cols[0];
    const i = t.rows.findIndex(function (r) { return String(r[0]) === String(p.id); });
    exigir_(i >= 0, 'El registro no existe.');
    const est = d.estados || ['ACTIVO', 'INACTIVO'];
    exigir_(est.indexOf(p.estado) >= 0, 'Estado no válido.');
    const fila = t.rows[i].slice(), antes = fila[t.idx.ESTADO];
    fila[t.idx.ESTADO] = p.estado; if (t.idx.FECHA_MODIFICACION !== undefined) fila[t.idx.FECHA_MODIFICACION] = ahora_();
    escribirFilas_(t, { [i + 2]: fila });
    invalidar_(d.hoja); invalidar_('__sec');
    historial_(ctx.usuario, 'ESTADO', d.hoja, p.id, d.singular + ': ' + antes + ' → ' + p.estado, antes, p.estado);
    if (d.despuesEstado) d.despuesEstado(ctx, p);
    vaciarHistorial_();
    return true;
  });
}
