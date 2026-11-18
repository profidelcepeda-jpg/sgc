/*********************************************************************
 * grades.engine.ts — MOTOR ACADÉMICO (transcripción literal de legacy/Engine.js)
 *
 * REGLA DE MIGRACIÓN (AGENTS.md): las fórmulas se transcriben LITERALMENTE.
 * No "mejorar" el orden de operaciones, los epsilons (1e8 / 1e-9) ni el
 * redondeo half-up Math.floor(x + 0.5). Los 24 casos de legacy/Tests.js
 * (src/modules/grades/grades.engine.golden.test.ts) deben permanecer en verde.
 *
 * Toda la lógica de cálculo de notas vive SOLO aquí (reglas institucionales de
 * período, recuperación, competencias, calificación final, completiva,
 * extraordinaria y evaluación especial). La interfaz solo muestra resultados.
 *********************************************************************/

export type Nota = number | null;
export type RegistroNotas = Record<string, Nota>; // claves: P1C1..P4C4, R1C1..R4C4, CEC, CEEX, CESP

/** Constantes de Config.js: SGA.PERIODOS_REGULARES y SGA.COMPETENCIAS */
export const PERIODOS_REGULARES = 4; // P1..P4 (estructura de columnas C1..C4 / R1..R4)
export const COMPETENCIAS = 4;       // C1..C4 por asignatura

/** cfgAsignatura_ (Subjects.js): parámetros de la asignatura + configuración global. */
export interface CfgAsignatura {
  min: number;      // NOTA_MINIMA (global o de la asignatura)
  max: number;      // NOTA_MAXIMA
  entera: boolean;  // CONFIG.NOTA_ENTERA
  dec: number;      // CONFIG.DECIMALES_COMPETENCIA (decimales mostrados, truncados)
  usaRec: boolean;  // asignatura.USA_RECUPERACION && CONFIG.ACTIVAR_RECUPERACION
  usaComp: boolean; // asignatura.USA_COMPLETIVA && CONFIG.ACTIVAR_COMPLETIVA
  usaExtra: boolean; // asignatura.USA_EXTRAORDINARIA && CONFIG.ACTIVAR_EXTRAORDINARIA
  usaEsp: boolean;  // asignatura.USA_ESPECIAL && CONFIG.ACTIVAR_ESPECIAL
  pctCompCF: number;  // CONFIG.PCT_COMPLETIVA_CF (50)
  pctCompCEC: number; // CONFIG.PCT_COMPLETIVA_CEC (50)
  pctExtCF: number;   // CONFIG.PCT_EXTRA_CF (30)
  pctExtCE: number;   // CONFIG.PCT_EXTRA_CE (70)
  NOTA_MINIMA_ABS: number;
  NOTA_MAXIMA: number;
  NOTA_ENTERA: boolean;
}

/** Legacy/Utils.js num_ */
export function num_(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isFinite(n) ? n : null;
}

export function camposNotas_(): string[] {
  const f: string[] = [];
  for (let p = 1; p <= PERIODOS_REGULARES; p++) {
    for (let c = 1; c <= COMPETENCIAS; c++) f.push('P' + p + 'C' + c);
    for (let c = 1; c <= COMPETENCIAS; c++) f.push('R' + p + 'C' + c);
  }
  return f;
}

export const CAMPOS_ETAPAS = ['CEC', 'CEEX', 'CESP'];

export function notasVacias_(): RegistroNotas {
  const n: RegistroNotas = {};
  camposNotas_().concat(CAMPOS_ETAPAS).forEach(function (k) { n[k] = null; });
  return n;
}

/* ===================== 4. LÓGICA ACADÉMICA CENTRALIZADA ===================== */
/* Todo el cálculo de notas vive SOLO aquí. El frontend únicamente muestra resultados. */

export function redondear8_(x: number): number { return Math.round(x * 1e8) / 1e8; }

/** Redondeo al entero más próximo: 70.4→70, 70.5→71, 70.6→71. */
export function redondearEntero_(x: number): number { return Math.floor(redondear8_(x) + 0.5); }

/** Valor MOSTRADO con "dec" decimales, TRUNCADO (68.75→68.7). El valor real no se altera. */
export function truncar_(x: number, dec: number): number {
  const f = Math.pow(10, dec);
  return Math.floor(redondear8_(x) * f + 1e-9) / f;
}

export interface NotaEfectiva { valor: Nota; estado: 'VACIO' | 'OK' | 'PENDIENTE_RP'; usoRP: boolean; }

/** Una sola nota por período: P si ≥ mínimo; si P < mínimo, la RP (solo si RP ≥ P). Nunca se suman. */
export function calcularNotaEfectiva(p: Nota, rp: Nota, minimo: number, usaRec: boolean): NotaEfectiva {
  if (p === null) return { valor: null, estado: 'VACIO', usoRP: false };
  if (p >= minimo || !usaRec) return { valor: p, estado: 'OK', usoRP: false };
  if (rp !== null) return { valor: Math.max(p, rp), estado: 'OK', usoRP: rp > p }; // una RP menor nunca baja la nota
  return { valor: null, estado: 'PENDIENTE_RP', usoRP: false };
}

/** Promedio REAL de una competencia (4 períodos). Si falta algo, null (nunca un parcial). */
export function calcularPromedioCompetencia(efectivas: Nota[]): number | null {
  let s = 0;
  for (let i = 0; i < efectivas.length; i++) { const v = efectivas[i]; if (v === null) return null; s += v; }
  return s / efectivas.length;
}

export interface CalificacionFinalCalc { real: number; cf: number; }

/** Calificación Final del Área: promedio de los promedios reales, redondeado al entero. */
export function calcularCalificacionFinal(pcReales: Nota[]): CalificacionFinalCalc | null {
  let s = 0;
  for (let i = 0; i < pcReales.length; i++) { const v = pcReales[i]; if (v === null) return null; s += v; }
  const real = s / pcReales.length;
  return { real: real, cf: redondearEntero_(real) };
}

export interface CompletivaCalc { base: number; mitad: Nota; ccf: Nota; }

export function calcularCompletiva(cf: number, cec: Nota, ca: CfgAsignatura): CompletivaCalc {
  const base = redondear8_(cf * ca.pctCompCF / 100);
  if (cec === null) return { base: base, mitad: null, ccf: null };
  const mitad = redondear8_(cec * ca.pctCompCEC / 100);
  return { base: base, mitad: mitad, ccf: redondearEntero_(base + mitad) };
}

export interface ExtraordinariaCalc { base: number; mitad: Nota; cexf: Nota; }

export function calcularExtraordinaria(cf: number, ceex: Nota, ca: CfgAsignatura): ExtraordinariaCalc {
  const base = redondear8_(cf * ca.pctExtCF / 100);
  if (ceex === null) return { base: base, mitad: null, cexf: null };
  const mitad = redondear8_(ceex * ca.pctExtCE / 100);
  return { base: base, mitad: mitad, cexf: redondearEntero_(base + mitad) };
}

export interface PeriodoCalc {
  p: number; ingresadas: number; pendientesRP: number; completo: boolean;
  promedio: number | null;
  estado: 'RECUPERACIÓN PENDIENTE' | 'SIN NOTAS' | 'INCOMPLETO' | 'COMPLETADO';
}

export interface Registro {
  periodos: PeriodoCalc[];
  efectiva: Nota[][];  // efectiva[periodo-1][competencia-1]
  vigente: Nota[][];
  pc: Nota[];          // promedio real de cada competencia (con decimales)
  pcMostrar: Nota[];   // promedio mostrado (truncado a ca.dec)
  cfReal: number | null;
  cf: number | null;
  comp: { habilitada: boolean; cec: Nota; base: number | null; mitad: Nota; ccf: Nota };
  ext: { habilitada: boolean; ceex: Nota; base: number | null; mitad: Nota; cexf: Nota };
  esp: { habilitada: boolean; cf: number | null; cesp: Nota };
  etapa: 'CF' | 'COMPLETIVA' | 'EXTRAORDINARIA' | 'ESPECIAL' | null;
  A: number | null;    // calificación final aprobada
  R: number | null;    // última nota entera fallida (NO LOGRADO)
  estado: string | null;
  situacion: 'LOGRADO' | 'NO LOGRADO' | 'PENDIENTE';
}

/**
 * Calcula TODO el registro de una asignatura para un estudiante.
 * n  = { P1C1..P4C4, R1C1..R4C4, CEC, CEEX, CESP }  (números o null)
 * ca = parámetros de la asignatura (cfgAsignatura_)
 * Secuencia: P1-P4 → PC → CF → (CF<70) completiva → extraordinaria → especial.
 * Una etapa aprobada cierra la secuencia: ninguna etapa posterior se habilita.
 */
export function calcularRegistro(n: RegistroNotas, ca: CfgAsignatura): Registro {
  const NP = PERIODOS_REGULARES, NC = COMPETENCIAS;
  const R: Registro = { periodos: [], efectiva: [], vigente: [], pc: [], pcMostrar: [], cfReal: null, cf: null,
    comp: { habilitada: false, cec: null, base: null, mitad: null, ccf: null },
    ext: { habilitada: false, ceex: null, base: null, mitad: null, cexf: null },
    esp: { habilitada: false, cf: null, cesp: null },
    etapa: null, A: null, R: null, estado: null, situacion: 'PENDIENTE' };
  let pendTotal = 0;

  for (let p = 1; p <= NP; p++) {
    const ef: Nota[] = [], vi: Nota[] = [];
    let ing = 0, pend = 0, suma = 0;
    for (let c = 1; c <= NC; c++) {
      const P = n['P' + p + 'C' + c] ?? null, RP = n['R' + p + 'C' + c] ?? null;
      const e = calcularNotaEfectiva(P, RP, ca.min, ca.usaRec);
      ef.push(e.valor);
      const vig: Nota = P === null ? null : ((P >= ca.min || !ca.usaRec) ? P : (RP !== null ? Math.max(P, RP) : P));
      vi.push(vig);
      if (P !== null) { ing++; suma += (vig ?? 0); } // legado: suma += vig con vig null aporta 0 (coerción)
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
  let ultimo: number | null = R.cf, aprobado = false, pendiente: string | null = null;
  if (ca.usaComp) {
    R.comp.habilitada = true; R.comp.cec = n.CEC ?? null;
    const c = calcularCompletiva(R.cf, n.CEC ?? null, ca);
    R.comp.base = c.base; R.comp.mitad = c.mitad; R.comp.ccf = c.ccf;
    if (c.ccf === null) pendiente = 'COMPLETIVA PENDIENTE';
    else { ultimo = c.ccf; if (c.ccf >= ca.min) { aprobado = true; R.etapa = 'COMPLETIVA'; } }
  }
  if (!aprobado && !pendiente && ca.usaExtra) {
    R.ext.habilitada = true; R.ext.ceex = n.CEEX ?? null;
    const e = calcularExtraordinaria(R.cf, n.CEEX ?? null, ca);
    R.ext.base = e.base; R.ext.mitad = e.mitad; R.ext.cexf = e.cexf;
    if (e.cexf === null) pendiente = 'EXTRAORDINARIA PENDIENTE';
    else { ultimo = e.cexf; if (e.cexf >= ca.min) { aprobado = true; R.etapa = 'EXTRAORDINARIA'; } }
  }
  if (!aprobado && !pendiente && ca.usaEsp) {
    R.esp.habilitada = true; R.esp.cf = R.cf; R.esp.cesp = n.CESP ?? null; // 100 % de la nota, sin ponderación
    if ((n.CESP ?? null) === null) pendiente = 'ESPECIAL PENDIENTE';
    else { const cesp = n.CESP ?? null; ultimo = cesp; if (cesp !== null && cesp >= ca.min) { aprobado = true; R.etapa = 'ESPECIAL'; } }
  }
  if (aprobado) { R.A = ultimo; R.estado = 'LOGRADO'; R.situacion = 'LOGRADO'; }
  else if (pendiente) { R.estado = pendiente; }
  else { R.R = ultimo; R.estado = 'NO LOGRADO'; R.situacion = 'NO LOGRADO'; }
  return R;
}

/** Situación anual del estudiante a partir de las situaciones de sus áreas. */
export function determinarSituacionFinal(situaciones: string[], totalAreas: number): 'REPITENTE' | 'PROMOVIDO' | 'PENDIENTE' {
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
export function determinarSituacionPortada(situaciones: string[], totalAreas: number): string {
  const MAX_PENDIENTES = 2; // ★ máximo de áreas no logradas para seguir siendo "promovido con asignatura pendiente"
  if (!totalAreas || situaciones.length !== totalAreas) return '';
  const finales = situaciones.every(function (s) { return s === 'LOGRADO' || s === 'NO LOGRADO'; });
  if (!finales) return '';
  const n = situaciones.filter(function (s) { return s === 'NO LOGRADO'; }).length;
  if (n === 0) return 'PROMOVIDO';
  if (n <= MAX_PENDIENTES) return 'PROMOVIDO_PENDIENTE';
  return 'APLAZADO';
}

export interface ValidacionNota { ok: boolean; valor?: Nota; error?: string; }

/** Validación de una nota individual. Devuelve {ok, valor, error}. */
export function validarNota(valor: unknown, cfg: { NOTA_MINIMA_ABS: number; NOTA_MAXIMA: number; NOTA_ENTERA: boolean }): ValidacionNota {
  if (valor === '' || valor === null || valor === undefined) return { ok: true, valor: null };
  const n = num_(valor);
  const msg = 'Debe introducir una calificación entre ' + cfg.NOTA_MINIMA_ABS + ' y ' + cfg.NOTA_MAXIMA + '.';
  if (n === null) return { ok: false, error: msg };
  if (n < 0 || n > cfg.NOTA_MAXIMA) return { ok: false, error: msg };
  if (cfg.NOTA_ENTERA && Math.floor(n) !== n) return { ok: false, error: 'La calificación debe ser un número entero.' };
  return { ok: true, valor: n };
}

export interface ErrorCampo { campo: string; mensaje: string; }

/** Validaciones cruzadas del registro ya fusionado. cambios = claves modificadas en esta operación. */
export function validarRegistro(n: RegistroNotas, cambios: Record<string, unknown>, ca: CfgAsignatura): ErrorCampo[] {
  const errores: ErrorCampo[] = [];
  const claves = Object.keys(cambios);
  const pares: Record<string, [number, number]> = {};
  claves.forEach(function (k) {
    const m = /^[PR](\d)C(\d)$/.exec(k);
    if (m) pares[m[1] + '-' + m[2]] = [Number(m[1]), Number(m[2])];
  });
  Object.keys(pares).forEach(function (kp) {
    const p = pares[kp][0], c = pares[kp][1];
    const P = n['P' + p + 'C' + c] ?? null, RP = n['R' + p + 'C' + c] ?? null;
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

/** Parámetros de asistencia (Grades.js resumenAsistencia_): hoja con índices por mes y períodos regulares. */
export interface AsistenciaTabla { idx: Record<string, number>; }
export interface PeriodoMeses { MESES: string; }

/**
 * Promedio de asistencia por período (meses definidos en PERIODOS.MESES) y anual.
 * Transcripción literal de Grades.js resumenAsistencia_.
 */
export function resumenAsistencia_(filasEst: unknown[][], t: AsistenciaTabla, per: { regulares: PeriodoMeses[] }): { periodos: Record<number, number | null>; anual: number | null } {
  const porP: Record<number, number | null> = {};
  per.regulares.forEach(function (pp, i) {
    const vals: number[] = [];
    const meses = String(pp.MESES || '').split(',').map(function (m) { return m.trim(); }).filter(Boolean);
    filasEst.forEach(function (r) { meses.forEach(function (mes) { const v = t.idx[mes] === undefined ? null : num_(r[(t.idx as Record<string, number>)[mes]]); if (v !== null) vals.push(v); }); });
    porP[i + 1] = vals.length ? redondear8_(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : null;
  });
  // Anual = promedio de los períodos que ya tienen información (un período sin datos no entra en el promedio)
  const conDatos = [1, 2, 3, 4].map(function (p) { return porP[p] === undefined ? null : porP[p]; }).filter(function (x) { return x !== null; });
  const anual = conDatos.length ? redondear8_(conDatos.reduce(function (a, b) { return a + (b as number); }, 0) / conDatos.length) : null;
  return { periodos: porP, anual: anual };
}
