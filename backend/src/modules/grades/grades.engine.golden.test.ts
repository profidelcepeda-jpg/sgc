/*********************************************************************
 * grades.engine.golden.test.ts — Golden tests de Vitest
 * Transcripción de los 24 casos de pruebasLogica() de legacy/Tests.js.
 * REGLA: estos casos deben permanecer EXACTOS; son la garantía de que el
 * motor nuevo calcula igual que el sistema en producción.
 *********************************************************************/

import { describe, it, expect } from 'vitest';
import {
  calcularRegistro, validarRegistro, validarNota, determinarSituacionFinal,
  determinarSituacionPortada, redondearEntero_, truncar_, calcularCalificacionFinal,
  resumenAsistencia_, notasVacias_, CfgAsignatura, RegistroNotas,
} from './grades.engine';

/** casoNotas_ de Tests.js: todo P1C1..P4C4 = 80, el resto null, más overrides. */
function casoNotas_(overrides?: Record<string, unknown>): RegistroNotas {
  const n = notasVacias_();
  for (let p = 1; p <= 4; p++) for (let c = 1; c <= 4; c++) n['P' + p + 'C' + c] = 80;
  const overrides2 = overrides || {};
  Object.keys(overrides2).forEach(function (k) { (n as Record<string, unknown>)[k] = (overrides2 as Record<string, unknown>)[k]; });
  return n;
}

const ca: CfgAsignatura = { min: 70, max: 100, entera: true, dec: 1, usaRec: true, usaComp: true, usaExtra: true, usaEsp: true, pctCompCF: 50, pctCompCEC: 50, pctExtCF: 30, pctExtCE: 70, NOTA_MINIMA_ABS: 0, NOTA_MAXIMA: 100, NOTA_ENTERA: true };

describe('Golden tests del motor (legacy/Tests.js · pruebasLogica)', () => {
  it('1. Todos ≥70 → LOGRADO', () => {
    const r = calcularRegistro(casoNotas_(), ca);
    expect(r.estado === 'LOGRADO' && r.cf === 80 && r.etapa === 'CF').toBe(true);
  });

  it('2. P1=65, RP1=75 → nota efectiva 75', () => {
    const r = calcularRegistro(casoNotas_({ P1C1: 65, R1C1: 75 }), ca);
    expect(r.efectiva[0][0]).toBe(75);
    expect(r.pc[0]).toBe(78.75);
    expect(r.pcMostrar[0]).toBe(78.7);
  });

  it('3. RP1=60 < P1=65 → se rechaza', () => {
    const n3 = casoNotas_({ P1C1: 65, R1C1: 60 });
    expect(validarRegistro(n3, { R1C1: true }, ca).length === 1).toBe(true);
  });

  it('4. P1<70 sin RP → sin promedio ni CF definitivo', () => {
    const r = calcularRegistro(casoNotas_({ P1C1: 65 }), ca);
    expect(r.pc[0]).toBe(null);
    expect(r.cf).toBe(null);
    expect(r.estado === 'RECUPERACIÓN PENDIENTE').toBe(true);
  });

  it('5. CF=70 → LOGRADO', () => {
    const todos = function (v: unknown) { const o: Record<string, unknown> = {}; for (let p = 1; p <= 4; p++) for (let c = 1; c <= 4; c++) o['P' + p + 'C' + c] = v; return o; };
    const r = calcularRegistro(casoNotas_(todos(70)), ca);
    expect(r.cf).toBe(70);
    expect(r.estado === 'LOGRADO').toBe(true);
  });

  it('6. CF=69 → habilita completiva', () => {
    const todos = function (v: unknown) { const o: Record<string, unknown> = {}; for (let p = 1; p <= 4; p++) for (let c = 1; c <= 4; c++) o['P' + p + 'C' + c] = v; return o; };
    const r = calcularRegistro(casoNotas_(Object.assign(todos(69), {})), Object.assign({}, ca, { usaRec: false }));
    expect(r.cf).toBe(69);
    expect(r.comp.habilitada).toBe(true);
    expect(r.estado === 'COMPLETIVA PENDIENTE').toBe(true);
  });

  it('7. CF=69, CEC=71 → CCF=70 LOGRADO', () => {
    const todos = function (v: unknown) { const o: Record<string, unknown> = {}; for (let p = 1; p <= 4; p++) for (let c = 1; c <= 4; c++) o['P' + p + 'C' + c] = v; return o; };
    const r = calcularRegistro(casoNotas_(Object.assign(todos(69), { CEC: 71 })), Object.assign({}, ca, { usaRec: false }));
    expect(r.comp.ccf).toBe(70);
    expect(r.estado === 'LOGRADO').toBe(true);
    expect(r.etapa === 'COMPLETIVA').toBe(true);
    expect(!r.ext.habilitada).toBe(true);
  });

  it('8. CCF<70 → habilita extraordinaria', () => {
    const todos = function (v: unknown) { const o: Record<string, unknown> = {}; for (let p = 1; p <= 4; p++) for (let c = 1; c <= 4; c++) o['P' + p + 'C' + c] = v; return o; };
    const r = calcularRegistro(casoNotas_(Object.assign(todos(60), { CEC: 60 })), Object.assign({}, ca, { usaRec: false }));
    expect(r.comp.ccf).toBe(60);
    expect(r.ext.habilitada).toBe(true);
    expect(r.estado === 'EXTRAORDINARIA PENDIENTE').toBe(true);
  });

  it('9. CEXF<70 → habilita especial', () => {
    const todos = function (v: unknown) { const o: Record<string, unknown> = {}; for (let p = 1; p <= 4; p++) for (let c = 1; c <= 4; c++) o['P' + p + 'C' + c] = v; return o; };
    const r = calcularRegistro(casoNotas_(Object.assign(todos(60), { CEC: 60, CEEX: 60 })), Object.assign({}, ca, { usaRec: false }));
    expect(r.ext.cexf).toBe(60);
    expect(r.esp.habilitada).toBe(true);
    expect(r.estado === 'ESPECIAL PENDIENTE').toBe(true);
  });

  it('10. Especial=70 → LOGRADO (100 %, sin ponderar)', () => {
    const todos = function (v: unknown) { const o: Record<string, unknown> = {}; for (let p = 1; p <= 4; p++) for (let c = 1; c <= 4; c++) o['P' + p + 'C' + c] = v; return o; };
    const r = calcularRegistro(casoNotas_(Object.assign(todos(60), { CEC: 60, CEEX: 60, CESP: 70 })), Object.assign({}, ca, { usaRec: false }));
    expect(r.estado === 'LOGRADO').toBe(true);
    expect(r.A).toBe(70);
    expect(r.etapa === 'ESPECIAL').toBe(true);
  });

  it('11. Especial<70 → NO LOGRADO', () => {
    const todos = function (v: unknown) { const o: Record<string, unknown> = {}; for (let p = 1; p <= 4; p++) for (let c = 1; c <= 4; c++) o['P' + p + 'C' + c] = v; return o; };
    const r = calcularRegistro(casoNotas_(Object.assign(todos(60), { CEC: 60, CEEX: 60, CESP: 69 })), Object.assign({}, ca, { usaRec: false }));
    expect(r.estado === 'NO LOGRADO').toBe(true);
    expect(r.R).toBe(69);
  });

  it('Redondeo 70.4→70, 70.5→71, 70.6→71', () => {
    expect(redondearEntero_(70.4)).toBe(70);
    expect(redondearEntero_(70.5)).toBe(71);
    expect(redondearEntero_(70.6)).toBe(71);
  });

  it('Truncado 68.75→68.7 (no 68.8)', () => {
    expect(truncar_(68.75, 1)).toBe(68.7);
    expect(truncar_(70, 1)).toBe(70);
  });

  it('Cuatro PC de 69.5 → CF=70', () => {
    const cuatro = calcularCalificacionFinal([69.5, 69.5, 69.5, 69.5]);
    expect(cuatro?.cf).toBe(70);
  });

  it('CEC escrita sin estar habilitada → se ignora', () => {
    const todos = function (v: unknown) { const o: Record<string, unknown> = {}; for (let p = 1; p <= 4; p++) for (let c = 1; c <= 4; c++) o['P' + p + 'C' + c] = v; return o; };
    const r = calcularRegistro(casoNotas_(Object.assign(todos(80), { CEC: 50 })), ca);
    expect(r.comp.habilitada).toBe(false);
    expect(r.estado === 'LOGRADO').toBe(true);
  });

  it('CEC no habilitada se rechaza al guardar', () => {
    expect(validarRegistro(casoNotas_({ CEC: 50 }), { CEC: true }, ca).length === 1).toBe(true);
  });

  it('Falta un período → INCOMPLETO, sin CF', () => {
    const todos = function (v: unknown) { const o: Record<string, unknown> = {}; for (let p = 1; p <= 4; p++) for (let c = 1; c <= 4; c++) o['P' + p + 'C' + c] = v; return o; };
    const r = calcularRegistro(casoNotas_(Object.assign(todos(80), { P4C4: null })), ca);
    expect(r.cf).toBe(null);
    expect(r.estado === 'INCOMPLETO').toBe(true);
  });

  it('Situación anual', () => {
    expect(determinarSituacionFinal(['LOGRADO', 'LOGRADO'], 2)).toBe('PROMOVIDO');
    expect(determinarSituacionFinal(['LOGRADO', 'NO LOGRADO'], 2)).toBe('REPITENTE');
    expect(determinarSituacionFinal(['LOGRADO', 'PENDIENTE'], 2)).toBe('PENDIENTE');
  });

  it('Situación de portada', () => {
    const N = 'NO LOGRADO', L = 'LOGRADO';
    expect(determinarSituacionPortada([L, L, L, L, L], 5)).toBe('PROMOVIDO');
    expect(determinarSituacionPortada([L, N, L, L, L], 5)).toBe('PROMOVIDO_PENDIENTE');
    expect(determinarSituacionPortada([N, N, L, L, L], 5)).toBe('PROMOVIDO_PENDIENTE');
    expect(determinarSituacionPortada([N, N, N, L, L], 5)).toBe('APLAZADO');
    expect(determinarSituacionPortada([N, N, N, N, L], 5)).toBe('APLAZADO');
    expect(determinarSituacionPortada([L, L, 'PENDIENTE', L, L], 5)).toBe('');
    expect(determinarSituacionPortada([L, L], 5)).toBe('');
  });

  it('Validación de nota', () => {
    const cfg = { NOTA_MINIMA_ABS: 0, NOTA_MAXIMA: 100, NOTA_ENTERA: true };
    expect(validarNota('101', cfg).ok).toBe(false);
    expect(validarNota('abc', cfg).ok).toBe(false);
    expect(validarNota('-1', cfg).ok).toBe(false);
    expect(validarNota('85', cfg).valor).toBe(85);
  });

  // Asistencia: el anual promedia solo los períodos que tienen información
  describe('Asistencia (resumenAsistencia_)', () => {
    const idxA = { ago: 0, sep: 1, oct: 2, nov: 3, dic: 4, ene: 5, feb: 6, mar: 7, abr: 8, may: 9, jun: 10 };
    const perA = { regulares: [{ MESES: 'ago,sep,oct' }, { MESES: 'nov,dic,ene' }, { MESES: 'feb,mar' }, { MESES: 'abr,may,jun' }] };
    const fila = function (o: Record<string, number>) { const f = new Array(11).fill(''); Object.keys(o).forEach(function (m) { f[(idxA as Record<string, number>)[m]] = o[m]; }); return f; };

    it('Asistencia: solo P1 con datos → anual = P1 (sin exigir los 4 períodos)', () => {
      const a = resumenAsistencia_([fila({ ago: 90, sep: 80, oct: 100 })], { idx: idxA }, perA);
      expect(a.periodos[1]).toBe(90);
      expect(a.periodos[2]).toBe(null);
      expect(a.anual).toBe(90);
    });

    it('Asistencia: P1=80 y P2=90 → anual 85', () => {
      const a = resumenAsistencia_([fila({ ago: 80, nov: 90 })], { idx: idxA }, perA);
      expect(a.anual).toBe(85);
    });

    it('Asistencia: 4 períodos → anual = (P1+P2+P3+P4)/4', () => {
      const a = resumenAsistencia_([fila({ ago: 80, nov: 90, feb: 70, abr: 100 })], { idx: idxA }, perA);
      expect(a.anual).toBe(85);
    });

    it('Asistencia: sin datos → anual vacío', () => {
      const a = resumenAsistencia_([], { idx: idxA }, perA);
      expect(a.anual).toBe(null);
    });
  });
});
