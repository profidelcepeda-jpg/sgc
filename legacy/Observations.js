/*********************************************************************
 * Observations.gs — Observaciones de estudiantes (académicas, de conducta, de asistencia, de familia…)
 *
 * Reglas de acceso (siempre validadas en el servidor):
 *   · Solo se ven/registran en cursos a los que el usuario tiene acceso (enseña, es tutor, o ve todos los cursos).
 *   · El docente ve SUS observaciones y, si es tutor del curso, todas las del curso.
 *   · Coordinadores y quienes ven todos los cursos ven todas; solo el autor (o quien tiene "administrar") edita o anula.
 *   · Nunca se borran: se ANULAN (queda en el historial de auditoría).
 *********************************************************************/

const TIPOS_OBSERVACION = ['ACADEMICA', 'CONDUCTA', 'ASISTENCIA', 'FAMILIA', 'OTRA'];

function esTutorDe_(ctx, ano, idSeccion) { const t = tutorDe_(ano, idSeccion); return !!(t && ctx.idDocente && t.ID_DOCENTE === ctx.idDocente); }
function veTodasObs_(ctx, ano, idSeccion) { return tiene_(ctx, 'cursos.ver_todos') || tiene_(ctx, 'observaciones.administrar') || esTutorDe_(ctx, ano, idSeccion); }
function esAutorObs_(ctx, o) { return ctx.idDocente ? o.ID_DOCENTE === ctx.idDocente : String(o.CREADO_POR) === ctx.usuario; }
function puedeEditarObs_(ctx, o) { return tiene_(ctx, 'observaciones.administrar') || (tiene_(ctx, 'observaciones.editar') && esAutorObs_(ctx, o)); }

function listarObservaciones_(ctx, p) {
  exigirPermiso_(ctx, 'observaciones.ver');
  const ano = p.ano || config_().ANO_ESCOLAR, sec = exigirSeccion_(ctx, ano, p.idSeccion);
  const estu = estudiantesDeSeccion_(ano, sec.idSeccion, true), enombre = {}; estu.forEach(function (e) { enombre[e.idEstudiante] = e.nombre; });
  const asg = {}; todos_(HOJA.ASIGNATURAS).forEach(function (a) { asg[a.ID_ASIGNATURA] = a.NOMBRE; });
  const docs = {}; todos_(HOJA.DOCENTES).forEach(function (d) { docs[d.ID_DOCENTE] = nombreDocente_(d); });
  const per = periodosAno_(ano), todas = veTodasObs_(ctx, ano, sec.idSeccion);
  let items = objetosGrupo_(leerPorClave_(HOJA.OBSERVACIONES, 'ID_SECCION', sec.idSeccion)).filter(function (o) { return String(o.ANO_ESCOLAR) === String(ano); });
  if (!todas) items = items.filter(function (o) { return esAutorObs_(ctx, o); });
  if (p.idEstudiante) items = items.filter(function (o) { return o.ID_ESTUDIANTE === p.idEstudiante; });
  if (p.tipo) items = items.filter(function (o) { return o.TIPO === p.tipo; });
  if (!p.incluirAnuladas) items = items.filter(function (o) { return o.ESTADO !== 'ANULADA'; });
  items = items.map(function (o) {
    return { id: o.ID_OBSERVACION, fecha: String(o.FECHA || ''), idEstudiante: o.ID_ESTUDIANTE, estudiante: enombre[o.ID_ESTUDIANTE] || '', tipo: o.TIPO, idAsignatura: o.ID_ASIGNATURA, asignatura: asg[o.ID_ASIGNATURA] || '',
      idPeriodo: o.ID_PERIODO, periodo: (per.porId[o.ID_PERIODO] || {}).CODIGO || '', docente: docs[o.ID_DOCENTE] || o.CREADO_POR || '', texto: o.OBSERVACION, estado: o.ESTADO, puedeEditar: puedeEditarObs_(ctx, o), _orden: String(o.FECHA || '') + String(o.FECHA_CREACION || '') };
  }).sort(function (a, b) { return b._orden.localeCompare(a._orden); });
  const r = paginar_(items, { q: p.q, pagina: p.pagina, tam: p.tam || 25 }, ['estudiante', 'texto', 'docente', 'asignatura']);
  r.items.forEach(function (x) { delete x._orden; });
  r.estudiantes = estu.map(function (e) { return { id: e.idEstudiante, num: e.num, nombre: e.nombre }; });
  r.periodos = per.lista.map(function (x) { return { id: x.ID_PERIODO, codigo: x.CODIGO, nombre: x.NOMBRE }; }).sort(function (a, b) { return a.codigo.localeCompare(b.codigo); });
  r.asignaturas = asignaturasVisibles_(ctx, ano, sec).map(function (a) { return { id: a.ID_ASIGNATURA, nombre: a.NOMBRE }; });
  r.tipos = TIPOS_OBSERVACION; r.puedeRegistrar = tiene_(ctx, 'observaciones.registrar');
  return r;
}

/** p = { id?, ano, idSeccion, idEstudiante, tipo, fecha, texto, idAsignatura?, idPeriodo? } */
function guardarObservacion_(ctx, p) {
  const nuevo = !p.id;
  exigirPermiso_(ctx, nuevo ? 'observaciones.registrar' : 'observaciones.editar');
  const ano = p.ano || config_().ANO_ESCOLAR, sec = exigirSeccion_(ctx, ano, p.idSeccion);
  const texto = texto_(p.texto, 'la observación', { req: true, min: 3, max: 600 });
  const tipo = enum_(String(p.tipo || ''), TIPOS_OBSERVACION, 'El tipo de observación');
  const fecha = limpiar_(p.fecha) || ahora_().slice(0, 10);
  exigir_(/^\d{4}-\d{2}-\d{2}$/.test(fecha) && !isNaN(new Date(fecha + 'T00:00:00Z').getTime()), 'La fecha no es válida.');
  const idAsig = limpiar_(p.idAsignatura), idPer = limpiar_(p.idPeriodo);
  if (idAsig) exigir_(asignaturasDeGrado_(sec.grado).some(function (a) { return a.ID_ASIGNATURA === idAsig; }), 'La asignatura no corresponde a este curso.');
  if (idPer) exigir_(!!periodosAno_(ano).porId[idPer], 'El período no corresponde al año escolar.');
  return conBloqueo_(function () {
    const ahora = ahora_();
    if (nuevo) {
      exigir_(estudiantesDeSeccion_(ano, sec.idSeccion, false).some(function (e) { return e.idEstudiante === p.idEstudiante; }), 'El estudiante no está inscrito (activo) en este curso.');
      const t = tabla_(HOJA.OBSERVACIONES), id = generadorId_(HOJA.OBSERVACIONES)();
      agregarFilas_(t, [filaDe_(t, { ID_OBSERVACION: id, ANO_ESCOLAR: ano, ID_ESTUDIANTE: p.idEstudiante, ID_CURSO: sec.idCurso, ID_SECCION: sec.idSeccion, ID_DOCENTE: ctx.idDocente || '', ID_ASIGNATURA: idAsig, ID_PERIODO: idPer,
        TIPO: tipo, FECHA: fecha, OBSERVACION: texto, ESTADO: 'ACTIVA', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora, CREADO_POR: ctx.usuario })]);
      invalidar_(HOJA.OBSERVACIONES);
      historial_(ctx.usuario, 'CREAR', 'OBSERVACIONES', id, tipo + ' · ' + p.idEstudiante, '', texto.slice(0, 120)); vaciarHistorial_();
      return { id: id };
    }
    const t = leerPorClave_(HOJA.OBSERVACIONES, 'ID_OBSERVACION', p.id), o = objetosGrupo_(t)[0];
    exigir_(o && o.ID_SECCION === sec.idSeccion && String(o.ANO_ESCOLAR) === String(ano), 'La observación no existe.');
    exigir_(puedeEditarObs_(ctx, o), 'Solo el autor de la observación (o un administrador) puede modificarla.', 'PERMISO');
    exigir_(o.ESTADO !== 'ANULADA', 'La observación está anulada.');
    const antes = o.OBSERVACION;
    Object.assign(o, { ID_ASIGNATURA: idAsig, ID_PERIODO: idPer, TIPO: tipo, FECHA: fecha, OBSERVACION: texto, FECHA_MODIFICACION: ahora });
    escribirFilas_(t, { [o._fila]: filaDe_(t, o) });
    historial_(ctx.usuario, 'EDITAR', 'OBSERVACIONES', p.id, tipo + ' · ' + o.ID_ESTUDIANTE, String(antes).slice(0, 120), texto.slice(0, 120)); vaciarHistorial_();
    return { id: p.id };
  });
}
/** Anula o restaura una observación. p = { id, estado: 'ANULADA' | 'ACTIVA' } */
function estadoObservacion_(ctx, p) {
  exigirPermiso_(ctx, 'observaciones.editar');
  exigir_(['ANULADA', 'ACTIVA'].indexOf(p.estado) >= 0, 'Estado no válido.');
  return conBloqueo_(function () {
    const t = leerPorClave_(HOJA.OBSERVACIONES, 'ID_OBSERVACION', p.id), o = objetosGrupo_(t)[0];
    exigir_(o, 'La observación no existe.');
    exigirSeccion_(ctx, String(o.ANO_ESCOLAR), o.ID_SECCION);
    exigir_(puedeEditarObs_(ctx, o), 'Solo el autor de la observación (o un administrador) puede anularla.', 'PERMISO');
    const antes = o.ESTADO; o.ESTADO = p.estado; o.FECHA_MODIFICACION = ahora_();
    escribirFilas_(t, { [o._fila]: filaDe_(t, o) });
    historial_(ctx.usuario, 'ESTADO', 'OBSERVACIONES', p.id, 'Observación ' + antes + ' → ' + p.estado, antes, p.estado); vaciarHistorial_();
    return true;
  });
}
