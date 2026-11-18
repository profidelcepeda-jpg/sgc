/*********************************************************************
 * Students.gs — Estudiantes e inscripciones (curso/sección por año escolar)
 * El estudiante tiene un ID permanente (EST-000001); el curso y año viven en INSCRIPCIONES,
 * así el mismo estudiante pasa de año sin duplicarse y conserva su historial.
 *********************************************************************/

/** Estudiantes inscritos en la sección, ordenados por número de lista. */
function estudiantesDeSeccion_(ano, idSeccion, incluirRetirados) {
  const est = {}; todos_(HOJA.ESTUDIANTES).forEach(function (e) { est[e.ID_ESTUDIANTE] = e; });
  const lista = [];
  todos_(HOJA.INSCRIPCIONES).forEach(function (i) {
    if (String(i.ANO_ESCOLAR) !== String(ano) || i.ID_SECCION !== idSeccion) return;
    const e = est[i.ID_ESTUDIANTE]; if (!e) return;
    const activo = i.ESTADO !== 'RETIRADO' && e.ESTADO !== 'INACTIVO';
    if (!activo && !incluirRetirados) return;
    lista.push({ idEstudiante: e.ID_ESTUDIANTE, num: num_(i.NUM_LISTA) || 0, nombre: e.NOMBRE_COMPLETO, nombres: e.NOMBRES || '', apellidos: e.APELLIDOS || '', matricula: e.MATRICULA, activo: activo, sexo: e.SEXO });
  });
  lista.sort(function (a, b) { return (a.num || 999) - (b.num || 999) || a.nombre.localeCompare(b.nombre); });
  return lista;
}
function partirNombre_(full) {
  const i = full.indexOf(',');
  return i > 0 ? { ap: limpiar_(full.slice(0, i)), no: limpiar_(full.slice(i + 1)) } : { ap: '', no: '' };
}
/** Crea estudiantes e inscripciones en lote (dentro de un bloqueo). Devuelve los IDs creados. */
function crearEstudiantes_(ctx, ano, sec, items) {
  const te = tabla_(HOJA.ESTUDIANTES), ti = tabla_(HOJA.INSCRIPCIONES), ahora = ahora_();
  const idE = generadorId_(HOJA.ESTUDIANTES), idI = generadorId_(HOJA.INSCRIPCIONES);
  let num = estudiantesDeSeccion_(ano, sec.idSeccion, true).reduce(function (m, x) { return Math.max(m, x.num); }, 0);
  const fe = [], fi = [], ids = [];
  items.forEach(function (it) {
    const id = idE(), pn = partirNombre_(it.nombre); num++;
    fe.push(filaDe_(te, { ID_ESTUDIANTE: id, MATRICULA: it.matricula || '', NOMBRES: pn.no, APELLIDOS: pn.ap, NOMBRE_COMPLETO: it.nombre, SEXO: it.sexo || '', FECHA_NACIMIENTO: it.fechaNacimiento || '', ESTADO: 'ACTIVO', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora }));
    fi.push(filaDe_(ti, { ID_INSCRIPCION: idI(), ANO_ESCOLAR: ano, ID_ESTUDIANTE: id, ID_CURSO: sec.idCurso, ID_SECCION: sec.idSeccion, NUM_LISTA: num, ESTADO: 'ACTIVO', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora }));
    historial_(ctx.usuario, 'CREAR', 'ESTUDIANTES', id, it.nombre + ' → ' + etiquetaSeccion_(sec) + ' (' + ano + ')');
    ids.push(id);
  });
  agregarFilas_(te, fe); agregarFilas_(ti, fi);
  invalidar_(HOJA.ESTUDIANTES); invalidar_(HOJA.INSCRIPCIONES);
  return ids;
}
function nombreEstudiante_(v) { const s = limpiar_(String(v || '').replace(/^["'\s]+|["'\s]+$/g, '').replace(/^\d+\s*[.\-)]\s*/, '')); return s; }

function listarEstudiantes_(ctx, p) {
  exigirPermiso_(ctx, 'estudiantes.ver');
  const ano = p.ano || config_().ANO_ESCOLAR, sec = exigirSeccion_(ctx, ano, p.idSeccion);
  return estudiantesDeSeccion_(ano, sec.idSeccion, true);
}
function guardarEstudiante_(ctx, p) {
  const ano = p.ano || config_().ANO_ESCOLAR, edita = !!p.idEstudiante;
  exigirPermiso_(ctx, edita ? 'estudiantes.editar' : 'estudiantes.crear');
  const sec = exigirSeccion_(ctx, ano, p.idSeccion);
  const nombre = nombreEstudiante_(p.nombre);
  exigir_(nombre.length >= 3 && nombre.length <= 120, 'Escriba el nombre completo del estudiante.');
  const mat = texto_(p.matricula, 'la matrícula', { max: 30 }), sexo = limpiar_(p.sexo).toUpperCase();
  exigir_(!sexo || ['M', 'F'].indexOf(sexo) >= 0, 'El sexo debe ser M o F.');
  return conBloqueo_(function () {
    const te = tabla_(HOJA.ESTUDIANTES);
    if (edita) {
      const i = te.rows.findIndex(function (r) { return r[0] === p.idEstudiante; });
      exigir_(i >= 0, 'El estudiante no existe.');
      exigir_(estudiantesDeSeccion_(ano, sec.idSeccion, true).some(function (e) { return e.idEstudiante === p.idEstudiante; }), 'El estudiante no pertenece a este curso.', 'PERMISO');
      const f = te.rows[i].slice(), antes = f[te.idx.NOMBRE_COMPLETO], pn = partirNombre_(nombre);
      f[te.idx.NOMBRE_COMPLETO] = nombre; f[te.idx.NOMBRES] = pn.no; f[te.idx.APELLIDOS] = pn.ap; f[te.idx.MATRICULA] = mat; f[te.idx.SEXO] = sexo; f[te.idx.FECHA_MODIFICACION] = ahora_();
      escribirFilas_(te, { [i + 2]: f }); invalidar_(HOJA.ESTUDIANTES);
      historial_(ctx.usuario, 'EDITAR', 'ESTUDIANTES', p.idEstudiante, 'Estudiante editado', antes, nombre); vaciarHistorial_();
      return { idEstudiante: p.idEstudiante };
    }
    const dupMismo = estudiantesDeSeccion_(ano, sec.idSeccion, true).some(function (e) { return norm_(e.nombre) === norm_(nombre); });
    exigir_(!dupMismo, 'Ya existe un estudiante con ese nombre en este curso.', 'DUPLICADO');
    const dupOtro = todos_(HOJA.ESTUDIANTES).some(function (e) { return norm_(e.NOMBRE_COMPLETO) === norm_(nombre); });
    exigir_(!dupOtro || p.confirmarDuplicado, 'Ya existe un estudiante con ese nombre en otro curso. Verifique antes de crearlo.', 'DUPLICADO');
    const ids = crearEstudiantes_(ctx, ano, sec, [{ nombre: nombre, matricula: mat, sexo: sexo }]);
    vaciarHistorial_();
    return { idEstudiante: ids[0] };
  });
}
/** Retira o reactiva la inscripción (nunca se borra: se conserva el historial). */
function estadoEstudiante_(ctx, p) {
  exigirPermiso_(ctx, 'estudiantes.editar');
  const ano = p.ano || config_().ANO_ESCOLAR, estado = p.activo ? 'ACTIVO' : 'RETIRADO';
  return conBloqueo_(function () {
    const ti = tabla_(HOJA.INSCRIPCIONES);
    const i = ti.rows.findIndex(function (r) { return r[ti.idx.ID_ESTUDIANTE] === p.idEstudiante && String(r[ti.idx.ANO_ESCOLAR]) === String(ano); });
    exigir_(i >= 0, 'El estudiante no está inscrito en ese año escolar.');
    exigirSeccion_(ctx, ano, ti.rows[i][ti.idx.ID_SECCION]);
    const f = ti.rows[i].slice(), antes = f[ti.idx.ESTADO]; f[ti.idx.ESTADO] = estado; f[ti.idx.FECHA_MODIFICACION] = ahora_();
    escribirFilas_(ti, { [i + 2]: f }); invalidar_(HOJA.INSCRIPCIONES);
    historial_(ctx.usuario, 'ESTADO', 'ESTUDIANTES', p.idEstudiante, 'Inscripción ' + ano + ': ' + antes + ' → ' + estado, antes, estado); vaciarHistorial_();
    return true;
  });
}
/** Importa una lista pegada (un nombre por línea). Omite los nombres que ya están en la sección. */
function importarEstudiantes_(ctx, p) {
  exigirPermiso_(ctx, 'estudiantes.crear');
  const ano = p.ano || config_().ANO_ESCOLAR, sec = exigirSeccion_(ctx, ano, p.idSeccion);
  const nombres = String(p.texto || '').split(/\r?\n/).map(nombreEstudiante_).filter(function (s) { return s.length > 2 && s.length <= 120; });
  exigir_(nombres.length > 0, 'Pegue al menos un nombre.');
  exigir_(nombres.length <= 300, 'Importe máximo 300 nombres por vez.');
  return conBloqueo_(function () {
    const ya = {}; estudiantesDeSeccion_(ano, sec.idSeccion, true).forEach(function (e) { ya[norm_(e.nombre)] = true; });
    const nuevos = [], omitidos = [];
    nombres.forEach(function (n) { if (ya[norm_(n)]) omitidos.push(n); else { ya[norm_(n)] = true; nuevos.push({ nombre: n }); } });
    crearEstudiantes_(ctx, ano, sec, nuevos); vaciarHistorial_();
    return { creados: nuevos.length, omitidos: omitidos };
  });
}
/** Sincroniza con el libro REGISTRO (hoja "registro", nombres desde la fila 17). No elimina ni modifica nada. */
function sincronizarRegistro_(ctx, p) {
  exigirPermiso_(ctx, 'configuracion.administrar');
  const cfg = config_(), id = cfg.REGISTRO_SPREADSHEET_ID;
  exigir_(id, 'Escriba el ID del libro REGISTRO en Configuración (REGISTRO_SPREADSHEET_ID).');
  const sh = SpreadsheetApp.openById(id).getSheetByName('registro');
  exigir_(sh, 'El libro indicado no tiene la hoja "registro".');
  const vals = sh.getRange(17, 2, Math.max(sh.getLastRow() - 16, 1), 2).getValues();
  const nombres = vals.map(function (r) { return limpiar_(String(r[0]).trim() + ' ' + String(r[1]).trim()); }).filter(function (s) { return s.length > 2; });
  const ano = p.ano || cfg.ANO_ESCOLAR, actuales = estudiantesDeSeccion_(ano, p.idSeccion, true), setReg = {};
  nombres.forEach(function (n) { setReg[norm_(n)] = true; });
  const faltantes = actuales.filter(function (e) { return e.activo && !setReg[norm_(e.nombre)]; }).map(function (e) { return e.nombre; });
  const r = importarEstudiantes_(ctx, { ano: ano, idSeccion: p.idSeccion, texto: nombres.join('\n') });
  return { nuevos: r.creados, yaExistian: r.omitidos.length, noEstanEnRegistro: faltantes };
}
/** Búsqueda por nombre o matrícula, limitada a los cursos que el usuario puede ver. */
function buscarEstudiantes_(ctx, q, ano) {
  exigirPermiso_(ctx, 'estudiantes.ver');
  const a = ano || config_().ANO_ESCOLAR, nq = norm_(q), permitidas = {};
  seccionesPermitidas_(ctx, a).forEach(function (s) { permitidas[s.idSeccion] = s; });
  const est = {}; todos_(HOJA.ESTUDIANTES).forEach(function (e) { est[e.ID_ESTUDIANTE] = e; });
  const out = [];
  todos_(HOJA.INSCRIPCIONES).forEach(function (i) {
    if (String(i.ANO_ESCOLAR) !== String(a) || !permitidas[i.ID_SECCION] || out.length >= 40) return;
    const e = est[i.ID_ESTUDIANTE]; if (!e) return;
    if (nq && norm_(e.NOMBRE_COMPLETO).indexOf(nq) < 0 && String(e.MATRICULA).toLowerCase() !== nq) return;
    const s = permitidas[i.ID_SECCION];
    out.push({ idEstudiante: e.ID_ESTUDIANTE, nombre: e.NOMBRE_COMPLETO, matricula: e.MATRICULA, grado: s.grado, seccion: s.seccion, estado: i.ESTADO });
  });
  return out;
}
/** Inscribe a un estudiante existente en una sección de un año (ej. al pasar de año). Si ya está inscrito y no tiene notas, lo cambia de sección. */
function asignarEstudiante_(ctx, p) {
  exigirPermiso_(ctx, 'estudiantes.editar');
  const ano = p.ano || config_().ANO_ESCOLAR, sec = exigirSeccion_(ctx, ano, p.idSeccion);
  return conBloqueo_(function () {
    const e = porId_(HOJA.ESTUDIANTES, p.idEstudiante); exigir_(e, 'El estudiante no existe.');
    const ti = tabla_(HOJA.INSCRIPCIONES), ahora = ahora_();
    const i = ti.rows.findIndex(function (r) { return r[ti.idx.ID_ESTUDIANTE] === p.idEstudiante && String(r[ti.idx.ANO_ESCOLAR]) === String(ano); });
    const num = estudiantesDeSeccion_(ano, sec.idSeccion, true).reduce(function (m, x) { return Math.max(m, x.num); }, 0) + 1;
    if (i < 0) {
      agregarFilas_(ti, [filaDe_(ti, { ID_INSCRIPCION: generadorId_(HOJA.INSCRIPCIONES)(), ANO_ESCOLAR: ano, ID_ESTUDIANTE: p.idEstudiante, ID_CURSO: sec.idCurso, ID_SECCION: sec.idSeccion, NUM_LISTA: num, ESTADO: 'ACTIVO', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora })]);
    } else {
      const f = ti.rows[i].slice(), antigua = f[ti.idx.ID_SECCION];
      exigir_(antigua !== sec.idSeccion, 'El estudiante ya está en ese curso.');
      const tieneNotas = objetosGrupo_(leerPorClave_(HOJA.CALIFICACIONES, 'CLAVE_GRUPO', ano + '|' + antigua + '|', 'prefijo')).some(function (o) { return o.ID_ESTUDIANTE === p.idEstudiante; });
      exigir_(!tieneNotas, 'El estudiante ya tiene calificaciones en su curso actual; no se puede cambiar de sección sin perder la relación con sus notas.');
      f[ti.idx.ID_CURSO] = sec.idCurso; f[ti.idx.ID_SECCION] = sec.idSeccion; f[ti.idx.NUM_LISTA] = num; f[ti.idx.FECHA_MODIFICACION] = ahora;
      escribirFilas_(ti, { [i + 2]: f });
    }
    invalidar_(HOJA.INSCRIPCIONES);
    historial_(ctx.usuario, 'ASIGNAR', 'ESTUDIANTES', p.idEstudiante, e.NOMBRE_COMPLETO + ' → ' + etiquetaSeccion_(sec) + ' (' + ano + ')'); vaciarHistorial_();
    return true;
  });
}
