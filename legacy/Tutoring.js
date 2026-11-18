/*********************************************************************
 * Tutoring.gs — Tutorías. El tutor da información del curso; cada docente
 * sigue siendo responsable solo de SUS asignaturas (ver Assignments.gs).
 *********************************************************************/

function tutorDe_(ano, idSeccion) {
  const t = todos_(HOJA.TUTORIAS).filter(function (x) { return String(x.ANO_ESCOLAR) === String(ano) && x.ID_SECCION === idSeccion && x.ESTADO === 'ACTIVA'; })[0];
  return t ? porId_(HOJA.DOCENTES, t.ID_DOCENTE) : null;
}
/** Asigna o cambia el tutor de una sección (úselo dentro de un bloqueo). */
function asignarTutor_(ctx, ano, sec, idDocente) {
  const t = tabla_(HOJA.TUTORIAS), ahora = ahora_();
  const i = t.rows.findIndex(function (r) { return String(r[t.idx.ANO_ESCOLAR]) === String(ano) && r[t.idx.ID_SECCION] === sec.idSeccion && r[t.idx.ESTADO] === 'ACTIVA'; });
  if (i >= 0) {
    if (t.rows[i][t.idx.ID_DOCENTE] === idDocente) return;
    const f = t.rows[i].slice(); f[t.idx.ID_DOCENTE] = idDocente; f[t.idx.FECHA_MODIFICACION] = ahora; escribirFilas_(t, { [i + 2]: f });
  } else {
    agregarFilas_(t, [filaDe_(t, { ID_TUTORIA: generadorId_(HOJA.TUTORIAS)(), ANO_ESCOLAR: ano, ID_DOCENTE: idDocente, ID_CURSO: sec.idCurso, ID_SECCION: sec.idSeccion, ESTADO: 'ACTIVA', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora })]);
  }
  invalidar_(HOJA.TUTORIAS);
  historial_(ctx.usuario, 'TUTORIA', 'TUTORIAS', sec.idSeccion, 'Tutor de ' + etiquetaSeccion_(sec) + ' (' + ano + ') asignado: ' + idDocente);
}
function defTutorias_() {
  return {
    titulo: 'Tutorías', singular: 'Tutoría', hoja: HOJA.TUTORIAS, etiqueta: 'ID_SECCION', conAno: true, estados: ['ACTIVA', 'INACTIVA'],
    permisos: { ver: 'tutorias.ver', crear: 'tutorias.crear', editar: 'tutorias.editar' },
    columnas: [['ANO_ESCOLAR', 'Año'], ['CURSO_TXT', 'Curso'], ['DOCENTE_TXT', 'Docente tutor'], ['ESTADO', 'Estado']],
    campos: [
      { k: 'ANO_ESCOLAR', et: 'Año escolar (AAAA-AAAA)', tipo: 'patron', patron: '^\\d{4}-\\d{4}$', req: true, soloCrear: true },
      { k: 'ID_SECCION', et: 'Curso y sección', tipo: 'ref', ref: 'secciones', req: true, soloCrear: true },
      { k: 'ID_DOCENTE', et: 'Docente tutor', tipo: 'ref', ref: 'docentes', req: true }
    ],
    buscar: ['CURSO_TXT', 'DOCENTE_TXT'], filtros: [{ k: 'ESTADO', et: 'Estado', opciones: ['ACTIVA', 'INACTIVA'] }],
    ayuda: 'El tutor solo recibe información del curso. Para cambiar de tutor, edite la tutoría y elija otro docente.',
    decorar: function (items) {
      const docs = {}; todos_(HOJA.DOCENTES).forEach(function (x) { docs[x.ID_DOCENTE] = nombreDocente_(x); });
      const secs = {}; seccionesIndice_().forEach(function (s) { secs[s.idSeccion] = etiquetaSeccion_(s); });
      return items.map(function (x) { x.DOCENTE_TXT = docs[x.ID_DOCENTE] || ''; x.CURSO_TXT = secs[x.ID_SECCION] || ''; return x; });
    },
    antes: function (o, ctx, nuevo, previo) {
      const x = Object.assign({}, previo || {}, o), sec = seccionPorId_(x.ID_SECCION);
      o.ID_CURSO = sec.idCurso;
      if (nuevo) { o.ESTADO = 'ACTIVA'; }
      exigir_(String(sec.ano) === String(x.ANO_ESCOLAR), 'La sección no corresponde al año escolar indicado.');
      if (nuevo) exigir_(!todos_(HOJA.TUTORIAS).some(function (t) { return String(t.ANO_ESCOLAR) === String(x.ANO_ESCOLAR) && t.ID_SECCION === x.ID_SECCION && t.ESTADO === 'ACTIVA'; }), 'Esa sección ya tiene un tutor activo. Edite la tutoría existente para cambiarlo.');
    }
  };
}
