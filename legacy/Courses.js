/*********************************************************************
 * Courses.gs — Años escolares, cursos, secciones y períodos académicos
 *   CURSO   = nivel + grado dentro de un año escolar (ej. 2026-2027 · Secundaria · 3ro)
 *   SECCIÓN = letra dentro del curso (ej. A)  → los estudiantes y las notas se relacionan con la SECCIÓN
 *********************************************************************/

function ordenGrado_(g) {
  const l = String(config_().GRADOS).split(',').map(function (x) { return x.trim(); });
  const i = l.indexOf(String(g));
  return i < 0 ? 99 : i;
}
/** Índice de todas las secciones con los datos de su curso (se arma una vez por ejecución). */
function seccionesIndice_() {
  if (_mem.__sec) return _mem.__sec;
  const cur = {};
  todos_(HOJA.CURSOS).forEach(function (c) { cur[c.ID_CURSO] = c; });
  const lista = [];
  todos_(HOJA.SECCIONES).forEach(function (s) {
    const c = cur[s.ID_CURSO]; if (!c) return;
    lista.push({ idSeccion: s.ID_SECCION, idCurso: s.ID_CURSO, grado: String(c.GRADO), seccion: String(s.SECCION), ano: String(c.ANO_ESCOLAR), nivel: c.NIVEL,
      estado: (c.ESTADO === 'INACTIVO' || s.ESTADO === 'INACTIVO') ? 'INACTIVO' : 'ACTIVO' });
  });
  lista.sort(function (a, b) { return ordenGrado_(a.grado) - ordenGrado_(b.grado) || a.seccion.localeCompare(b.seccion); });
  _mem.__sec = lista;
  return lista;
}
function seccionesDeAno_(ano) { return seccionesIndice_().filter(function (s) { return s.ano === String(ano); }); }
function seccionPorId_(id) {
  const s = seccionesIndice_().filter(function (x) { return x.idSeccion === id; })[0];
  if (!s) throw new ErrorApp('El curso o sección indicado no existe.');
  return s;
}
function etiquetaSeccion_(s) { return s.grado + ' ' + s.seccion; }

/* ---------------- Períodos académicos ---------------- */
/** Períodos de un año: regulares ordenados (P1..P4) y etapas finales por tipo. */
function periodosAno_(ano) {
  const lista = todos_(HOJA.PERIODOS).filter(function (p) { return String(p.ANO_ESCOLAR) === String(ano); });
  const regulares = lista.filter(function (p) { return p.TIPO === 'REGULAR'; }).sort(function (a, b) { return a.ORDEN - b.ORDEN; });
  const etapas = {}, porId = {};
  lista.forEach(function (p) { porId[p.ID_PERIODO] = p; if (p.TIPO === 'ETAPA') etapas[p.ETAPA] = p; });
  return { regulares: regulares, etapas: etapas, porId: porId, lista: lista };
}
function defPeriodos_() {
  return {
    titulo: 'Períodos académicos', singular: 'Período', hoja: HOJA.PERIODOS, etiqueta: 'CODIGO', conAno: true, estados: ['ABIERTO', 'CERRADO'],
    permisos: { ver: 'periodos.ver', crear: 'periodos.administrar', editar: 'periodos.administrar', estado: 'calificaciones.cerrar' },
    columnas: [['ANO_ESCOLAR', 'Año'], ['CODIGO', 'Código'], ['NOMBRE', 'Nombre'], ['TIPO', 'Tipo'], ['ETAPA', 'Etapa final'], ['ORDEN', 'Orden'], ['MESES', 'Meses (asistencia)'], ['ESTADO', 'Estado']],
    campos: [
      { k: 'ANO_ESCOLAR', et: 'Año escolar (AAAA-AAAA)', tipo: 'patron', patron: '^\\d{4}-\\d{4}$', req: true, soloCrear: true, defecto: '' },
      { k: 'CODIGO', et: 'Código (ej. P1)', tipo: 'texto', req: true, max: 10 }, { k: 'NOMBRE', et: 'Nombre', tipo: 'texto', req: true, max: 60 },
      { k: 'TIPO', et: 'Tipo', tipo: 'enum', opciones: ['REGULAR', 'ETAPA'], req: true },
      { k: 'ETAPA', et: 'Etapa final (solo si el tipo es ETAPA)', tipo: 'enum', opciones: ['COMPLETIVA', 'EXTRAORDINARIA', 'ESPECIAL'] },
      { k: 'ORDEN', et: 'Orden', tipo: 'num', req: true, min: 1, max: 99 }, { k: 'MESES', et: 'Meses de asistencia (ago,sep,oct)', tipo: 'texto', max: 60 }
    ],
    buscar: ['CODIGO', 'NOMBRE'], filtros: [{ k: 'ESTADO', et: 'Estado', opciones: ['ABIERTO', 'CERRADO'] }],
    acciones: [{ id: 'duplicar', et: 'Copiar períodos a otro año', permiso: 'periodos.administrar', global: true }],
    ayuda: 'Cierre un período para impedir cambios en sus calificaciones (solo quien tiene el permiso "cerrar" puede modificarlo después). Los 4 períodos REGULARES y las 3 etapas finales alimentan el cálculo de notas.',
    decorar: function (items) { return items.sort(function (a, b) { return String(b.ANO_ESCOLAR).localeCompare(String(a.ANO_ESCOLAR)) || a.ORDEN - b.ORDEN; }); },
    antes: function (o, ctx, nuevo, previo) {
      const x = Object.assign({}, previo || {}, o);
      if (x.TIPO === 'ETAPA') exigir_(x.ETAPA, 'Indique la etapa final (completiva, extraordinaria o especial).');
      else o.ETAPA = '';
      const meses = String(x.MESES || '').split(',').map(function (m) { return m.trim(); }).filter(Boolean);
      meses.forEach(function (m) { exigir_(SGA.MESES.indexOf(m) >= 0, 'Mes no válido: ' + m + '. Use: ' + SGA.MESES.join(', ') + '.'); });
      o.MESES = meses.join(',');
      const otros = todos_(HOJA.PERIODOS).filter(function (p) { return String(p.ANO_ESCOLAR) === String(x.ANO_ESCOLAR) && (!previo || p.ID_PERIODO !== previo.ID_PERIODO); });
      if (x.TIPO === 'REGULAR') exigir_(otros.filter(function (p) { return p.TIPO === 'REGULAR'; }).length < SGA.PERIODOS_REGULARES, 'Un año escolar tiene como máximo ' + SGA.PERIODOS_REGULARES + ' períodos regulares.');
      else exigir_(!otros.some(function (p) { return p.ETAPA === x.ETAPA; }), 'Ya existe esa etapa final en el año escolar.');
    },
    unico: [['ANO_ESCOLAR', 'CODIGO']], msgUnico: 'Ya existe un período con ese código en el año escolar.'
  };
}
/** Copia los períodos de un año a otro (para iniciar un nuevo año escolar). */
function duplicarPeriodos_(ctx, p) {
  exigirPermiso_(ctx, 'periodos.administrar');
  const o = texto_(p.origen, 'el año de origen', { req: true }), d = texto_(p.destino, 'el año de destino', { req: true });
  exigir_(/^\d{4}-\d{4}$/.test(d), 'El año de destino debe tener el formato AAAA-AAAA.');
  return conBloqueo_(function () {
    const src = periodosAno_(o).lista;
    exigir_(src.length, 'El año de origen no tiene períodos.');
    exigir_(!periodosAno_(d).lista.length, 'El año de destino ya tiene períodos.');
    const t = tabla_(HOJA.PERIODOS), nuevoId = generadorId_(HOJA.PERIODOS), ahora = ahora_();
    agregarFilas_(t, src.map(function (x) { return filaDe_(t, { ID_PERIODO: nuevoId(), ANO_ESCOLAR: d, CODIGO: x.CODIGO, NOMBRE: x.NOMBRE, TIPO: x.TIPO, ETAPA: x.ETAPA, ORDEN: x.ORDEN, MESES: x.MESES, ESTADO: 'ABIERTO', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora }); }));
    invalidar_(HOJA.PERIODOS);
    historial_(ctx.usuario, 'CREAR', 'PERIODOS', d, 'Períodos copiados de ' + o + ' a ' + d); vaciarHistorial_();
    return { creados: src.length };
  });
}

/* ---------------- Cursos y secciones (módulo "cursos") ---------------- */
function defCursos_() {
  return {
    titulo: 'Cursos y secciones', singular: 'Curso/sección', hoja: HOJA.SECCIONES, idKey: 'ID_SECCION', conAno: true,
    permisos: { ver: 'cursos.ver', crear: 'cursos.crear', editar: 'cursos.editar' },
    columnas: [['ANO_ESCOLAR', 'Año'], ['GRADO', 'Grado'], ['SECCION', 'Sección'], ['TUTOR_TXT', 'Docente tutor'], ['ESTUDIANTES', 'Estudiantes'], ['ESTADO', 'Estado']],
    campos: [
      { k: 'ANO_ESCOLAR', et: 'Año escolar (AAAA-AAAA)', tipo: 'patron', patron: '^\\d{4}-\\d{4}$', req: true, soloCrear: true },
      { k: 'GRADO', et: 'Grado', tipo: 'ref', ref: 'grados', req: true, soloCrear: true },
      { k: 'SECCION', et: 'Sección (ej. A)', tipo: 'patron', patron: '^[A-Z0-9]{1,3}$', req: true },
      { k: 'ID_DOCENTE_TUTOR', et: 'Docente tutor (opcional)', tipo: 'ref', ref: 'docentes' }
    ],
    buscar: ['GRADO', 'SECCION', 'TUTOR_TXT'], filtros: [{ k: 'ESTADO', et: 'Estado', opciones: ['ACTIVO', 'INACTIVO'] }],
    ayuda: 'Un curso es el grado dentro de un año escolar; la sección es la letra. Las calificaciones y estudiantes se relacionan con la sección.',
    listar: function (ctx, p) {
      const ano = p.ano || config_().ANO_ESCOLAR;
      const permitidas = {}; seccionesPermitidas_(ctx, ano).forEach(function (s) { permitidas[s.idSeccion] = true; });
      const cuenta = {}; todos_(HOJA.INSCRIPCIONES).forEach(function (i) { if (i.ESTADO !== 'RETIRADO') cuenta[i.ID_SECCION] = (cuenta[i.ID_SECCION] || 0) + 1; });
      const items = seccionesIndice_().filter(function (s) { return s.ano === String(ano) && permitidas[s.idSeccion]; }).map(function (s) {
        const tu = tutorDe_(ano, s.idSeccion);
        return { ID_SECCION: s.idSeccion, ID_CURSO: s.idCurso, ANO_ESCOLAR: s.ano, GRADO: s.grado, SECCION: s.seccion, TUTOR_TXT: tu ? nombreDocente_(tu) : '', ID_DOCENTE_TUTOR: tu ? tu.ID_DOCENTE : '', ESTUDIANTES: cuenta[s.idSeccion] || 0, ESTADO: s.estado };
      });
      return paginar_(items, p, ['GRADO', 'SECCION', 'TUTOR_TXT']);
    },
    guardar: function (ctx, p) { return guardarCurso_(ctx, p); },
    estado: function (ctx, p) {
      return conBloqueo_(function () {
        const t = tabla_(HOJA.SECCIONES), i = t.rows.findIndex(function (r) { return r[0] === p.id; });
        exigir_(i >= 0, 'La sección no existe.'); exigir_(['ACTIVO', 'INACTIVO'].indexOf(p.estado) >= 0, 'Estado no válido.');
        const f = t.rows[i].slice(); f[t.idx.ESTADO] = p.estado; f[t.idx.FECHA_MODIFICACION] = ahora_();
        escribirFilas_(t, { [i + 2]: f }); invalidar_(HOJA.SECCIONES); invalidar_('__sec');
        historial_(ctx.usuario, 'ESTADO', 'SECCIONES', p.id, 'Sección ' + p.estado); vaciarHistorial_();
        return true;
      });
    }
  };
}
function guardarCurso_(ctx, p) {
  const d = defCursos_(), nuevo = !p.id, e = p.datos || {};
  return conBloqueo_(function () {
    const tc = tabla_(HOJA.CURSOS), ts = tabla_(HOJA.SECCIONES), ahora = ahora_();
    let sec = null;
    if (!nuevo) { sec = seccionesIndice_().filter(function (s) { return s.idSeccion === p.id; })[0]; exigir_(sec, 'La sección no existe.'); }
    const o = crudValidar_(d, e, sec, ctx);
    const ano = nuevo ? o.ANO_ESCOLAR : sec.ano, grado = nuevo ? o.GRADO : sec.grado;
    exigir_(!seccionesIndice_().some(function (s) { return s.ano === ano && s.grado === grado && s.seccion === o.SECCION && (!sec || s.idSeccion !== sec.idSeccion); }), 'Ya existe la sección ' + grado + ' ' + o.SECCION + ' en ' + ano + '.');
    let idSeccion = p.id;
    if (nuevo) {
      let curso = todos_(HOJA.CURSOS).filter(function (c) { return String(c.ANO_ESCOLAR) === ano && String(c.GRADO) === grado; })[0], idCurso;
      if (curso) idCurso = curso.ID_CURSO;
      else { idCurso = generadorId_(HOJA.CURSOS)(); agregarFilas_(tc, [filaDe_(tc, { ID_CURSO: idCurso, ANO_ESCOLAR: ano, NIVEL: config_().NIVEL, GRADO: grado, ESTADO: 'ACTIVO', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora })]); }
      idSeccion = generadorId_(HOJA.SECCIONES)();
      agregarFilas_(ts, [filaDe_(ts, { ID_SECCION: idSeccion, ID_CURSO: idCurso, SECCION: o.SECCION, ESTADO: 'ACTIVO', FECHA_CREACION: ahora, FECHA_MODIFICACION: ahora })]);
    } else {
      const i = ts.rows.findIndex(function (r) { return r[0] === p.id; }), f = ts.rows[i].slice();
      f[ts.idx.SECCION] = o.SECCION; f[ts.idx.FECHA_MODIFICACION] = ahora; escribirFilas_(ts, { [i + 2]: f });
    }
    invalidar_(HOJA.CURSOS); invalidar_(HOJA.SECCIONES); invalidar_('__sec');
    if (o.ID_DOCENTE_TUTOR !== undefined && o.ID_DOCENTE_TUTOR !== '') asignarTutor_(ctx, ano, seccionPorId_(idSeccion), o.ID_DOCENTE_TUTOR);
    historial_(ctx.usuario, nuevo ? 'CREAR' : 'EDITAR', 'SECCIONES', idSeccion, 'Curso ' + grado + ' ' + o.SECCION + ' (' + ano + ')'); vaciarHistorial_();
    return { id: idSeccion };
  });
}
