/*********************************************************************
 * Engine.gs — MOTOR ACADÉMICO (funciones puras, sin SpreadsheetApp)
 * Toda la lógica de cálculo de notas vive SOLO aquí (reglas institucionales de
 * período, recuperación, competencias, calificación final, completiva,
 * extraordinaria y evaluación especial). La interfaz solo muestra resultados.
 *********************************************************************/

function camposNotas_() {
  const f = [];
  for (let p = 1; p <= 4; p++) { for (let c = 1; c <= 4; c++) f.push('P' + p + 'C' + c); for (let c = 1; c <= 4; c++) f.push('R' + p + 'C' + c); }
  return f;
}
const CAMPOS_ETAPAS = ['CEC', 'CEEX', 'CESP'];
function notasVacias_() { const n = {}; camposNotas_().concat(CAMPOS_ETAPAS).forEach(function (k) { n[k] = null; }); return n; }

/* ===================== 4. LÓGICA ACADÉMICA CENTRALIZADA ===================== */
/* Todo el cálculo de notas vive SOLO aquí. El HTML únicamente muestra resultados. */

function redondear8_(x) { return Math.round(x * 1e8) / 1e8; }
/** Redondeo al entero más próximo: 70.4→70, 70.5→71, 70.6→71. */
function redondearEntero_(x) { return Math.floor(redondear8_(x) + 0.5); }
/** Valor MOSTRADO con "dec" decimales, TRUNCADO (68.75→68.7). El valor real no se altera. */
function truncar_(x, dec) { const f = Math.pow(10, dec); return Math.floor(redondear8_(x) * f + 1e-9) / f; }

/** Una sola nota por período: P si ≥ mínimo; si P < mínimo, la RP (solo si RP ≥ P). Nunca se suman. */
function calcularNotaEfectiva(p, rp, minimo, usaRec) {
  if (p === null) return { valor: null, estado: 'VACIO', usoRP: false };
  if (p >= minimo || !usaRec) return { valor: p, estado: 'OK', usoRP: false };
  if (rp !== null) return { valor: Math.max(p, rp), estado: 'OK', usoRP: rp > p };   // una RP menor nunca baja la nota
  return { valor: null, estado: 'PENDIENTE_RP', usoRP: false };
}

/** Promedio REAL de una competencia (4 períodos). Si falta algo, null (nunca un parcial). */
function calcularPromedioCompetencia(efectivas) {
  let s = 0;
  for (let i = 0; i < efectivas.length; i++) { if (efectivas[i] === null) return null; s += efectivas[i]; }
  return s / efectivas.length;
}

/** Calificación Final del Área: promedio de los promedios reales, redondeado al entero. */
function calcularCalificacionFinal(pcReales) {
  let s = 0;
  for (let i = 0; i < pcReales.length; i++) { if (pcReales[i] === null) return null; s += pcReales[i]; }
  const real = s / pcReales.length;
  return { real: real, cf: redondearEntero_(real) };
}

function calcularCompletiva(cf, cec, ca) {
  const base = redondear8_(cf * ca.pctCompCF / 100);
  if (cec === null) return { base: base, mitad: null, ccf: null };
  const mitad = redondear8_(cec * ca.pctCompCEC / 100);
  return { base: base, mitad: mitad, ccf: redondearEntero_(base + mitad) };
}
function calcularExtraordinaria(cf, ceex, ca) {
  const base = redondear8_(cf * ca.pctExtCF / 100);
  if (ceex === null) return { base: base, mitad: null, cexf: null };
  const mitad = redondear8_(ceex * ca.pctExtCE / 100);
  return { base: base, mitad: mitad, cexf: redondearEntero_(base + mitad) };
}

/**
 * Calcula TODO el registro de una asignatura para un estudiante.
 * n  = { P1C1..P4C4, R1C1..R4C4, CEC, CEEX, CESP }  (números o null)
 * ca = parámetros de la asignatura (cfgAsignatura_)
 * Secuencia: P1-P4 → PC → CF → (CF<70) completiva → extraordinaria → especial.
 * Una etapa aprobada cierra la secuencia: ninguna etapa posterior se habilita.
 */
function calcularRegistro(n, ca) {
  const NP = SGA.PERIODOS_REGULARES, NC = SGA.COMPETENCIAS;
  const R = { periodos: [], efectiva: [], vigente: [], pc: [], pcMostrar: [], cfReal: null, cf: null,
    comp: { habilitada: false, cec: null, base: null, mitad: null, ccf: null },
    ext: { habilitada: false, ceex: null, base: null, mitad: null, cexf: null },
    esp: { habilitada: false, cf: null, cesp: null },
    etapa: null, A: null, R: null, estado: null, situacion: 'PENDIENTE' };
  let pendTotal = 0;

  for (let p = 1; p <= NP; p++) {
    const ef = [], vi = [];
    let ing = 0, pend = 0, suma = 0;
    for (let c = 1; c <= NC; c++) {
      const P = n['P' + p + 'C' + c], RP = n['R' + p + 'C' + c];
      const e = calcularNotaEfectiva(P, RP, ca.min, ca.usaRec);
      ef.push(e.valor);
      const vig = P === null ? null : ((P >= ca.min || !ca.usaRec) ? P : (RP !== null ? Math.max(P, RP) : P));
      vi.push(vig);
      if (P !== null) { ing++; suma += vig; }
      if (e.estado === 'PENDIENTE_RP') pend++;
    }
    R.efectiva.push(ef); R.vigente.push(vi);
    R.periodos.push({
      p: p, ingresadas: ing, pendientesRP: pend, completo: ing === NC && pend === 0,
      promedio: ing ? redondear8_(suma / ing) : null,
      estado: pend > 0 ? 'RECUPERACIÓN PENDIENTE' : (ing === 0 ? 'SIN NOTAS' : (ing < NC ? 'INCOMPLETO' : 'COMPLETADO'))
    });
    pendTotal += pend;
  }
  for (let c = 0; c < NC; c++) {
    const real = calcularPromedioCompetencia([0, 1, 2, 3].map(function (p) { return R.efectiva[p][c]; }));
    R.pc.push(real);
    R.pcMostrar.push(real === null ? null : truncar_(real, ca.dec));
  }
  const cfc = calcularCalificacionFinal(R.pc);
  if (cfc) { R.cfReal = cfc.real; R.cf = cfc.cf; }

  if (R.cf === null) {
    R.estado = pendTotal > 0 ? 'RECUPERACIÓN PENDIENTE' : 'INCOMPLETO';
    return R;
  }
  if (R.cf >= ca.min) {
    R.etapa = 'CF'; R.A = R.cf; R.estado = 'LOGRADO'; R.situacion = 'LOGRADO';
    return R;
  }
  // --- CF < mínimo: secuencia de etapas ---
  let ultimo = R.cf, aprobado = false, pendiente = null;
  if (ca.usaComp) {
    R.comp.habilitada = true; R.comp.cec = n.CEC;
    const c = calcularCompletiva(R.cf, n.CEC, ca);
    R.comp.base = c.base; R.comp.mitad = c.mitad; R.comp.ccf = c.ccf;
    if (c.ccf === null) pendiente = 'COMPLETIVA PENDIENTE';
    else { ultimo = c.ccf; if (c.ccf >= ca.min) { aprobado = true; R.etapa = 'COMPLETIVA'; } }
  }
  if (!aprobado && !pendiente && ca.usaExtra) {
    R.ext.habilitada = true; R.ext.ceex = n.CEEX;
    const e = calcularExtraordinaria(R.cf, n.CEEX, ca);
    R.ext.base = e.base; R.ext.mitad = e.mitad; R.ext.cexf = e.cexf;
    if (e.cexf === null) pendiente = 'EXTRAORDINARIA PENDIENTE';
    else { ultimo = e.cexf; if (e.cexf >= ca.min) { aprobado = true; R.etapa = 'EXTRAORDINARIA'; } }
  }
  if (!aprobado && !pendiente && ca.usaEsp) {
    R.esp.habilitada = true; R.esp.cf = R.cf; R.esp.cesp = n.CESP;   // 100 % de la nota, sin ponderación
    if (n.CESP === null) pendiente = 'ESPECIAL PENDIENTE';
    else { ultimo = n.CESP; if (n.CESP >= ca.min) { aprobado = true; R.etapa = 'ESPECIAL'; } }
  }
  if (aprobado) { R.A = ultimo; R.estado = 'LOGRADO'; R.situacion = 'LOGRADO'; }
  else if (pendiente) { R.estado = pendiente; }
  else { R.R = ultimo; R.estado = 'NO LOGRADO'; R.situacion = 'NO LOGRADO'; }
  return R;
}

/** Situación anual del estudiante a partir de las situaciones de sus áreas. */
function determinarSituacionFinal(situaciones, totalAreas) {
  if (situaciones.some(function (s) { return s === 'NO LOGRADO'; })) return 'REPITENTE';
  if (situaciones.length === totalAreas && situaciones.every(function (s) { return s === 'LOGRADO'; })) return 'PROMOVIDO';
  return 'PENDIENTE';
}

/**
 * Situación del estudiante para la PORTADA del boletín (casillas "Promovido/a",
 * "Promovido con asignatura pendiente" y "Aplazado"). NO modifica ni reemplaza
 * determinarSituacionFinal ni el cálculo de notas: es una regla adicional.
 * Solo se define cuando TODAS las áreas ya tienen resultado final (incluidas
 * completiva, extraordinaria y especial); si falta alguno devuelve '' y la portada
 * queda sin marcar.
 *   0 áreas no logradas        → 'PROMOVIDO'
 *   1 o 2 áreas no logradas    → 'PROMOVIDO_PENDIENTE'
 *   3 o más áreas no logradas  → 'APLAZADO'
 */
function determinarSituacionPortada(situaciones, totalAreas) {
  const MAX_PENDIENTES = 2;   // ★ máximo de áreas no logradas para seguir siendo "promovido con asignatura pendiente"
  if (!totalAreas || situaciones.length !== totalAreas) return '';
  const finales = situaciones.every(function (s) { return s === 'LOGRADO' || s === 'NO LOGRADO'; });
  if (!finales) return '';
  const n = situaciones.filter(function (s) { return s === 'NO LOGRADO'; }).length;
  if (n === 0) return 'PROMOVIDO';
  if (n <= MAX_PENDIENTES) return 'PROMOVIDO_PENDIENTE';
  return 'APLAZADO';
}

/** Validación de una nota individual. Devuelve {ok, valor, error}. */
function validarNota(valor, cfg) {
  if (valor === '' || valor === null || valor === undefined) return { ok: true, valor: null };
  const n = num_(valor);
  const msg = 'Debe introducir una calificación entre ' + cfg.NOTA_MINIMA_ABS + ' y ' + cfg.NOTA_MAXIMA + '.';
  if (n === null) return { ok: false, error: msg };
  if (n < 0 || n > cfg.NOTA_MAXIMA) return { ok: false, error: msg };
  if (cfg.NOTA_ENTERA && Math.floor(n) !== n) return { ok: false, error: 'La calificación debe ser un número entero.' };
  return { ok: true, valor: n };
}

/** Validaciones cruzadas del registro ya fusionado. cambios = claves modificadas en esta operación. */
function validarRegistro(n, cambios, ca) {
  const errores = [];
  const claves = Object.keys(cambios);
  const pares = {};
  claves.forEach(function (k) {
    const m = /^[PR](\d)C(\d)$/.exec(k);
    if (m) pares[m[1] + '-' + m[2]] = [Number(m[1]), Number(m[2])];
  });
  Object.keys(pares).forEach(function (kp) {
    const p = pares[kp][0], c = pares[kp][1];
    const P = n['P' + p + 'C' + c], RP = n['R' + p + 'C' + c];
    if (RP === null) return;
    if (!ca.usaRec) errores.push({ campo: 'R' + p + 'C' + c, mensaje: 'Esta asignatura no usa recuperación.' });
    else if (P === null) errores.push({ campo: 'R' + p + 'C' + c, mensaje: 'Registre primero la nota P' + p + ' antes de la recuperación.' });
    else if (P >= ca.min) errores.push({ campo: 'R' + p + 'C' + c, mensaje: 'RP' + p + ' no está habilitada: la nota P' + p + ' (' + P + ') ya es ' + ca.min + ' o más.' });
    else if (RP < P) errores.push({ campo: 'R' + p + 'C' + c, mensaje: 'RP' + p + ' (' + RP + ') no puede ser menor que la nota original (' + P + ').' });
  });
  // Etapas finales: solo se aceptan cuando la etapa anterior las habilita
  const r = calcularRegistro(n, ca);
  if (cambios.CEC !== undefined && n.CEC !== null && !r.comp.habilitada)
    errores.push({ campo: 'CEC', mensaje: 'La completiva no está habilitada: la Calificación Final del Área debe estar completa y ser menor de ' + ca.min + '.' });
  if (cambios.CEEX !== undefined && n.CEEX !== null && !r.ext.habilitada)
    errores.push({ campo: 'CEEX', mensaje: 'La extraordinaria no está habilitada: primero debe resolverse la completiva (C.C.F. menor de ' + ca.min + ').' });
  if (cambios.CESP !== undefined && n.CESP !== null && !r.esp.habilitada)
    errores.push({ campo: 'CESP', mensaje: 'La evaluación especial no está habilitada: la C.EX.F. debe ser menor de ' + ca.min + '.' });
  return errores;
}

