/*********************************************************************
 * Tests.gs — Pruebas de la lógica académica y de seguridad (SGA > Ejecutar pruebas)
 *********************************************************************/

/* ---------- Pruebas de la lógica (casos del documento de requisitos) ---------- */
function casoNotas_(overrides) {
  const n = notasVacias_();
  for (let p = 1; p <= 4; p++) for (let c = 1; c <= 4; c++) n['P' + p + 'C' + c] = 80;
  Object.keys(overrides || {}).forEach(function (k) { n[k] = overrides[k]; });
  return n;
}
function pruebasLogica() {
  const ca = { min: 70, max: 100, entera: true, dec: 1, usaRec: true, usaComp: true, usaExtra: true, usaEsp: true, pctCompCF: 50, pctCompCEC: 50, pctExtCF: 30, pctExtCE: 70 };
  const res = [];
  const t = function (nombre, ok, detalle) { res.push({ nombre: nombre, ok: !!ok, detalle: detalle || '' }); };
  let r;

  r = calcularRegistro(casoNotas_(), ca);
  t('1. Todos ≥70 → LOGRADO', r.estado === 'LOGRADO' && r.cf === 80 && r.etapa === 'CF');

  r = calcularRegistro(casoNotas_({ P1C1: 65, R1C1: 75 }), ca);
  t('2. P1=65, RP1=75 → nota efectiva 75', r.efectiva[0][0] === 75 && r.pc[0] === 78.75 && r.pcMostrar[0] === 78.7, 'PC1=' + r.pc[0] + ' mostrado ' + r.pcMostrar[0]);

  let n3 = casoNotas_({ P1C1: 65, R1C1: 60 });
  t('3. RP1=60 < P1=65 → se rechaza', validarRegistro(n3, { R1C1: true }, ca).length === 1);

  r = calcularRegistro(casoNotas_({ P1C1: 65 }), ca);
  t('4. P1<70 sin RP → sin promedio ni CF definitivo', r.pc[0] === null && r.cf === null && r.estado === 'RECUPERACIÓN PENDIENTE');

  const todos = function (v) { const o = {}; for (let p = 1; p <= 4; p++) for (let c = 1; c <= 4; c++) o['P' + p + 'C' + c] = v; return o; };
  r = calcularRegistro(casoNotas_(todos(70)), ca);
  t('5. CF=70 → LOGRADO', r.cf === 70 && r.estado === 'LOGRADO');

  r = calcularRegistro(casoNotas_(Object.assign(todos(69), {})), Object.assign({}, ca, { usaRec: false }));
  t('6. CF=69 → habilita completiva', r.cf === 69 && r.comp.habilitada && r.estado === 'COMPLETIVA PENDIENTE');

  r = calcularRegistro(casoNotas_(Object.assign(todos(69), { CEC: 71 })), Object.assign({}, ca, { usaRec: false }));
  t('7. CF=69, CEC=71 → CCF=70 LOGRADO', r.comp.ccf === 70 && r.estado === 'LOGRADO' && r.etapa === 'COMPLETIVA' && !r.ext.habilitada);

  r = calcularRegistro(casoNotas_(Object.assign(todos(60), { CEC: 60 })), Object.assign({}, ca, { usaRec: false }));
  t('8. CCF<70 → habilita extraordinaria', r.comp.ccf === 60 && r.ext.habilitada && r.estado === 'EXTRAORDINARIA PENDIENTE');

  r = calcularRegistro(casoNotas_(Object.assign(todos(60), { CEC: 60, CEEX: 60 })), Object.assign({}, ca, { usaRec: false }));
  t('9. CEXF<70 → habilita especial', r.ext.cexf === 60 && r.esp.habilitada && r.estado === 'ESPECIAL PENDIENTE');

  r = calcularRegistro(casoNotas_(Object.assign(todos(60), { CEC: 60, CEEX: 60, CESP: 70 })), Object.assign({}, ca, { usaRec: false }));
  t('10. Especial=70 → LOGRADO (100 %, sin ponderar)', r.estado === 'LOGRADO' && r.A === 70 && r.etapa === 'ESPECIAL');

  r = calcularRegistro(casoNotas_(Object.assign(todos(60), { CEC: 60, CEEX: 60, CESP: 69 })), Object.assign({}, ca, { usaRec: false }));
  t('11. Especial<70 → NO LOGRADO', r.estado === 'NO LOGRADO' && r.R === 69);

  t('Redondeo 70.4→70, 70.5→71, 70.6→71', redondearEntero_(70.4) === 70 && redondearEntero_(70.5) === 71 && redondearEntero_(70.6) === 71);
  t('Truncado 68.75→68.7 (no 68.8)', truncar_(68.75, 1) === 68.7 && truncar_(70, 1) === 70);

  const cuatro = calcularCalificacionFinal([69.5, 69.5, 69.5, 69.5]);
  t('Cuatro PC de 69.5 → CF=70', cuatro.cf === 70);

  r = calcularRegistro(casoNotas_(Object.assign(todos(80), { CEC: 50 })), ca);
  t('CEC escrita sin estar habilitada → se ignora', r.comp.habilitada === false && r.estado === 'LOGRADO');
  t('CEC no habilitada se rechaza al guardar', validarRegistro(casoNotas_({ CEC: 50 }), { CEC: true }, ca).length === 1);

  r = calcularRegistro(casoNotas_(Object.assign(todos(80), { P4C4: null })), ca);
  t('Falta un período → INCOMPLETO, sin CF', r.cf === null && r.estado === 'INCOMPLETO');

  t('Situación anual', determinarSituacionFinal(['LOGRADO', 'LOGRADO'], 2) === 'PROMOVIDO' &&
    determinarSituacionFinal(['LOGRADO', 'NO LOGRADO'], 2) === 'REPITENTE' && determinarSituacionFinal(['LOGRADO', 'PENDIENTE'], 2) === 'PENDIENTE');
  const N = 'NO LOGRADO', L = 'LOGRADO';
  t('Situación de portada', determinarSituacionPortada([L, L, L, L, L], 5) === 'PROMOVIDO' &&
    determinarSituacionPortada([L, N, L, L, L], 5) === 'PROMOVIDO_PENDIENTE' &&
    determinarSituacionPortada([N, N, L, L, L], 5) === 'PROMOVIDO_PENDIENTE' &&
    determinarSituacionPortada([N, N, N, L, L], 5) === 'APLAZADO' &&
    determinarSituacionPortada([N, N, N, N, L], 5) === 'APLAZADO' &&
    determinarSituacionPortada([L, L, 'PENDIENTE', L, L], 5) === '' &&
    determinarSituacionPortada([L, L], 5) === '');
  t('Validación de nota', validarNota('101', { NOTA_MINIMA_ABS: 0, NOTA_MAXIMA: 100, NOTA_ENTERA: true }).ok === false &&
    validarNota('abc', { NOTA_MINIMA_ABS: 0, NOTA_MAXIMA: 100, NOTA_ENTERA: true }).ok === false &&
    validarNota('-1', { NOTA_MINIMA_ABS: 0, NOTA_MAXIMA: 100, NOTA_ENTERA: true }).ok === false &&
    validarNota('85', { NOTA_MINIMA_ABS: 0, NOTA_MAXIMA: 100, NOTA_ENTERA: true }).valor === 85);
  // Asistencia: el anual promedia solo los períodos que tienen información
  const idxA = { ago: 0, sep: 1, oct: 2, nov: 3, dic: 4, ene: 5, feb: 6, mar: 7, abr: 8, may: 9, jun: 10 };
  const perA = { regulares: [{ MESES: 'ago,sep,oct' }, { MESES: 'nov,dic,ene' }, { MESES: 'feb,mar' }, { MESES: 'abr,may,jun' }] };
  const fila = function (o) { const f = new Array(11).fill(''); Object.keys(o).forEach(function (m) { f[idxA[m]] = o[m]; }); return f; };
  let a = resumenAsistencia_([fila({ ago: 90, sep: 80, oct: 100 })], { idx: idxA }, perA);
  t('Asistencia: solo P1 con datos → anual = P1 (sin exigir los 4 períodos)', a.periodos[1] === 90 && a.periodos[2] === null && a.anual === 90);
  a = resumenAsistencia_([fila({ ago: 80, nov: 90 })], { idx: idxA }, perA);
  t('Asistencia: P1=80 y P2=90 → anual 85', a.anual === 85);
  a = resumenAsistencia_([fila({ ago: 80, nov: 90, feb: 70, abr: 100 })], { idx: idxA }, perA);
  t('Asistencia: 4 períodos → anual = (P1+P2+P3+P4)/4', a.anual === 85);
  a = resumenAsistencia_([], { idx: idxA }, perA);
  t('Asistencia: sin datos → anual vacío', a.anual === null);
  return res;
}
function ejecutarPruebas() {
  exigirDueno_();
  const r = pruebasLogica().concat(pruebasSeguridad_());
  const fallos = r.filter(function (x) { return !x.ok; });
  const txt = r.map(function (x) { return (x.ok ? '✔ ' : '✘ ') + x.nombre + (x.detalle ? ' (' + x.detalle + ')' : ''); }).join('\n');
  Logger.log(txt);
  try { SpreadsheetApp.getUi().alert(fallos.length ? 'HAY ' + fallos.length + ' PRUEBAS FALLIDAS\n\n' + txt : 'Todas las pruebas pasaron (' + r.length + ').\n\n' + txt); } catch (e) { /* sin UI */ }
  return fallos.length === 0;
}


/** Pruebas de seguridad básicas (hash, política de contraseñas, validadores). */
function pruebasSeguridad_() {
  const res = [], t = function (n, ok) { res.push({ nombre: n, ok: !!ok, detalle: '' }); };
  const h1 = hashClave_('Clave1234', 'sal'), h2 = hashClave_('Clave1234', 'sal'), h3 = hashClave_('Clave1235', 'sal');
  t('Hash determinista y distinto con otra clave', h1 === h2 && h1 !== h3 && h1.indexOf('v2$') === 0 && verificarClave_('Clave1234', 'sal', h1) && !verificarClave_('x', 'sal', h1));
  const rech = function (v) { try { validarPoliticaClave_(v); return false; } catch (e) { return e.name === 'ErrorApp'; } };
  t('PIN: solo 4 dígitos', rech('abc') && rech('12345') && rech('12a4') && rech('') && !rech('4821'));
  t('PIN evidente rechazado', rech('1111') && rech('1234') && rech('0000'));
  t('PIN temporal generado válido', /^\d{4}$/.test(claveTemporal_()) && !pinDebil_(claveTemporal_()));
  t('Correo inválido', !correoValido_('a@b') && correoValido_('a@b.co'));
  t('Comparación segura', iguales_('abc', 'abc') && !iguales_('abc', 'abd'));
  return res;
}
