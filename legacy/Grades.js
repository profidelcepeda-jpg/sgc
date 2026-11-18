/*********************************************************************
 * Grades.gs — Calificaciones y asistencia
 *   CALIFICACIONES: una fila por ESTUDIANTE + ASIGNATURA + PERÍODO (C1..C4 = notas, R1..R4 = recuperaciones;
 *   NOTA_ETAPA = completiva/extraordinaria/especial). Relacionada por IDs con estudiante, docente, asignatura, curso, sección y período.
 *   Toda lectura es selectiva (por CLAVE_GRUPO) y toda escritura valida PERMISOS en el servidor.
 *********************************************************************/

function claveGrupo_(ano, idSeccion, idAsig) { return ano + '|' + idSeccion + '|' + idAsig; }

/** Convierte una clave de la interfaz (P1C2, R3C1, CEC…) en {periodo, col} de la hoja CALIFICACIONES. */
function destinoClave_(k, per) {
  const m = /^([PR])(\d)C(\d)$/.exec(k);
  if (m) { const p = per.regulares[Number(m[2]) - 1]; return p ? { periodo: p, col: (m[1] === 'P' ? 'C' : 'R') + m[3] } : null; }
  const etapa = Object.keys(CAMPO_ETAPA).filter(function (e) { return CAMPO_ETAPA[e] === k; })[0];
  const p = etapa ? per.etapas[etapa] : null;
  return p ? { periodo: p, col: 'NOTA_ETAPA' } : null;
}
/** Arma {ID_ESTUDIANTE: notas{P1C1..,R1C1..,CEC,CEEX,CESP}} desde las filas de CALIFICACIONES de un grupo. */
function notasPorEstudiante_(objs, per) {
  const ret = {};
  const idxReg = {}; per.regulares.forEach(function (p, i) { idxReg[p.ID_PERIODO] = i + 1; });
  objs.forEach(function (o) {
    const n = ret[o.ID_ESTUDIANTE] = ret[o.ID_ESTUDIANTE] || notasVacias_();
    const p = per.porId[o.ID_PERIODO]; if (!p) return;
    if (p.TIPO === 'REGULAR') { const i = idxReg[p.ID_PERIODO]; for (let c = 1; c <= 4; c++) { n['P' + i + 'C' + c] = num_(o['C' + c]); n['R' + i + 'C' + c] = num_(o['R' + c]); } }
    else if (CAMPO_ETAPA[p.ETAPA]) n[CAMPO_ETAPA[p.ETAPA]] = num_(o.NOTA_ETAPA);
  });
  return ret;
}
function exigirPeriodos_(ano) {
  const per = periodosAno_(ano);
  exigir_(per.regulares.length === SGA.PERIODOS_REGULARES, 'El año escolar ' + ano + ' no tiene los ' + SGA.PERIODOS_REGULARES + ' períodos regulares configurados (Administración > Períodos).');
  return per;
}
function exigirAsignaturaVisible_(ctx, ano, sec, idAsig) {
  const asig = asignaturaPorId_(idAsig);
  exigir_(asignaturasVisibles_(ctx, ano, sec).some(function (a) { return a.ID_ASIGNATURA === asig.ID_ASIGNATURA; }), 'No tiene acceso a esta asignatura en este curso.', 'PERMISO');
  return asig;
}

function obtenerGrid_(ctx, p) {
  exigirPermiso_(ctx, 'calificaciones.ver');
  const cfg = config_(), ano = p.ano || cfg.ANO_ESCOLAR;
  const sec = exigirSeccion_(ctx, ano, p.idSeccion), asig = exigirAsignaturaVisible_(ctx, ano, sec, p.idAsignatura), per = exigirPeriodos_(ano);
  const ca = cfgAsignatura_(cfg, asig), est = estudiantesDeSeccion_(ano, sec.idSeccion, false);
  const objs = objetosGrupo_(leerPorClave_(HOJA.CALIFICACIONES, 'CLAVE_GRUPO', claveGrupo_(ano, sec.idSeccion, asig.ID_ASIGNATURA)));
  const notas = notasPorEstudiante_(objs, per);
  const filas = est.map(function (e) { const n = notas[e.idEstudiante] || notasVacias_(); return { idEstudiante: e.idEstudiante, num: e.num, nombre: e.nombre, notas: n, calc: calcularRegistro(n, ca) }; });
  const cerrados = {};
  per.regulares.forEach(function (x, i) { cerrados[i + 1] = x.ESTADO === 'CERRADO'; });
  Object.keys(CAMPO_ETAPA).forEach(function (e) { if (per.etapas[e]) cerrados[CAMPO_ETAPA[e]] = per.etapas[e].ESTADO === 'CERRADO'; });
  const puede = (tiene_(ctx, 'calificaciones.registrar') || tiene_(ctx, 'calificaciones.editar')) && puedeTrabajar_(ctx, ano, sec.idSeccion, asig.ID_ASIGNATURA, null);
  return { ano: ano, idSeccion: sec.idSeccion, grado: sec.grado, seccion: sec.seccion, asignatura: { id: asig.ID_ASIGNATURA, nombre: asig.NOMBRE, abrev: asig.ABREV },
    docente: docentesDe_(ano, sec.idSeccion, asig.ID_ASIGNATURA), competencias: competenciasDe_(asig.ID_ASIGNATURA), params: ca, estudiantes: filas, puedeEditar: puede, cerrados: cerrados };
}

/**
 * Guarda cambios. p = { ano, idSeccion, idAsignatura, filas:[{idEstudiante, cambios:{P1C1:'85', R1C1:''}}] }
 * Cada celda se valida (formato, rango, reglas académicas, período abierto, permiso y asignación del docente).
 * Las filas inválidas se rechazan y se informan; las válidas se guardan.
 */
function guardarNotas_(ctx, p) {
  exigir_(tiene_(ctx, 'calificaciones.registrar') || tiene_(ctx, 'calificaciones.editar'), 'No tiene permiso para modificar calificaciones.', 'PERMISO');
  const cfg = config_(), ano = p.ano || cfg.ANO_ESCOLAR;
  const sec = exigirSeccion_(ctx, ano, p.idSeccion), asig = exigirAsignaturaVisible_(ctx, ano, sec, p.idAsignatura), per = exigirPeriodos_(ano);
  const ca = cfgAsignatura_(cfg, asig), cfgV = { NOTA_MINIMA_ABS: 0, NOTA_MAXIMA: cfg.NOTA_MAXIMA, NOTA_ENTERA: cfg.NOTA_ENTERA };
  const permitidos = {}; camposNotas_().concat(CAMPOS_ETAPAS).forEach(function (k) { permitidos[k] = true; });
  const clave = claveGrupo_(ano, sec.idSeccion, asig.ID_ASIGNATURA);

  return conBloqueo_(function () {
    const est = {}; estudiantesDeSeccion_(ano, sec.idSeccion, false).forEach(function (e) { est[e.idEstudiante] = e; });
    const t = leerPorClave_(HOJA.CALIFICACIONES, 'CLAVE_GRUPO', clave), objs = objetosGrupo_(t);
    const notas = notasPorEstudiante_(objs, per), porKey = {};
    objs.forEach(function (o) { porKey[o.ID_ESTUDIANTE + '|' + o.ID_PERIODO] = o; });
    const nuevoId = generadorId_(HOJA.CALIFICACIONES), ahora = ahora_();
    const asignados = asignacionesActivas_(ano).filter(function (a) { return a.ID_SECCION === sec.idSeccion && a.ID_ASIGNATURA === asig.ID_ASIGNATURA; });
    const docDe = function (idPeriodo) {
      const m = asignados.filter(function (a) { return a.ID_DOCENTE === ctx.idDocente && (a.ID_PERIODO === '*' || a.ID_PERIODO === idPeriodo); })[0]
        || asignados.filter(function (a) { return a.ID_PERIODO === '*' || a.ID_PERIODO === idPeriodo; })[0];
      return m ? m.ID_DOCENTE : (ctx.idDocente || '');
    };
    const errores = [], guardados = [], actualizar = {}, nuevas = [], tocadas = {};

    (p.filas || []).forEach(function (f) {
      const e = est[f.idEstudiante];
      if (!e) { errores.push({ idEstudiante: f.idEstudiante, campo: '', mensaje: 'El estudiante no pertenece a este curso.' }); return; }
      const antes = notas[e.idEstudiante] || notasVacias_(), n = Object.assign({}, antes), cambios = {}, errF = [];
      Object.keys(f.cambios || {}).forEach(function (k) {
        if (!permitidos[k]) { errF.push({ campo: k, mensaje: 'Campo no válido.' }); return; }
        const v = validarNota(f.cambios[k], cfgV);
        if (!v.ok) { errF.push({ campo: k, mensaje: v.error }); return; }
        if (v.valor === antes[k]) return;
        const dest = destinoClave_(k, per);
        if (!dest) { errF.push({ campo: k, mensaje: 'El período de esta nota no está configurado.' }); return; }
        if (dest.periodo.ESTADO === 'CERRADO' && !tiene_(ctx, 'calificaciones.cerrar')) { errF.push({ campo: k, mensaje: 'El período ' + dest.periodo.CODIGO + ' está cerrado.' }); return; }
        if (!puedeTrabajar_(ctx, ano, sec.idSeccion, asig.ID_ASIGNATURA, dest.periodo.ID_PERIODO)) { errF.push({ campo: k, mensaje: 'No tiene asignada esta asignatura en ese período.' }); return; }
        const permiso = antes[k] === null ? 'calificaciones.registrar' : 'calificaciones.editar';
        if (!tiene_(ctx, permiso)) { errF.push({ campo: k, mensaje: antes[k] === null ? 'No tiene permiso para registrar calificaciones nuevas.' : 'No tiene permiso para modificar calificaciones ya registradas.' }); return; }
        n[k] = v.valor; cambios[k] = true;
      });
      if (!errF.length) validarRegistro(n, cambios, ca).forEach(function (x) { errF.push(x); });
      if (errF.length) { errF.forEach(function (x) { errores.push({ idEstudiante: e.idEstudiante, campo: x.campo, mensaje: x.mensaje }); }); return; }
      if (!Object.keys(cambios).length) return;

      Object.keys(cambios).forEach(function (k) {
        const dest = destinoClave_(k, per), kk = e.idEstudiante + '|' + dest.periodo.ID_PERIODO;
        let o = porKey[kk];
        if (!o) {
          o = { ID_CALIFICACION: nuevoId(), CLAVE_GRUPO: clave, ANO_ESCOLAR: ano, ID_ESTUDIANTE: e.idEstudiante, ID_DOCENTE: docDe(dest.periodo.ID_PERIODO), ID_ASIGNATURA: asig.ID_ASIGNATURA,
            ID_CURSO: sec.idCurso, ID_SECCION: sec.idSeccion, ID_PERIODO: dest.periodo.ID_PERIODO, FECHA_CREACION: ahora };
          porKey[kk] = o; nuevas.push(o);
        } else if (o._fila) actualizar[o._fila] = o;
        o[dest.col] = n[k] === null ? '' : n[k]; o.FECHA_MODIFICACION = ahora; o.MODIFICADO_POR = ctx.usuario;
        historial_(ctx.usuario, 'EDITAR_NOTA', 'CALIFICACIONES', e.idEstudiante, e.nombre + ' · ' + asig.ABREV + ' · ' + k, antes[k], n[k]);
      });
      notas[e.idEstudiante] = n;
      guardados.push({ idEstudiante: e.idEstudiante, notas: n });
    });

    const mapa = {}; Object.keys(actualizar).forEach(function (fila) { mapa[fila] = filaDe_(t, actualizar[fila]); });
    escribirFilas_(t, mapa);
    agregarFilas_(t, nuevas.map(function (o) { return filaDe_(t, o); }));
    actualizarResultados_(ano, sec.idSeccion, asig.ID_ASIGNATURA, guardados, ca);
    vaciarHistorial_();
    return { guardados: guardados.length, errores: errores };
  });
}

/* ---------------- RESULTADOS (valores calculados, hoja derivada de solo lectura) ---------------- */
function filaResultado_(t, id, ano, idSec, idEst, idAsig, notas, ca) {
  const r = calcularRegistro(notas, ca), v = function (x) { return x === null || x === undefined ? '' : x; };
  return filaDe_(t, { ID_RESULTADO: id, CLAVE_GRUPO: claveGrupo_(ano, idSec, idAsig), ANO_ESCOLAR: ano, ID_ESTUDIANTE: idEst, ID_ASIGNATURA: idAsig, ID_SECCION: idSec,
    PC1: v(r.pcMostrar[0]), PC2: v(r.pcMostrar[1]), PC3: v(r.pcMostrar[2]), PC4: v(r.pcMostrar[3]), CF_REAL: v(r.cfReal), CF: v(r.cf), CEC: v(notas.CEC), CCF: v(r.comp.ccf),
    CEEX: v(notas.CEEX), CEXF: v(r.ext.cexf), CESP: v(notas.CESP), ETAPA_LOGRO: v(r.etapa), NOTA_A: v(r.A), NOTA_R: v(r.R), ESTADO_RESULTADO: r.estado, FECHA_MODIFICACION: ahora_() });
}
function actualizarResultados_(ano, idSec, idAsig, lista, ca) {
  if (!lista.length) return;
  const t = leerPorClave_(HOJA.RESULTADOS, 'CLAVE_GRUPO', claveGrupo_(ano, idSec, idAsig));
  const pos = {}; t.rows.forEach(function (r, i) { pos[r[t.idx.ID_ESTUDIANTE]] = { fila: t.filas[i], id: r[0] }; });
  const nuevoId = generadorId_(HOJA.RESULTADOS), actualizar = {}, nuevas = [];
  lista.forEach(function (x) {
    const ex = pos[x.idEstudiante];
    if (ex) actualizar[ex.fila] = filaResultado_(t, ex.id, ano, idSec, x.idEstudiante, idAsig, x.notas, ca);
    else nuevas.push(filaResultado_(t, nuevoId(), ano, idSec, x.idEstudiante, idAsig, x.notas, ca));
  });
  escribirFilas_(t, actualizar); agregarFilas_(t, nuevas);
}
/** Reconstruye RESULTADOS completo desde CALIFICACIONES (menú SGA o cambio de reglas). */
function reconstruirResultados_() {
  const cfg = config_(), asigs = {}; todos_(HOJA.ASIGNATURAS).forEach(function (a) { asigs[a.ID_ASIGNATURA] = a; });
  const tc = tabla_(HOJA.CALIFICACIONES), tr = tabla_(HOJA.RESULTADOS), grupos = {};
  objetos_(tc).forEach(function (o) { (grupos[o.CLAVE_GRUPO] = grupos[o.CLAVE_GRUPO] || []).push(o); });
  const filas = []; let n = 0; const pref = ESQUEMA.RESULTADOS.prefijo;
  Object.keys(grupos).forEach(function (k) {
    const g = grupos[k], a = asigs[g[0].ID_ASIGNATURA]; if (!a) return;
    const ano = String(g[0].ANO_ESCOLAR), per = periodosAno_(ano); if (per.regulares.length < SGA.PERIODOS_REGULARES) return;
    const ca = cfgAsignatura_(cfg, a), notas = notasPorEstudiante_(g, per);
    Object.keys(notas).forEach(function (idEst) { n++; filas.push(filaResultado_(tr, pref + '-' + ('000000' + n).slice(-6), ano, g[0].ID_SECCION, idEst, g[0].ID_ASIGNATURA, notas[idEst], ca)); });
  });
  const sh = tr.sh;
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, tr.headers.length).clearContent();
  if (filas.length) sh.getRange(2, 1, filas.length, tr.headers.length).setValues(filas);
  invalidar_(HOJA.RESULTADOS);
  return filas.length;
}

/* ---------------- ASISTENCIA ---------------- */
function obtenerAsistencia_(ctx, p) {
  exigirPermiso_(ctx, 'asistencia.ver');
  const cfg = config_(), ano = p.ano || cfg.ANO_ESCOLAR, sec = exigirSeccion_(ctx, ano, p.idSeccion), asig = exigirAsignaturaVisible_(ctx, ano, sec, p.idAsignatura);
  const t = leerPorClave_(HOJA.ASISTENCIA, 'CLAVE_GRUPO', claveGrupo_(ano, sec.idSeccion, asig.ID_ASIGNATURA)), m = {};
  t.rows.forEach(function (r) { m[r[t.idx.ID_ESTUDIANTE]] = r; });
  const est = estudiantesDeSeccion_(ano, sec.idSeccion, false).map(function (e) {
    const r = m[e.idEstudiante], meses = {};
    SGA.MESES.forEach(function (mes) { meses[mes] = r ? num_(r[t.idx[mes]]) : null; });
    return { idEstudiante: e.idEstudiante, num: e.num, nombre: e.nombre, meses: meses };
  });
  const periodos = periodosAno_(ano).regulares.map(function (pp) { return { codigo: pp.CODIGO, meses: String(pp.MESES || '').split(',').map(function (m) { return m.trim(); }).filter(Boolean) }; });
  return { ano: ano, asignatura: { id: asig.ID_ASIGNATURA, nombre: asig.NOMBRE }, meses: SGA.MESES, periodos: periodos, estudiantes: est,
    puedeEditar: tiene_(ctx, 'asistencia.registrar') && puedeTrabajar_(ctx, ano, sec.idSeccion, asig.ID_ASIGNATURA, null) };
}
function guardarAsistencia_(ctx, p) {
  exigirPermiso_(ctx, 'asistencia.registrar');
  const cfg = config_(), ano = p.ano || cfg.ANO_ESCOLAR, sec = exigirSeccion_(ctx, ano, p.idSeccion), asig = exigirAsignaturaVisible_(ctx, ano, sec, p.idAsignatura);
  exigir_(puedeTrabajar_(ctx, ano, sec.idSeccion, asig.ID_ASIGNATURA, null), 'No tiene asignada esta asignatura.', 'PERMISO');
  const clave = claveGrupo_(ano, sec.idSeccion, asig.ID_ASIGNATURA);
  return conBloqueo_(function () {
    const t = leerPorClave_(HOJA.ASISTENCIA, 'CLAVE_GRUPO', clave), mapa = {};
    t.rows.forEach(function (r, i) { mapa[r[t.idx.ID_ESTUDIANTE]] = { fila: t.filas[i], v: r }; });
    const est = {}; estudiantesDeSeccion_(ano, sec.idSeccion, false).forEach(function (e) { est[e.idEstudiante] = e; });
    const nuevoId = generadorId_(HOJA.ASISTENCIA), actualizar = {}, nuevas = [], errores = []; let guardados = 0;
    (p.filas || []).forEach(function (f) {
      const e = est[f.idEstudiante];
      if (!e) { errores.push({ idEstudiante: f.idEstudiante, campo: '', mensaje: 'El estudiante no pertenece a este curso.' }); return; }
      const ex = mapa[e.idEstudiante], fila = ex ? ex.v.slice() : new Array(t.headers.length).fill('');
      let hubo = false, malo = false;
      Object.keys(f.cambios || {}).forEach(function (mes) {
        if (SGA.MESES.indexOf(mes) < 0) return;
        const raw = f.cambios[mes], n = num_(raw);
        if (raw !== '' && raw !== null && (n === null || n < 0 || n > 100)) { errores.push({ idEstudiante: e.idEstudiante, campo: mes, mensaje: 'La asistencia debe ser un porcentaje entre 0 y 100.' }); malo = true; return; }
        const antes = num_(fila[t.idx[mes]]);
        if (n !== antes) { historial_(ctx.usuario, 'EDITAR_ASISTENCIA', 'ASISTENCIA', e.idEstudiante, e.nombre + ' · ' + asig.ABREV + ' · ' + mes, antes, n); fila[t.idx[mes]] = n === null ? '' : n; hubo = true; }
      });
      if (malo || !hubo) return;
      fila[t.idx.FECHA_MODIFICACION] = ahora_(); fila[t.idx.MODIFICADO_POR] = ctx.usuario;
      if (ex) actualizar[ex.fila] = fila;
      else { fila[t.idx.ID_ASISTENCIA] = nuevoId(); fila[t.idx.CLAVE_GRUPO] = clave; fila[t.idx.ANO_ESCOLAR] = ano; fila[t.idx.ID_ESTUDIANTE] = e.idEstudiante; fila[t.idx.ID_ASIGNATURA] = asig.ID_ASIGNATURA; fila[t.idx.ID_SECCION] = sec.idSeccion; nuevas.push(fila); }
      guardados++;
    });
    escribirFilas_(t, actualizar); agregarFilas_(t, nuevas); vaciarHistorial_();
    return { guardados: guardados, errores: errores };
  });
}
/** Promedio de asistencia por período (meses definidos en PERIODOS.MESES) y anual. */
function resumenAsistencia_(filasEst, t, per) {
  const porP = {};
  per.regulares.forEach(function (pp, i) {
    const vals = [], meses = String(pp.MESES || '').split(',').map(function (m) { return m.trim(); }).filter(Boolean);
    filasEst.forEach(function (r) { meses.forEach(function (mes) { const v = t.idx[mes] === undefined ? null : num_(r[t.idx[mes]]); if (v !== null) vals.push(v); }); });
    porP[i + 1] = vals.length ? redondear8_(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : null;
  });
  // Anual = promedio de los períodos que ya tienen información (un período sin datos no entra en el promedio)
  const conDatos = [1, 2, 3, 4].map(function (p) { return porP[p] === undefined ? null : porP[p]; }).filter(function (x) { return x !== null; });
  const anual = conDatos.length ? redondear8_(conDatos.reduce(function (a, b) { return a + b; }, 0) / conDatos.length) : null;
  return { periodos: porP, anual: anual };
}
