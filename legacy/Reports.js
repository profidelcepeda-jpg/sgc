/*********************************************************************
 * Reports.gs — Datos para reportes, dashboard, consulta individual, historial y arranque
 *********************************************************************/

/** Todo lo necesario para imprimir reportes de una sección: notas + resultados calculados + asistencia. (Sin comprobar permisos: lo hace quien llama.) */
function cargarCurso_(ano, sec) {
  const cfg = config_(), per = exigirPeriodos_(ano);
  const est = estudiantesDeSeccion_(ano, sec.idSeccion, false), asigs = asignaturasDeGrado_(sec.grado);
  const prefijo = ano + '|' + sec.idSeccion + '|';
  const porAsig = {};
  objetosGrupo_(leerPorClave_(HOJA.CALIFICACIONES, 'CLAVE_GRUPO', prefijo, 'prefijo')).forEach(function (o) { (porAsig[o.ID_ASIGNATURA] = porAsig[o.ID_ASIGNATURA] || []).push(o); });
  const notasAsig = {}, cas = {};
  asigs.forEach(function (a) { notasAsig[a.ID_ASIGNATURA] = notasPorEstudiante_(porAsig[a.ID_ASIGNATURA] || [], per); cas[a.ID_ASIGNATURA] = cfgAsignatura_(cfg, a); });
  const ta = leerPorClave_(HOJA.ASISTENCIA, 'CLAVE_GRUPO', prefijo, 'prefijo'), asisPorEst = {};
  ta.rows.forEach(function (r) { (asisPorEst[r[ta.idx.ID_ESTUDIANTE]] = asisPorEst[r[ta.idx.ID_ESTUDIANTE]] || []).push(r); });
  const tutor = tutorDe_(ano, sec.idSeccion);
  const salida = {
    ano: ano, idSeccion: sec.idSeccion, grado: sec.grado, seccion: sec.seccion, tutor: tutor ? nombreDocente_(tutor) : '',
    centro: { centro: cfg.CENTRO, regional: cfg.REGIONAL, distrito: cfg.DISTRITO, codigo: cfg.CODIGO_CENTRO, direccion: cfg.DIRECCION_CENTRO || '', provincia: cfg.PROVINCIA, municipio: cfg.MUNICIPIO, tanda: cfg.TANDA, nivel: cfg.NIVEL, director: cfg.DIRECTOR },
    min: cfg.NOTA_MINIMA,
    asignaturas: asigs.map(function (a) {
      return { id: a.ID_ASIGNATURA, nombre: a.NOMBRE, nombreReporte: a.NOMBRE_REPORTE || a.NOMBRE, abrev: a.ABREV, orden: num_(a.ORDEN) || 99, ordenBoletin: num_(a.ORDEN_BOLETIN) || num_(a.ORDEN) || 99,
        docente: docentesDe_(ano, sec.idSeccion, a.ID_ASIGNATURA), competencias: competenciasDe_(a.ID_ASIGNATURA), esOptativa: String(a.CODIGO).toUpperCase() === 'OPT' };
    }),
    estudiantes: []
  };
  est.forEach(function (e) {
    const regs = {}, sits = [];
    asigs.forEach(function (a) {
      const n = notasAsig[a.ID_ASIGNATURA][e.idEstudiante] || notasVacias_(), calc = calcularRegistro(n, cas[a.ID_ASIGNATURA]);
      regs[a.ID_ASIGNATURA] = { notas: n, calc: calc }; sits.push(calc.situacion);
    });
    salida.estudiantes.push({ idEstudiante: e.idEstudiante, num: e.num, nombre: e.nombre, nombres: e.nombres, apellidos: e.apellidos, registros: regs, situacion: determinarSituacionFinal(sits, asigs.length), situacionPortada: determinarSituacionPortada(sits, asigs.length), asistencia: resumenAsistencia_(asisPorEst[e.idEstudiante] || [], ta, per) });
  });
  return salida;
}
function datosCurso_(ctx, p) {
  exigirPermiso_(ctx, 'reportes.ver');
  const ano = p.ano || config_().ANO_ESCOLAR;
  return cargarCurso_(ano, exigirSeccion_(ctx, ano, p.idSeccion));
}

function dashboard_(ctx, p) {
  exigirPermiso_(ctx, 'reportes.ver');
  const ano = p.ano || config_().ANO_ESCOLAR, d = cargarCurso_(ano, exigirSeccion_(ctx, ano, p.idSeccion)), per = Number(p.periodo) || 1;
  const prom = function (arr) { const v = arr.filter(function (x) { return x !== null; }); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; };
  const porAsig = d.asignaturas.map(function (a) {
    const fila = { id: a.id, nombre: a.nombre, periodos: [] };
    for (let k = 0; k < 4; k++) fila.periodos.push(prom(d.estudiantes.map(function (e) { return e.registros[a.id].calc.periodos[k].promedio; })));
    return fila;
  });
  const promEst = d.estudiantes.map(function (e) {
    const proms = d.asignaturas.map(function (a) { return e.registros[a.id].calc.periodos[per - 1].promedio; });
    const enRiesgo = d.asignaturas.filter(function (a) { const x = e.registros[a.id].calc.periodos[per - 1].promedio; return x !== null && x < d.min; }).map(function (a) { return a.nombre; });
    return { nombre: e.nombre, promedio: prom(proms), riesgo: enRiesgo };
  });
  const conProm = promEst.filter(function (x) { return x.promedio !== null; });
  let pendientes = 0, enRecuperacion = 0;
  d.estudiantes.forEach(function (e) {
    let pend = false, rec = false;
    d.asignaturas.forEach(function (a) {
      const c = e.registros[a.id].calc, pp = c.periodos[per - 1];
      if (c.estado === 'INCOMPLETO' || pp.estado === 'INCOMPLETO' || pp.estado === 'SIN NOTAS') pend = true;
      if (pp.pendientesRP > 0 || pp.estado === 'RECUPERACIÓN PENDIENTE') rec = true;
    });
    if (pend) pendientes++; if (rec) enRecuperacion++;
  });
  const dist = [0, 0, 0, 0];
  conProm.forEach(function (x) { if (x.promedio < 70) dist[0]++; else if (x.promedio < 80) dist[1]++; else if (x.promedio < 90) dist[2]++; else dist[3]++; });
  const situ = { PROMOVIDO: 0, REPITENTE: 0, PENDIENTE: 0 };
  d.estudiantes.forEach(function (e) { situ[e.situacion]++; });
  const algun = function (re) { return d.estudiantes.filter(function (e) { return d.asignaturas.some(function (a) { return re.test(e.registros[a.id].calc.estado); }); }).length; };
  return { curso: { ano: d.ano, grado: d.grado, seccion: d.seccion }, periodo: per, min: d.min, totalEstudiantes: d.estudiantes.length, promedioGeneral: prom(conProm.map(function (x) { return x.promedio; })),
    porcentajeAprobando: conProm.length ? conProm.filter(function (x) { return x.promedio >= d.min; }).length / conProm.length : null,
    enRiesgo: promEst.filter(function (x) { return x.riesgo.length; }).sort(function (a, b) { return b.riesgo.length - a.riesgo.length; }),
    mejor: conProm.slice().sort(function (a, b) { return b.promedio - a.promedio; }).slice(0, 5), porAsignatura: porAsig, distribucion: dist, situacion: situ,
    estudiantesPendientes: pendientes, estudiantesEnRecuperacion: enRecuperacion, estudiantesCompletiva: algun(/COMPLETIVA/), estudiantesExtraordinaria: algun(/EXTRAORDINARIA/), estudiantesEspecial: algun(/ESPECIAL/) };
}

function consultaEstudiante_(ctx, p) {
  exigirPermiso_(ctx, 'estudiantes.ver'); exigirPermiso_(ctx, 'calificaciones.ver');
  const ano = p.ano || config_().ANO_ESCOLAR;
  const ins = todos_(HOJA.INSCRIPCIONES).filter(function (i) { return i.ID_ESTUDIANTE === p.idEstudiante && String(i.ANO_ESCOLAR) === String(ano); })[0];
  exigir_(ins, 'El estudiante no está inscrito en el año escolar ' + ano + '.');
  const d = cargarCurso_(ano, exigirSeccion_(ctx, ano, ins.ID_SECCION));
  const info = porId_(HOJA.ESTUDIANTES, p.idEstudiante) || {};
  return { datos: { idEstudiante: p.idEstudiante, nombre: info.NOMBRE_COMPLETO, matricula: info.MATRICULA, sexo: info.SEXO, fechaNacimiento: info.FECHA_NACIMIENTO, estado: ins.ESTADO },
    curso: d, estudiante: d.estudiantes.filter(function (x) { return x.idEstudiante === p.idEstudiante; })[0] };
}
/** Historial académico: todos los años en que estuvo inscrito, con su situación final. */
function historialAcademico_(ctx, p) {
  exigirPermiso_(ctx, 'estudiantes.ver');
  const out = [];
  todos_(HOJA.INSCRIPCIONES).filter(function (i) { return i.ID_ESTUDIANTE === p.idEstudiante; }).forEach(function (i) {
    try {
      const ano = String(i.ANO_ESCOLAR), sec = exigirSeccion_(ctx, ano, i.ID_SECCION), d = cargarCurso_(ano, sec);
      const e = d.estudiantes.filter(function (x) { return x.idEstudiante === p.idEstudiante; })[0];
      out.push({ ano: ano, curso: etiquetaSeccion_(sec), situacion: e ? e.situacion : 'RETIRADO' });
    } catch (e) { /* sin acceso o sin períodos en ese año: se omite */ }
  });
  return out.sort(function (a, b) { return b.ano.localeCompare(a.ano); });
}

function listarHistorial_(ctx, p) {
  exigirPermiso_(ctx, 'historial.ver');
  p = p || {};
  const sh = hoja_(HOJA.HISTORIAL), last = sh.getLastRow();
  const n = Math.min(4000, Math.max(last - 1, 0));
  let items = [];
  if (n > 0) items = sh.getRange(last - n + 1, 1, n, 8).getValues().map(function (r) {
    return { FECHA: String(fechaTxt_(r[0])), USUARIO: r[1], ACCION: r[2], MODULO: r[3], ID_REGISTRO: r[4], DESCRIPCION: r[5], VALOR_ANTERIOR: r[6], VALOR_NUEVO: r[7] };
  }).reverse();
  const r = paginar_(items, { q: p.q, filtros: { MODULO: p.modulo, ACCION: p.accion }, pagina: p.pagina, tam: p.tam || 50 }, ['USUARIO', 'DESCRIPCION', 'ID_REGISTRO']);
  r.modulos = Object.keys(ESQUEMA).concat(['AUTENTICACION']).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort();
  return r;
}

/* ---------------- Arranque de la interfaz ---------------- */
function anosDisponibles_() {
  const a = {}; a[config_().ANO_ESCOLAR] = true;
  todos_(HOJA.CURSOS).forEach(function (c) { a[String(c.ANO_ESCOLAR)] = true; });
  return Object.keys(a).sort().reverse();
}
function cursosListarLigero_(ctx, p) {
  const ano = (p && p.ano) || config_().ANO_ESCOLAR, ensena = {};
  if (ctx.idDocente) asignacionesActivas_(ano).forEach(function (a) { if (a.ID_DOCENTE === ctx.idDocente) ensena[a.ID_SECCION] = true; });
  const lista = seccionesPermitidas_(ctx, ano).map(function (s) { const t = tutorDe_(ano, s.idSeccion); return { id: s.idSeccion, grado: s.grado, seccion: s.seccion, tutor: t ? nombreDocente_(t) : '', ensena: !!ensena[s.idSeccion] }; });
  if (!tiene_(ctx, 'cursos.ver_todos')) lista.sort(function (a, b) { return (b.ensena ? 1 : 0) - (a.ensena ? 1 : 0); });   // el docente abre directamente en SU curso
  return lista;
}
function bootstrap_(ctx) {
  const cfg = config_();
  return { usuario: perfilPublico_(ctx), permisos: ctx.permisos, app: cfg.NOMBRE_SISTEMA || SGA.NOMBRE, version: SGA.VERSION,
    config: { ano: cfg.ANO_ESCOLAR, min: cfg.NOTA_MINIMA, max: cfg.NOTA_MAXIMA, entera: cfg.NOTA_ENTERA, decimales: cfg.DECIMALES_COMPETENCIA, filas: cfg.FILAS_POR_PAGINA },
    anos: anosDisponibles_(), grados: String(cfg.GRADOS).split(',').map(function (g) { return g.trim(); }), cursos: ctx.debeCambiar ? [] : cursosListarLigero_(ctx, { ano: cfg.ANO_ESCOLAR }) };
}
function asignaturasCurso_(ctx, p) {
  exigirPermiso_(ctx, 'calificaciones.ver');
  const ano = p.ano || config_().ANO_ESCOLAR, sec = exigirSeccion_(ctx, ano, p.idSeccion);
  return asignaturasVisibles_(ctx, ano, sec).map(function (a) {
    return { id: a.ID_ASIGNATURA, nombre: a.NOMBRE, abrev: a.ABREV, docente: docentesDe_(ano, sec.idSeccion, a.ID_ASIGNATURA),
      puedeEditar: (tiene_(ctx, 'calificaciones.registrar') || tiene_(ctx, 'calificaciones.editar')) && puedeTrabajar_(ctx, ano, sec.idSeccion, a.ID_ASIGNATURA, null) };
  });
}
/** Configuración editable (solo administradores de configuración). */
function configObtener_(ctx) {
  exigirPermiso_(ctx, 'configuracion.administrar');
  return tabla_(HOJA.CONFIG).rows.filter(function (r) { return r[0] !== ''; }).map(function (r) { return { clave: r[0], valor: r[1], descripcion: r[2] }; });
}
function configGuardar_(ctx, p) {
  exigirPermiso_(ctx, 'configuracion.administrar');
  return conBloqueo_(function () {
    const t = tabla_(HOJA.CONFIG), nuevos = {}, mapa = {};
    (p.items || []).forEach(function (x) { nuevos[x.clave] = x.valor; });
    let cambios = 0;
    t.rows.forEach(function (r, i) {
      const k = String(r[0]);
      if (!k || nuevos[k] === undefined || String(nuevos[k]) === String(r[1])) return;
      const v = nuevos[k];
      if (CLAVES_NUM.indexOf(k) >= 0) exigir_(num_(v) !== null, 'El valor de ' + k + ' debe ser numérico.');
      if (k === 'NOTA_MINIMA') exigir_(num_(v) >= 1 && num_(v) <= 100, 'La nota mínima debe estar entre 1 y 100.');
      if (k === 'ANO_ESCOLAR') exigir_(/^\d{4}-\d{4}$/.test(String(v)), 'El año escolar debe tener el formato AAAA-AAAA.');
      const f = r.slice(); f[t.idx.VALOR] = v; f[t.idx.FECHA_MODIFICACION] = ahora_(); mapa[i + 2] = f; cambios++;
      historial_(ctx.usuario, 'CONFIGURACION', 'CONFIG', k, 'Parámetro ' + k, r[1], v);
    });
    escribirFilas_(t, mapa); limpiarCacheCfg_(); invalidar_(HOJA.CONFIG); vaciarHistorial_();
    if (cambios) reconstruirResultados_();   // un cambio de regla debe reflejarse en RESULTADOS
    return { cambios: cambios };
  });
}
