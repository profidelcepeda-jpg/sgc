# Motor de Calificaciones — Especificación técnica de migración

**Fuente (legacy Google Apps Script, leída completa):**

- `SGA/legacy/Engine.js` — motor académico puro (funciones sin `SpreadsheetApp`).
- `SGA/legacy/Grades.js` — persistencia, permisos, grid de notas y asistencia.
- `SGA/legacy/Tests.js` — casos de prueba con valores esperados.
- `SGA/legacy/Config.js` — constantes `SGA.*`, `CAMPOS_ETAPAS`, `CAMPO_ETAPA`, esquema de hojas.
- Apoyo (para entender la entrada `ca`): `cfgAsignatura_()` en `SGA/legacy/Subjects.js`, `num_()` en `SGA/legacy/Utils.js`.

**Objetivo:** esta especificación es la base de la traducción a TypeScript y de las pruebas Vitest que deben garantizar **paridad numérica exacta** con el sistema original. Ninguna fórmula está parafraseada: todas están transcritas literalmente del código fuente.

---

## 1. Estructura de un registro de notas

### 1.1 Constantes que definen la estructura

`Config.js`:

```js
const SGA = {
  NOMBRE: 'SGA – Sistema de Gestión Académica',
  VERSION: '1.0.0',
  PERIODOS_REGULARES: 4,   // P1..P4 (estructura de columnas C1..C4 / R1..R4)
  COMPETENCIAS: 4,         // C1..C4 por asignatura
  ...
  MESES: ['ago', 'sep', 'oct', 'nov', 'dic', 'ene', 'feb', 'mar', 'abr', 'may', 'jun'],
  MAX_POR_PAGINA: 200
};
```

`Engine.js`:

```js
function camposNotas_() {
  const f = [];
  for (let p = 1; p <= 4; p++) { for (let c = 1; c <= 4; c++) f.push('P' + p + 'C' + c); for (let c = 1; c <= 4; c++) f.push('R' + p + 'C' + c); }
  return f;
}
const CAMPOS_ETAPAS = ['CEC', 'CEEX', 'CESP'];
function notasVacias_() { const n = {}; camposNotas_().concat(CAMPOS_ETAPAS).forEach(function (k) { n[k] = null; }); return n; }
```

`Config.js`:

```js
const CAMPO_ETAPA = { COMPLETIVA: 'CEC', EXTRAORDINARIA: 'CEEX', ESPECIAL: 'CESP' };
```

### 1.2 Registro lógico (lo que usa el motor)

Un registro de notas de un **estudiante + asignatura** es un objeto con `32 + 3 = 35` campos, todos `number` o `null` (`notasVacias_()` los inicializa a `null`):

| Campo(s) | Cantidad | Significado |
|---|---|---|
| `P1C1..P4C4` | 16 | Nota regular del período `p` (1..4) en la competencia `c` (1..4). «P» = nota principal («primaria»). |
| `R1C1..R4C4` | 16 | Recuperación del período `p` en la competencia `c` («RP» en la UI: recuperación de la nota P correspondiente). Solo existe si la asignatura usa recuperación y P < mínimo. |
| `CEC` | 1 | Nota de la etapa **C**ompletiva (Competencia Específica de Completiva). Es el «segundo 50 %» de la calificación completiva. |
| `CEEX` | 1 | Nota de la etapa **EX**traordinaria. Pesa 70 % en la C.EX.F. |
| `CESP` | 1 | Nota de la evaluación **ESP**ecial. Vale 100 % de la nota, sin ponderación. |

> **Nota sobre la persistencia física:** en la hoja `CALIFICACIONES` las notas **no se guardan en un solo registro**, sino en una fila por *estudiante + asignatura + período* (`ESQUEMA.CALIFICACIONES`): `C1..C4` son las notas P de ese período y `R1..R4` sus recuperaciones; `NOTA_ETAPA` guarda la nota de la etapa (CEC/CEEX/CESP) en la fila del período de etapa correspondiente (`COMP`, `EXTRA`, `ESP` en `PERIODOS_BASE`). El mapeo clave-física lo hace `destinoClave_()` (ver §6.2).

### 1.3 Períodos de etapa

```js
const PERIODOS_BASE = [
  ['P1', '1er Periodo', 'REGULAR', '', 1, 'ago,sep,oct'], ['P2', '2do Periodo', 'REGULAR', '', 2, 'nov,dic,ene'],
  ['P3', '3er Periodo', 'REGULAR', '', 3, 'feb,mar'], ['P4', '4to Periodo', 'REGULAR', '', 4, 'abr,may,jun'],
  ['COMP', 'Completivo', 'ETAPA', 'COMPLETIVA', 5, ''], ['EXTRA', 'Extraordinario', 'ETAPA', 'EXTRAORDINARIA', 6, ''],
  ['ESP', 'Evaluación especial', 'ETAPA', 'ESPECIAL', 7, '']
];
```

`CAMPO_ETAPA` vincula la etapa lógica del registro (`CEC`, `CEEX`, `CESP`) con el período físico de tipo `ETAPA`.

### 1.4 Parámetros de la asignatura (`ca`)

Todo el motor recibe `ca = cfgAsignatura_(cfg, asig)` (Subjects.js, transcrito para referencia):

```js
function cfgAsignatura_(cfg, a) {
  const min = a && num_(a.NOTA_MINIMA) !== null ? num_(a.NOTA_MINIMA) : cfg.NOTA_MINIMA;
  const flag = function (campo, global) { return a && String(a[campo]).trim() !== '' ? (esSi_(a[campo]) && global) : global; };
  return { min: min, max: cfg.NOTA_MAXIMA, entera: cfg.NOTA_ENTERA, dec: cfg.DECIMALES_COMPETENCIA,
    usaRec: flag('USA_RECUPERACION', cfg.ACTIVAR_RECUPERACION), usaComp: flag('USA_COMPLETIVA', cfg.ACTIVAR_COMPLETIVA),
    usaExtra: flag('USA_EXTRAORDINARIA', cfg.ACTIVAR_EXTRAORDINARIA), usaEsp: flag('USA_ESPECIAL', cfg.ACTIVAR_ESPECIAL),
    pctCompCF: cfg.PCT_COMPLETIVA_CF, pctCompCEC: cfg.PCT_COMPLETIVA_CEC, pctExtCF: cfg.PCT_EXTRA_CF, pctExtCE: cfg.PCT_EXTRA_CE };
}
```

| Parámetro | Origen (CONFIG_DEFECTO) | Valor por defecto |
|---|---|---|
| `min` | `NOTA_MINIMA` (o `NOTA_MINIMA` propio de la asignatura) | 70 |
| `max` | `NOTA_MAXIMA` | 100 |
| `entera` | `NOTA_ENTERA` | `'SI'` → `true` |
| `dec` | `DECIMALES_COMPETENCIA` | 1 |
| `usaRec` | `ACTIVAR_RECUPERACION` ∧ asignatura | SI |
| `usaComp` | `ACTIVAR_COMPLETIVA` ∧ asignatura | SI |
| `usaExtra` | `ACTIVAR_EXTRAORDINARIA` ∧ asignatura | SI |
| `usaEsp` | `ACTIVAR_ESPECIAL` ∧ asignatura | SI |
| `pctCompCF` / `pctCompCEC` | `PCT_COMPLETIVA_CF` / `PCT_COMPLETIVA_CEC` | 50 / 50 |
| `pctExtCF` / `pctExtCE` | `PCT_EXTRA_CF` / `PCT_EXTRA_CE` | 30 / 70 |

> La lógica del `flag`: si la asignatura tiene el campo **vacío** manda el valor global; si tiene algo escrito, la etapa se usa solo si la asignatura dice «SI» **y** el global también está en «SI» (una asignatura no puede activar una etapa que el sistema tiene desactivada).

---

## 2. Fórmulas del Engine.js (transcripción literal + explicación)

### 2.1 `redondear8_`

```js
function redondear8_(x) { return Math.round(x * 1e8) / 1e8; }
```

**Línea por línea:**
1. Multiplica por `10^8` (100 000 000).
2. `Math.round` redondea al entero más próximo (0.5 hacia arriba).
3. Divide de nuevo por `10^8`.

Es un **normalizador de coma flotante**: recorta a 8 decimales el residuo binario de operaciones como `suma / length` o `cf * 50 / 100` (p. ej. `68.75000000000001 → 68.75`). **Todas** las operaciones aritméticas del motor pasan por aquí antes de compararse o redondearse. Ojo: usa `1e8` (no `1e-9`; el `1e-9` pertenece a `truncar_`).

### 2.2 `redondearEntero_`

```js
/** Redondeo al entero más próximo: 70.4→70, 70.5→71, 70.6→71. */
function redondearEntero_(x) { return Math.floor(redondear8_(x) + 0.5); }
```

1. Normaliza a 8 decimales (`redondear8_`).
2. Suma `0.5` y trunca con `Math.floor`: es el redondeo «round-half-up» clásico, **no** `Math.round` directo (evita las anomalías de `Math.round` con `.5` en negativos y garantiza `70.5 → 71`).
3. Aplica solo a resultados finales de etapa (CF, CCF, CEXF).

### 2.3 `truncar_`

```js
/** Valor MOSTRADO con "dec" decimales, TRUNCADO (68.75→68.7). El valor real no se altera. */
function truncar_(x, dec) { const f = Math.pow(10, dec); return Math.floor(redondear8_(x) * f + 1e-9) / f; }
```

1. `f = 10^dec` (con `dec=1`, `f=10`).
2. Normaliza `x` a 8 decimales.
3. `x*f + 1e-9`: el epsilon `1e-9` compensa el error de coma flotante **hacia abajo** de `floor` (p. ej. `0.1+0.2 = 0.30000000000000004`; pero `68.7 * 10 = 686.9999999999999` truncaría a `68.6` sin el epsilon).
4. `Math.floor` **trunca** (no redondea): `68.75 → 68.7`, nunca `68.8`.
5. Divide por `f`.

Es el valor **mostrado** en el boletín (`pcMostrar`, columna `PCx` de `RESULTADOS`); el valor real (`pc`) nunca se altera. En `Tests.js`: `truncar_(68.75, 1) === 68.7 && truncar_(70, 1) === 70`.

### 2.4 `calcularNotaEfectiva`

```js
/** Una sola nota por período: P si ≥ mínimo; si P < mínimo, la RP (solo si RP ≥ P). Nunca se suman. */
function calcularNotaEfectiva(p, rp, minimo, usaRec) {
  if (p === null) return { valor: null, estado: 'VACIO', usoRP: false };
  if (p >= minimo || !usaRec) return { valor: p, estado: 'OK', usoRP: false };
  if (rp !== null) return { valor: Math.max(p, rp), estado: 'OK', usoRP: rp > p };   // una RP menor nunca baja la nota
  return { valor: null, estado: 'PENDIENTE_RP', usoRP: false };
}
```

**Línea por línea:**
1. `p === null` → la competencia está vacía: `{valor: null, estado: 'VACIO'}`.
2. `p >= minimo` (aprobada) **o** la asignatura no usa recuperación → la nota efectiva es `p` y no se usa la RP.
3. `p < minimo` y hay RP registrada → la nota efectiva es `Math.max(p, rp)`: **la recuperación nunca puede bajar la nota original**; si `rp > p` se marca `usoRP: true` (auditabilidad), si `rp <= p` se usa `p` pero el estado sigue `OK` (la RP se ignora silenciosamente en el cálculo, aunque la validación de entrada la rechaza).
4. `p < minimo` sin RP → `valor: null`, `estado: 'PENDIENTE_RP'` (bloquea el promedio).

### 2.5 `calcularPromedioCompetencia`

```js
/** Promedio REAL de una competencia (4 períodos). Si falta algo, null (nunca un parcial). */
function calcularPromedioCompetencia(efectivas) {
  let s = 0;
  for (let i = 0; i < efectivas.length; i++) { if (efectivas[i] === null) return null; s += efectivas[i]; }
  return s / efectivas.length;
}
```

1. Recorre las notas efectivas de una competencia en los 4 períodos.
2. Si **cualquiera** es `null` (vacía o `PENDIENTE_RP`), el promedio es `null`: **no se calculan promedios parciales**.
3. Si las 4 existen, promedio aritmético real `s/4`. Sin redondeo aquí (el redondeo de visualización es aparte). El resultado puede tener muchos decimales; `calcularRegistro` lo pasa por `truncar_` solo para mostrarlo.

### 2.6 `calcularCalificacionFinal`

```js
/** Calificación Final del Área: promedio de los promedios reales, redondeado al entero. */
function calcularCalificacionFinal(pcReales) {
  let s = 0;
  for (let i = 0; i < pcReales.length; i++) { if (pcReales[i] === null) return null; s += pcReales[i]; }
  const real = s / pcReales.length;
  return { real: real, cf: redondearEntero_(real) };
}
```

1. Si algún promedio de competencia (`pcReales`) es `null` → `null` (sin CF).
2. `real` = promedio aritmético de los 4 promedios reales (con decimales; **no** se trunca ni se redondea antes).
3. Devuelve el par `{real, cf}`: `real` se guarda con decimales (`CF_REAL` en `RESULTADOS`), `cf` es el entero redondeado (`redondearEntero_`) que gobierna la secuencia de etapas. Ejemplo de Tests.js: cuatro PC de 69.5 → real 69.5 → **CF 70**.

### 2.7 `calcularCompletiva`

```js
function calcularCompletiva(cf, cec, ca) {
  const base = redondear8_(cf * ca.pctCompCF / 100);
  if (cec === null) return { base: base, mitad: null, ccf: null };
  const mitad = redondear8_(cec * ca.pctCompCEC / 100);
  return { base: base, mitad: mitad, ccf: redondearEntero_(base + mitad) };
}
```

1. `base` = `CF × pctCompCF/100` (50 % por defecto), normalizado a 8 decimales.
2. Si `CEC` aún no está registrada → `ccf = null` (etapa pendiente), pero `base` ya está calculado.
3. `mitad` = `CEC × pctCompCEC/100` (50 % por defecto).
4. `ccf` = **redondeo al entero** de `base + mitad`. La calificación completiva es `50 % CF + 50 % CEC` redondeada al entero más próximo.

### 2.8 `calcularExtraordinaria`

```js
function calcularExtraordinaria(cf, ceex, ca) {
  const base = redondear8_(cf * ca.pctExtCF / 100);
  if (ceex === null) return { base: base, mitad: null, cexf: null };
  const mitad = redondear8_(ceex * ca.pctExtCE / 100);
  return { base: base, mitad: mitad, cexf: redondearEntero_(base + mitad) };
}
```

Idéntica a la completiva pero con los pesos de la extraordinaria: `30 % CF + 70 % CEEX` (por defecto). `cexf = null` mientras no se registre `CEEX`.

### 2.9 `calcularRegistro` (el orquestador)

```js
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
```

**Explicación paso a paso:**

1. **Inicialización.** `R` acumula el resultado completo: `periodos` (estado de cada período), `efectiva`/`vigente` (matrices 4×4), `pc`/`pcMostrar` (promedios de competencia real y mostrado), `cfReal`/`cf` (C.F. con decimales y entera), `comp`/`ext`/`esp` (etapas), `etapa` (etapa donde se logró o se falló), `A` (nota final aprobatoria) y `R` (nota final reprobatoria), `estado`/`situacion`.
2. **Períodos (p = 1..4).** Por cada competencia `c = 1..4`:
   - `efectiva`: resultado de `calcularNotaEfectiva(P, RP, min, usaRec)`.
   - `vigente`: variante usada para el *promedio del período que se muestra en la fila* — si P existe, es P, o `Math.max(P, RP)` si P < min y hay RP (con recuperación activada). Difiere de `efectiva` solo en que un P `< min` **sin RP** entra con su valor P en `vigente` (y baja el promedio del período) mientras que en `efectiva` es `null` y bloquea la competencia.
   - Contadores: `ing` (competencias con P ingresada), `pend` (con P < min y sin RP), `suma` (para el promedio del período sobre las `vigente` de competencias **ingresadas**).
   - `R.periodos[p-1]`: `promedio = redondear8_(suma/ing)` (con decimales; `null` si `ing === 0`) y `estado`: `'RECUPERACIÓN PENDIENTE'` / `'SIN NOTAS'` / `'INCOMPLETO'` / `'COMPLETADO'`.
3. **Promedios de competencia (PC).** Para cada `c`: `pc[c] = calcularPromedioCompetencia` sobre las notas efectivas de los 4 períodos (`null` si falta alguna); `pcMostrar[c] = truncar_(pc, ca.dec)` (truncado a `dec` decimales para mostrar, por defecto 1).
4. **C.F.** `calcularCalificacionFinal(R.pc)` → `cfReal` (decimales) y `cf` (entero).
5. **Sin CF** → `estado = 'RECUPERACIÓN PENDIENTE'` si hay RP pendientes, o `'INCOMPLETO'` si faltan notas. Fin.
6. **CF ≥ min** → `etapa 'CF'`, `A = cf`, `estado = 'LOGRADO'`. Las etapas posteriores quedan `habilitada: false` aunque haya CEC/CEEX/CESP escritos (se ignoran). Fin.
7. **CF < min — secuencia de etapas** (cada etapa solo se evalúa si la anterior no aprobó y no está pendiente):
   - **Completiva** (si `usaComp`): se habilita, se calcula `ccf`. Si `CEC` no está registrada → `pendiente = 'COMPLETIVA PENDIENTE'` (y se detiene la cadena). Si `ccf ≥ min` → `aprobado`, `etapa 'COMPLETIVA'`, `ultimo = ccf`.
   - **Extraordinaria** (si `usaExtra` y no aprobó/pendiente antes): igual con `cexf`; pendiente → `'EXTRAORDINARIA PENDIENTE'`.
   - **Especial** (si `usaEsp` y no aprobó/pendiente antes): `CESP` **vale 100 %, sin ponderación**; `ultimo = n.CESP`; pendiente → `'ESPECIAL PENDIENTE'`.
8. **Cierre:**
   - `aprobado` → `A = ultimo`, `estado = situacion = 'LOGRADO'`.
   - `pendiente` → `estado` = el string de pendiente; `A` y `R` quedan `null`.
   - Fallo en todas las etapas habilitadas → `R.R = ultimo` (la última calificación entera obtenida: la peor etapa final), `estado = situacion = 'NO LOGRADO'`.

> Detalle sutil: si `CF < min` y `usaComp` está activo pero `CEC = null`, la extraordinaria **no se habilita** (`pendiente` detiene la cadena). Y si `usaComp = false` (asignatura sin completiva), la cadena salta directamente a la extraordinaria.

### 2.10 `determinarSituacionFinal`

```js
/** Situación anual del estudiante a partir de las situaciones de sus áreas. */
function determinarSituacionFinal(situaciones, totalAreas) {
  if (situaciones.some(function (s) { return s === 'NO LOGRADO'; })) return 'REPITENTE';
  if (situaciones.length === totalAreas && situaciones.every(function (s) { return s === 'LOGRADO'; })) return 'PROMOVIDO';
  return 'PENDIENTE';
}
```

1. Un solo «NO LOGRADO» en cualquier área → el estudiante es **REPITENTE** (regla dura, gana sobre todo lo demás).
2. Todas las áreas (exactamente `totalAreas`) son «LOGRADO» → **PROMOVIDO**.
3. En otro caso (faltan áreas, hay pendientes de etapa) → **PENDIENTE**.

### 2.11 `determinarSituacionPortada`

```js
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
```

1. Constante de política: `MAX_PENDIENTES = 2`.
2. Si falta cualquier área (`length !== totalAreas`) → `''` (portada sin marcar).
3. Si alguna situación no es final (hay `PENDIENTE`, «…PENDIENTE» de etapa, etc.) → `''`.
4. `n` = áreas NO LOGRADAS: `0 → PROMOVIDO`; `1..2 → PROMOVIDO_PENDIENTE`; `≥3 → APLAZADO`.

### 2.12 `validarNota`

```js
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
```

1. Vacío (`''`, `null`, `undefined`) es válido y se normaliza a `null` (borrar una nota es legal).
2. `num_` (Utils.js) convierte el texto (admite coma decimal `replace(',', '.')`); si no es número → error de rango.
3. Rango: `0 ≤ n ≤ NOTA_MAXIMA` (el mínimo absoluto es **0**, no 70 — 70 es el mínimo de *aprobación*, no de entrada).
4. Si `NOTA_ENTERA` (config global), `Math.floor(n) !== n` → error «número entero».
5. Devuelve `{ok: true, valor: n}` con el número.

`cfgV` usado desde `guardarNotas_`: `{ NOTA_MINIMA_ABS: 0, NOTA_MAXIMA: cfg.NOTA_MAXIMA, NOTA_ENTERA: cfg.NOTA_ENTERA }`.

### 2.13 `validarRegistro` (validaciones cruzadas)

```js
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
```

**Línea por línea:**
1. De las claves **modificadas en esta operación** (`cambios`), agrupa las que casan con la regex `^[PR](\d)C(\d)$` por par `(p, c)` — así una P y su RP tocadas en la misma operación se validan como par.
2. Para cada par con RP presente (`RP === null` se ignora):
   - Asignatura sin recuperación → error.
   - P no registrada → error (la RP exige su P primero).
   - `P ≥ min` → la RP no está habilitada (no se recupera lo ya aprobado).
   - `RP < P` → **la recuperación no puede ser menor que la nota original** (regla institucional; el cálculo además la ignoraría por `Math.max`).
3. Etapas: **recalcula el registro completo** (`calcularRegistro(n, ca)`) y, si se escribió una nota de etapa (`cambios.CEC/CEEX/CESP`) no nula cuyo bloque `habilitada` correspondiente esté en `false`, la rechaza. Es decir: solo se puede escribir `CEC` si la CF está completa y `< min`; solo `CEEX` si la completiva se resolvió sin lograr (CCF `< min` o asignatura sin completiva); solo `CESP` si la C.EX.F. es `< min`.
4. Devuelve `[{campo, mensaje}]` (vacío = válido).

---

## 3. Competencias: base vs. específica (los grupos C1..C4)

En este SGA, **«competencia»** tiene un sentido concreto: cada asignatura tiene **4 competencias** (`SGA.COMPETENCIAS = 4`), catalogadas en la hoja `COMPETENCIAS` (`ESQUEMA.COMPETENCIAS = ['ID_COMPETENCIA', 'ID_ASIGNATURA', 'CODIGO', 'NOMBRE', 'ABREV', 'ORDEN', 'ESTADO']`).

- **Competencia base (C1..C4):** las 4 notas periódicas de la asignatura. La columna `Cx` de la hoja `CALIFICACIONES` es la nota del **período** en la competencia número `x` (el orden es el `ORDEN` del catálogo de competencias de la asignatura). Cada competencia base acumula su nota efectiva en los 4 períodos (P1..P4, con su RP si aplica) y su **promedio de competencia PCx** = promedio real de esas 4 notas efectivas. La C.F. es el promedio de los 4 PC. Es decir: la nota de la asignatura no es un promedio plano de 16 notas, sino un **promedio de promedios** (cada competencia pesa ¼, con independencia de cuántas notas tenga).
- **Competencia específica de etapa (CEC / CEEX / CESP):** son notas «específicas» de una **etapa de recuperación anual**, no de un período. No promedian con las bases; se combinan con la CF ya calculada mediante ponderaciones:
  - `CEC` — Calificación de la Etapa Completiva (`CAMPO_ETAPA.COMPLETIVA = 'CEC'`): entra al 50 % en la CCF (`50 % CF + 50 % CEC`).
  - `CEEX` — Calificación de la Etapa EXtraordinaria (`CAMPO_ETAPA.EXTRAORDINARIA = 'CEEX'`): 30 % CF + 70 % CEEX en la CEXF.
  - `CESP` — Calificación de la Etapa ESPecial (evaluación especial): **100 %**, sin ponderar.

> **Aclaración sobre «CC / CRP / CEC / CT»:** el código fuente (Config.js, Engine.js, Grades.js) **no usa** las siglas CC, CRP ni CT. La terminología real del sistema es: `C1..C4` (notas de las 4 competencias base por período), `R1..R4` (recuperaciones de esas competencias — en la UI se muestran como «RP»), y las etapas `CEC/CEEX/CESP`. Si el enunciado de migración menciona CC/CRP/CT, el mapeo equivalente sería: CC ≈ nota de competencia base (Cx), CRP ≈ recuperación de competencia (Rx / «RPx»), CT ≈ calificación de etapa. Cualquier campo adicional debe derivarse de estas 35 claves (`camposNotas_().concat(CAMPOS_ETAPAS)`), que son el universo cerrado de notas del sistema.

**Orden correcto de evaluación:** períodos P1→P4 → promedios de competencia PC1→PC4 → CF → (solo si CF < min) **COMPLETIVA → EXTRAORDINARIA → ESPECIAL**. Una etapa aprobada cierra la secuencia; ninguna etapa posterior se habilita (y `validarRegistro` rechaza escribir notas de etapas no habilitadas).

---

## 4. Reglas académicas consolidadas

1. **Promedio con decimales conservados.** PC y CF se calculan con decimales reales (`s / length` sin redondeo intermedio). El valor real se persiste (`CF_REAL`). Los únicos redondeos son: normalización a 8 decimales (`redondear8_`) para matar ruido de coma flotante, y el entero final de cada calificación de etapa.
2. **Promedio del período visible.** En `R.periodos[].promedio` el promedio se muestra **para cualquier período con al menos una nota** (`ing ? ... : null`), usando las notas `vigente` de las competencias ingresadas y normalizado con `redondear8_`. No se exige el período completo para mostrar su promedio de fila (a diferencia del PC, que sí exige las 4 notas efectivas).
3. **Promedio de competencia: todo o nada.** Si falta una sola nota efectiva de una competencia (P vacía, o P < min sin RP), el PC de esa competencia es `null` y, por cascada, la CF es `null` → estado `INCOMPLETO` o `RECUPERACIÓN PENDIENTE`. **Nunca se calcula un promedio parcial.**
4. **Redondeo final al entero.** CF, CCF y CEXF se redondean al entero más próximo con `Math.floor(x + 0.5)` (half-up: 70.4→70, 70.5→71, 70.6→71). Ejemplo clave: cuatro PC de 69.5 → CF = 70 (aprobado). El umbral (`cf >= ca.min`) se aplica sobre el **entero redondeado**, no sobre el real.
5. **Visualización truncada.** `pcMostrar` (y la columna `PCx` de RESULTADOS) trunca a `DECIMALES_COMPETENCIA` decimales (por defecto 1): 68.75 se muestra **68.7**, no 68.8. El valor real nunca cambia.
6. **Recuperación RP.** Solo aplica por período y por competencia cuando `P < min` y la asignatura usa recuperación. La nota efectiva del período es `Math.max(P, RP)`: **la recuperación nunca puede bajar la nota original** (y `validarRegistro` la rechaza si es menor). Las notas nunca se suman ni promedian P con RP.
7. **Habilitación de RP.** `validarRegistro` exige: recuperación activada para la asignatura, P registrada, y `P < min` (no se recupera lo aprobado).
8. **Secuencia de etapas (CF < min):** Completiva (`50 % CF + 50 % CEC`, redondeada al entero) → Extraordinaria (`30 % CF + 70 % CEEX`) → Especial (CESP = 100 %, sin ponderar). Cada una aprueba con `≥ min`; una etapa pendiente (nota de etapa sin registrar) detiene la cadena; una etapa aprobada impide habilitar las siguientes; el fallo de todas deja `NO LOGRADO` con `R` = la última calificación entera fallida.
9. **Notas de etapa escritas de más.** Si se escribe CEC con CF ≥ min (o ausente), el cálculo la **ignora** (`habilitada: false`) y `validarRegistro` la rechaza al guardar.
10. **Situaciones anuales** (`determinarSituacionFinal`): `REPITENTE` si hay ≥ 1 área «NO LOGRADO»; `PROMOVIDO` si todas las áreas son «LOGRADO»; `PENDIENTE` en cualquier otro caso.
11. **Situación de portada** (`determinarSituacionPortada`, regla adicional e independiente): solo se marca cuando todas las áreas tienen resultado final; `0` no logradas → `PROMOVIDO`; `1–2` → `PROMOVIDO_PENDIENTE` (`MAX_PENDIENTES = 2`); `≥3` → `APLAZADO`; si falta algo → `''`.
12. **Umbral de aprobación.** `min` = `NOTA_MINIMA` global (70) o el `NOTA_MINIMA` propio de la asignatura; máximo admisible de entrada = `NOTA_MAXIMA` (100) con piso absoluto 0; `NOTA_ENTERA` fuerza enteros en la entrada (el motor puede producir decimales internos igualmente).
13. **Rangos de entrada.** `validarNota` acepta vacío (borrar), rechaza no-números, `n < 0`, `n > NOTA_MAXIMA` y decimales si `NOTA_ENTERA`.
14. **Auditoría.** Cada cambio de nota escribe una entrada en `HISTORIAL` (`EDITAR_NOTA`) con valor anterior y nuevo; cada cambio de asistencia, `EDITAR_ASISTENCIA`.

---

## 5. Casos de prueba de Tests.js (base para Vitest)

Todos los casos de lógica viven en `pruebasLogica()` con `ca` fijo:

```js
const ca = { min: 70, max: 100, entera: true, dec: 1, usaRec: true, usaComp: true, usaExtra: true, usaEsp: true, pctCompCF: 50, pctCompCEC: 50, pctExtCF: 30, pctExtCE: 70 };
```

Constructor de casos (`casoNotas_`): parte de `notasVacias_()`, llena **todas** las P con 80 y aplica `overrides`:

```js
function casoNotas_(overrides) {
  const n = notasVacias_();
  for (let p = 1; p <= 4; p++) for (let c = 1; c <= 4; c++) n['P' + p + 'C' + c] = 80;
  Object.keys(overrides || {}).forEach(function (k) { n[k] = overrides[k]; });
  return n;
}
```

Helper `todos(v)`: objeto `{P1C1..P4C4: v}` (todas las P en `v`, RP nulas).

| # | Nombre del caso | Entradas (sobre base P* = 80, salvo indicación) | Aserción (valores esperados) |
|---|---|---|---|
| 1 | Todos ≥70 → LOGRADO | ninguna P modificada (todas 80) | `r.estado === 'LOGRADO' && r.cf === 80 && r.etapa === 'CF'` |
| 2 | P1=65, RP1=75 → nota efectiva 75 | `P1C1=65, R1C1=75` | `r.efectiva[0][0] === 75 && r.pc[0] === 78.75 && r.pcMostrar[0] === 78.7` |
| 3 | RP1=60 < P1=65 → se rechaza | `P1C1=65, R1C1=60` | `validarRegistro(n3, {R1C1: true}, ca).length === 1` |
| 4 | P1<70 sin RP → sin promedio ni CF definitivo | `P1C1=65` | `r.pc[0] === null && r.cf === null && r.estado === 'RECUPERACIÓN PENDIENTE'` |
| 5 | CF=70 → LOGRADO | `todos(70)` | `r.cf === 70 && r.estado === 'LOGRADO'` |
| 6 | CF=69 → habilita completiva | `todos(69)`, `ca.usaRec=false` | `r.cf === 69 && r.comp.habilitada && r.estado === 'COMPLETIVA PENDIENTE'` |
| 7 | CF=69, CEC=71 → CCF=70 LOGRADO | `todos(69), CEC=71`, `usaRec=false` | `r.comp.ccf === 70 && r.estado === 'LOGRADO' && r.etapa === 'COMPLETIVA' && !r.ext.habilitada` |
| 8 | CCF<70 → habilita extraordinaria | `todos(60), CEC=60`, `usaRec=false` | `r.comp.ccf === 60 && r.ext.habilitada && r.estado === 'EXTRAORDINARIA PENDIENTE'` |
| 9 | CEXF<70 → habilita especial | `todos(60), CEC=60, CEEX=60`, `usaRec=false` | `r.ext.cexf === 60 && r.esp.habilitada && r.estado === 'ESPECIAL PENDIENTE'` |
| 10 | Especial=70 → LOGRADO (100 %, sin ponderar) | `todos(60), CEC=60, CEEX=60, CESP=70`, `usaRec=false` | `r.estado === 'LOGRADO' && r.A === 70 && r.etapa === 'ESPECIAL'` |
| 11 | Especial<70 → NO LOGRADO | `todos(60), CEC=60, CEEX=60, CESP=69`, `usaRec=false` | `r.estado === 'NO LOGRADO' && r.R === 69` |
| 12 | Redondeo half-up | — | `redondearEntero_(70.4)===70 && redondearEntero_(70.5)===71 && redondearEntero_(70.6)===71` |
| 13 | Truncado de visualización | — | `truncar_(68.75,1)===68.7 && truncar_(70,1)===70` |
| 14 | Cuatro PC de 69.5 → CF=70 | `calcularCalificacionFinal([69.5,69.5,69.5,69.5])` | `cuatro.cf === 70` |
| 15 | CEC escrita sin estar habilitada → se ignora | `todos(80), CEC=50` | `r.comp.habilitada === false && r.estado === 'LOGRADO'` |
| 16 | CEC no habilitada se rechaza al guardar | `casoNotas_({CEC:50})`, cambios `{CEC:true}` | `validarRegistro(...).length === 1` |
| 17 | Falta un período → INCOMPLETO, sin CF | `todos(80), P4C4=null` | `r.cf === null && r.estado === 'INCOMPLETO'` |
| 18 | Situación anual | `[LOGRADO,LOGRADO]`→PROMOVIDO; `[LOGRADO,NO LOGRADO]`→REPITENTE; `[LOGRADO,PENDIENTE]`→PENDIENTE (totalAreas 2) | las tres igualdades |
| 19 | Situación de portada (5 áreas) | `[L,L,L,L,L]`→PROMOVIDO; `[L,N,L,L,L]`→PROMOVIDO_PENDIENTE; `[N,N,L,L,L]`→PROMOVIDO_PENDIENTE; `[N,N,N,L,L]`→APLAZADO; `[N,N,N,N,L]`→APLAZADO; `[L,L,'PENDIENTE',L,L]`→`''`; `[L,L]` vs total 5 → `''` | las siete igualdades |
| 20 | Validación de nota | `'101'`→ok=false; `'abc'`→ok=false; `'-1'`→ok=false; `'85'`→valor 85 (cfg: NOTA_MINIMA_ABS 0, NOTA_MAXIMA 100, NOTA_ENTERA true) | las cuatro igualdades |
| 21 | Asistencia: solo P1 con datos → anual = P1 | fila `{ago:90, sep:80, oct:100}`; períodos con MESES `ago,sep,oct / nov,dic,ene / feb,mar / abr,may,jun` | `a.periodos[1] === 90 && a.periodos[2] === null && a.anual === 90` |
| 22 | Asistencia: P1=80 y P2=90 → anual 85 | fila `{ago:80, nov:90}` | `a.anual === 85` |
| 23 | Asistencia: 4 períodos → anual = media | fila `{ago:80, nov:90, feb:70, abr:100}` → períodos 80/90/70/100 | `a.anual === 85` |
| 24 | Asistencia: sin datos → anual vacío | filas `[]` | `a.anual === null` |

Índices de meses usados en los casos de asistencia: `ago:0, sep:1, oct:2, nov:3, dic:4, ene:5, feb:6, mar:7, abr:8, may:9, jun:10`.

> `Tests.js` también contiene `pruebasSeguridad_()` (hash de contraseñas, PIN, correo, comparación segura) y `ejecutarPruebas()` (que las concatena); esas pertenecen al módulo de **seguridad/usuarios**, no al motor de calificaciones, y se documentan aquí solo como referencia de alcance.

---

## 6. Flujo de persistencia de Grades.js

### 6.1 Clave de grupo

```js
function claveGrupo_(ano, idSeccion, idAsig) { return ano + '|' + idSeccion + '|' + idAsig; }
```

Toda lectura/escritura de `CALIFICACIONES`, `RESULTADOS` y `ASISTENCIA` es selectiva por `CLAVE_GRUPO = ano|idSeccion|idAsignatura`.

### 6.2 Mapeo clave lógica → destino físico

```js
function destinoClave_(k, per) {
  const m = /^([PR])(\d)C(\d)$/.exec(k);
  if (m) { const p = per.regulares[Number(m[2]) - 1]; return p ? { periodo: p, col: (m[1] === 'P' ? 'C' : 'R') + m[3] } : null; }
  const etapa = Object.keys(CAMPO_ETAPA).filter(function (e) { return CAMPO_ETAPA[e] === k; })[0];
  const p = etapa ? per.etapas[etapa] : null;
  return p ? { periodo: p, col: 'NOTA_ETAPA' } : null;
}
```

- `P{p}C{c}` → fila del período regular `p`, columna `C{c}`; `R{p}C{c}` → columna `R{c}`.
- `CEC/CEEX/CESP` → fila del período de etapa (`COMP`/`EXTRA`/`ESP`), columna `NOTA_ETAPA`.
- Si el período no está configurado → `null` → error «El período de esta nota no está configurado».

### 6.3 Desdoblamiento de filas → registro lógico

```js
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
```

Agrupa las filas de `CALIFICACIONES` en `{ID_ESTUDIANTE: notas{P1C1..,CEC,CEEX,CESP}}`, en el orden de los períodos regulares del año (no del texto del código). Es la operación inversa exacta de `destinoClave_`.

### 6.4 `obtenerGrid_` (lectura del grid de notas)

```js
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
```

Flujo: exige `calificaciones.ver` → resuelve año/sección/asignatura (`exigirAsignaturaVisible_` valida con `asignaturasVisibles_` que el usuario pueda ver esa asignatura en esa sección) → exige que el año tenga exactamente 4 períodos regulares (`exigirPeriodos_`) → lee las filas del grupo por `CLAVE_GRUPO` → desdobla en registros lógicos → para cada estudiante activo calcula `calcularRegistro(n, ca)` **en el servidor** → arma el mapa `cerrados` por período/etapa (`ESTADO === 'CERRADO'`) → `puedeEditar` = (permiso registrar o editar) ∧ `puedeTrabajar_` (asignación docente). Devuelve todo precalculado: la interfaz **solo muestra resultados**.

### 6.5 `guardarNotas_` (escritura, con permisos por docente/asignación/período)

Contrato: `p = { ano, idSeccion, idAsignatura, filas:[{idEstudiante, cambios:{P1C1:'85', R1C1:''}}] }`. «Las filas inválidas se rechazan y se informan; las válidas se guardan» (el guardado es **por fila**, no transaccional por lote).

Fases (código transcrito arriba en §2/§1; aquí el resumen del flujo):

1. **Permiso base:** `tiene_(ctx,'calificaciones.registrar') || tiene_(ctx,'calificaciones.editar')`, si no → error `PERMISO`.
2. **Contexto:** `config_()`, año, sección, asignatura visible, períodos (4 regulares exigidos), `ca` de la asignatura, `cfgV` para `validarNota`, conjunto de claves permitidas (`camposNotas_().concat(CAMPOS_ETAPAS)`).
3. **Bloqueo:** todo ocurre dentro de `conBloqueo_(function(){...})` (LockService: evita escrituras concurrentes).
4. **Estado previo:** carga estudiantes activos de la sección, lee el grupo por `CLAVE_GRUPO`, desdobla `notas` (registro por estudiante) y `porKey` (`estudiante|período → fila`).
5. **Asignaciones y docente de cada período:** filtra `asignacionesActivas_(ano)` por sección+asignatura; `docDe(idPeriodo)` devuelve el ID_DOCENTE con esta prioridad: (a) asignación del docente actual (`ctx.idDocente`) para ese período o `'*'`; (b) cualquier asignación activa de ese período o `'*'`; (c) fallback `ctx.idDocente || ''`. Este docente se estampa en las filas **nuevas** de `CALIFICACIONES`.
6. **Por cada fila enviada (`p.filas`):**
   - Estudiante debe pertenecer a la sección; si no, error.
   - Parte de `antes` = notas actuales del estudiante (o `notasVacias_()`) y fusiona los `cambios`.
   - **Por cada cambio:**
     1. La clave debe estar en `permitidos` («Campo no válido»).
     2. `validarNota(valor, cfgV)` — formato/rango/entero («Debe introducir una calificación entre 0 y 100», «entero»).
     3. Si el valor validado es igual al anterior, **se ignora** (no hay escritura fantasma).
     4. `destinoClave_(k, per)` debe resolver a un período configurado.
     5. **Período cerrado:** si `dest.periodo.ESTADO === 'CERRADO'` y el usuario **no** tiene `calificaciones.cerrar` → rechazo («El período P1 está cerrado»).
     6. **Asignación docente:** `puedeTrabajar_(ctx, ano, idSeccion, idAsignatura, dest.periodo.ID_PERIODO)` debe dar cierto («No tiene asignada esta asignatura en ese período»). Esta es la validación por docente/asignación/período: el docente solo puede escribir en los períodos de sus asignaciones activas (`ID_PERIODO` concreto o `'*'`); los roles con `calificaciones.administrar`/`calificaciones.cerrar` pueden saltarse esto según su implementación en `Assignments.js` (línea 155: `function puedeTrabajar_(ctx, ano, idSeccion, idAsig, idPeriodo)`).
     7. **Permiso registrar vs editar:** si `antes[k] === null` se exige `calificaciones.registrar` (crear nota nueva); si ya tenía valor, se exige `calificaciones.editar` (modificar nota existente). Dos permisos distintos para alta y modificación.
     8. Si todo pasa: `n[k] = v.valor; cambios[k] = true`.
   - **Validación cruzada:** `validarRegistro(n, cambios, ca)` sobre el registro ya fusionado (pares P/RP y habilitación de etapas). Cualquier error de fila la descarta completa y la reporta con `{idEstudiante, campo, mensaje}`.
   - Si la fila no tiene cambios efectivos, se salta.
7. **Escritura en CALIFICACIONES:** por cada cambio se resuelve `dest` y la clave `estudiante|ID_PERIODO`; si no existe la fila se crea con `ID_CALIFICACION` nuevo, `CLAVE_GRUPO`, año, estudiante, **ID_DOCENTE = docDe(período)**, asignatura, curso, sección, período y `FECHA_CREACION`; si existe se marca para actualizar. En ambas vías: `o[dest.col] = valor` (vacío si `null`), `FECHA_MODIFICACION`, `MODIFICADO_POR = ctx.usuario`, y `historial_(..., 'EDITAR_NOTA', 'CALIFICACIONES', ..., valorAnterior, valorNuevo)`.
8. **Volcado:** `escribirFilas_` (actualizaciones) y `agregarFilas_` (nuevas) sobre la tabla del grupo.
9. **RESULTADOS:** `actualizarResultados_(ano, idSec, idAsig, guardados, ca)` solo para las filas guardadas.
10. `vaciarHistorial_()` y retorno `{ guardados: <n>, errores: [...] }`.

### 6.6 `RESULTADOS`: `filaResultado_`, `actualizarResultados_`, `reconstruirResultados_`

`RESULTADOS` es una hoja **derivada, de solo lectura**, con la proyección completa del cálculo (columnas: `PC1..PC4, CF_REAL, CF, CEC, CCF, CEEX, CEXF, CESP, ETAPA_LOGRO, NOTA_A, NOTA_R, ESTADO_RESULTADO`):

```js
function filaResultado_(t, id, ano, idSec, idEst, idAsig, notas, ca) {
  const r = calcularRegistro(notas, ca), v = function (x) { return x === null || x === undefined ? '' : x; };
  return filaDe_(t, { ID_RESULTADO: id, CLAVE_GRUPO: claveGrupo_(ano, idSec, idAsig), ANO_ESCOLAR: ano, ID_ESTUDIANTE: idEst, ID_ASIGNATURA: idAsig, ID_SECCION: idSec,
    PC1: v(r.pcMostrar[0]), PC2: v(r.pcMostrar[1]), PC3: v(r.pcMostrar[2]), PC4: v(r.pcMostrar[3]), CF_REAL: v(r.cfReal), CF: v(r.cf), CEC: v(notas.CEC), CCF: v(r.comp.ccf),
    CEEX: v(notas.CEEX), CEXF: v(r.ext.cexf), CESP: v(notas.CESP), ETAPA_LOGRO: v(r.etapa), NOTA_A: v(r.A), NOTA_R: v(r.R), ESTADO_RESULTADO: r.estado, FECHA_MODIFICACION: ahora_() });
}
```

- `PCx` guarda el valor **truncado** (`pcMostrar`), `CF_REAL` el real con decimales, `CF` el entero, y `CEC/CEEX/CESP` son las notas de etapa **escritas** (no las calculadas); `CCF/CEXF` las calificaciones de etapa; `ETAPA_LOGRO` la etapa donde se logró (o se falló); `NOTA_A/NOTA_R` las notas final aprobada/reprobada; `ESTADO_RESULTADO` el `estado` del registro. `v()` convierte `null/undefined` a `''` (celda vacía).

```js
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
```

Actualización **incremental**: solo los estudiantes guardados en la operación (`lista = guardados`); si el estudiante ya tiene fila de resultado se actualiza conservando su `ID_RESULTADO`; si no, se crea.

```js
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
```

`reconstruirResultados_` es la **recomputación total**: agrupa **todas** las filas de `CALIFICACIONES` por `CLAVE_GRUPO`, resuelve la asignatura de cada grupo, exige 4 períodos regulares del año, desdobla `notasPorEstudiante_`, recalcula `filaResultado_` para cada estudiante, **borra todo el contenido** de RESULTADOS debajo del encabezado y reescribe con IDs secuenciales `RES-000001...`. Se usa desde el menú SGA o tras cambiar reglas (CONFIG/asignaturas). Equivalente en la migración: un job de recálculo masivo `DELETE + INSERT` (o upsert masivo) sobre la tabla de resultados.

### 6.7 Asistencia

```js
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
```

- Estructura: **una fila por estudiante + asignatura + sección**, con una columna por **mes** escolar (`ago..jun`, los 11 meses de `SGA.MESES`); el valor es un **porcentaje 0–100**. `exigirPermiso_('asistencia.ver')`, asignatura visible, y `puedeEditar` = permiso `asistencia.registrar` ∧ asignación docente (`puedeTrabajar_`).
- Devuelve los meses del año, los períodos regulares con sus meses (`PERIODOS.MESES`, p. ej. P1 = `ago,sep,oct`) y por estudiante el mapa `{mes: porcentaje|null}`.

```js
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
```

Flujo: permiso `asistencia.registrar` + asignación (`puedeTrabajar_`, error `PERMISO` si no) → bajo bloqueo, por fila: estudiante válido; los meses desconocidos se ignoran; cada valor se valida como porcentaje 0–100 (vacío = borrar); solo escribe si el valor cambió (con auditoría `EDITAR_ASISTENCIA`); una fila con cualquier error se descarta entera (`malo`) y no se guarda (`hubo`/`malo`); actualiza o crea la fila del estudiante con `ID_ASISTENCIA` nuevo, `CLAVE_GRUPO`, año, estudiante, asignatura y sección.

```js
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
```

- Promedio **por período**: promedio de los valores (con datos) de los meses de `PERIODOS.MESES` de ese período, normalizado con `redondear8_`; sin datos → `null`.
- Promedio **anual**: promedio de **solo los períodos que ya tienen información** (un período sin datos no entra y no se exige que existan los 4). `null` si no hay ningún dato. (Casos 21–24 de Tests.js.)

---

## 7. Plan de traducción a TypeScript

### 7.1 Principios

1. **Puerto puro, sin reescritura.** `Engine.js` ya es lógica pura sin I/O: traducir 1:1 a módulos TS (`engine.ts`, `validators.ts`). Cero dependencias de framework, mismos nombres, mismas salidas.
2. **Tipos exactos:**

```ts
type Nota = number | null;
type RegistroNotas = Record<'P1C1' | ... | 'R4C4' | 'CEC' | 'CEEX' | 'CESP', Nota>; // 35 claves exactas de camposNotas_().concat(CAMPOS_ETAPAS)
interface ParamAsignatura { min: number; max: number; entera: boolean; dec: number;
  usaRec: boolean; usaComp: boolean; usaExtra: boolean; usaEsp: boolean;
  pctCompCF: number; pctCompCEC: number; pctExtCF: number; pctExtCE: number; }
```

Generar las 35 claves con el mismo bucle (`P{p}C{c}`, `R{p}C{c}`) y tiparlas como unión literal para que ninguna clave nueva se cuele.

3. **Aritmética de coma flotante — reglas críticas:**
   - `redondear8_`: conservar `Math.round(x * 1e8) / 1e8` **tal cual**. No «mejorarlo» con `toFixed` o `Number.EPSILON`: `toFixed` redondea distinto en casos borde y `Math.round(x/1e-8)` cambia resultados. Es la función que absorbe el ruido binario; cualquier alteración cambia los resultados en los `.00000000x`.
   - `truncar_`: conservar el epsilon `+ 1e-9` **antes** del `Math.floor` y después de `redondear8_`. Sin el epsilon, `truncar_(68.7, 1)` daría 68.6 en IEEE-754. Tampoco usar `Intl`/`toFixed` (redondean, no truncan).
   - `redondearEntero_`: mantener `Math.floor(redondear8_(x) + 0.5)` (half-up). **No** sustituir por `Math.round` (comportamiento distinto con negativos y con `.49999…`) ni por `Math.ceil`.
   - **Orden de operaciones intacto:** `cf * pct / 100` (no `cf * (pct/100)`), `suma/ing` sobre las mismas cantidades, y los promedios de promedios en el mismo orden (`PC` → CF). El redondeo y la asociatividad son parte del contrato.
   - Los umbrales (`>= min`) se comparan siempre **después** de `redondear8_`/`redondearEntero_`, con los valores ya normalizados, igual que el legacy.
   - En PostgreSQL, guardar `CF_REAL`, PC reales y notas como `NUMERIC(5,2)` pero **calcular en JS con `number`** y normalizar con `redondear8_` antes de persistir (no delegar el redondeo a SQL: `round()` de NUMERIC es half-away-from-zero y `numeric` no replica el error binario que `redondear8_` corrige).
4. **Semántica de `null`/vacío:** vacío de entrada (`''`, `null`, `undefined`) → `null` siempre (`num_`); `PC/CF/CCF/CEXF = null` significa «no calculable» y se persiste como `NULL` (nunca 0 ni cadena vacía; en `RESULTADOS` legacy se volcaba como `''`, en Postgres usar `NULL`).
5. **Mensajes de error:** reproducir los strings exactos de `validarNota`/`validarRegistro` (la UI y los tests los citan); mantener la distinción registrar/editar y los códigos `PERMISO`.
6. **Persistencia (Node+Postgres):** tablas equivalentes a `CALIFICACIONES` (una fila por estudiante+asignatura+período con `C1..C4, R1..R4, NOTA_ETAPA`) y `RESULTADOS` como tabla derivada (vista materializada o tabla recalculada en el mismo `UPDATE` de notas, dentro de la transacción que reemplaza `conBloqueo_`). La recomputación total (`reconstruirResultados_`) debe existir como job administrativo con el mismo contrato (IDs `RES-XXXXXX` estables o regenerados, y estado previo borrado).
7. **Permisos (middleware en lugar de `tiene_/exigir_`):** un guard por endpoint que replique exactamente las capas de `guardarNotas_`: permiso base (registrar|editar) → destino de clave válido → período no cerrado (salvo `calificaciones.cerrar`) → asignación docente del período (`puedeTrabajar_`) → registrar si la celda estaba vacía, editar si ya tenía valor. La validación académica (`validarRegistro`) es independiente de los permisos y se ejecuta sobre el registro fusionado de la fila.

### 7.2 Pruebas Vitest obligatorias (paridad con el legacy)

**A. Golden tests — los 24 casos de Tests.js (§5) transcritos literal.** Cada fila de la tabla es un `it()` con las mismas entradas y las mismas aserciones exactas (incluidos los literales: `78.75`, `78.7`, `70`, `ccf === 70`, `r.R === 69`, etc.). Estos tests son el **contrato de paridad**: si pasan, el motor es equivalente.

**B. Tests unitarios de redondeo (regresión de coma flotante):**
- `redondear8_`: `x = 68.75000000000001 → 68.75`; `0.1+0.2` pasa por `redondear8_` antes de compararse con `0.3`.
- `truncar_`: `truncar(68.75,1)=68.7`; `truncar(70,1)=70`; con `x = 0.30000000000000004` y `dec=1` → `0.3` (el epsilon rescata el floor); `dec=2` con `1.005` → `1` (trunca, no redondea).
- `redondearEntero_`: 70.4→70, 70.5→71, 70.6→71; negativos si aplica; 69.5→70.
- Test de **invariante**: para N registros aleatorios (fuzzing), `pcMostrar === truncar(pc, dec)` y `cf === Math.floor(redondear8(cfReal)+0.5)`, y `cf` calculada en el puerto TS **coincide bit a bit** con una implementación espejo del JS legacy ejecutada con los mismos datos (comparar con `Object.is`).

**C. Tests de cascada del registro:**
- CF completa ≥ min con CEC/CEEX/CESP escritos → se ignoran (`habilitada: false`).
- CF < min sin CEC → `COMPLETIVA PENDIENTE` y extraordinaria NO habilitada (la cadena se detiene).
- CCF < min con completiva activa → extraordinaria habilitada; CCF ≥ min → extraordinaria NO habilitada.
- Asignaturas con `usaComp/usaExtra/usaEsp = false` → la cadena salta etapas (ej. CF 69 sin completiva → `EXTRAORDINARIA PENDIENTE` con CEEX presente, o `NO LOGRADO` con R=CF si nada aplica).
- Vigente vs efectiva: P=65 sin RP → `efectiva null` pero `vigente 65` y el promedio del período usa 65.
- `estado` de período: SIN NOTAS / INCOMPLETO / COMPLETADO / RECUPERACIÓN PENDIENTE.

**D. Tests de validación:**
- `validarNota`: vacío→null; `'85,5'` (coma) → 85.5 si decimales permitidos; 0 y 100 válidos; -1, 101, 'abc' rechazados; decimal rechazado con `NOTA_ENTERA`.
- `validarRegistro`: las 4 reglas de RP (sin recuperación, P faltante, P ≥ min, RP < P) y las 3 de etapas no habilitadas; y que los errores citan el `campo` correcto (`R1C1`, `CEC`, …).
- Caso #3 (RP 60 < P 65) y #16 (CEC con CF=80) como tests atómicos.

**E. Tests de situaciones:**
- `determinarSituacionFinal` (3 ramas) y `determinarSituacionPortada` (7 casos del test #19, incluidos los que devuelven `''`).
- Caso frontera del umbral de portada: exactamente 2 NO LOGRADO → `PROMOVIDO_PENDIENTE`; 3 → `APLAZADO`.

**F. Tests de asistencia (`resumenAsistencia_`):**
- Casos 21–24 (P1 sola, dos períodos, cuatro períodos, sin datos).
- Meses fuera de `PERIODOS.MESES` no cuentan; valores `null`/vacíos se saltan; el anual promedia solo los períodos con datos (regla no intuitiva: 80/90/70/**null** → anual 80, no 60).

**G. Tests de integración de persistencia (con DB de prueba):**
- `guardarNotas`: fila nueva vs actualización (`C1..C4/R1..R4/NOTA_ETAPA` en la fila del período correcto), `ID_DOCENTE` estampado según `docDe`, auditoría, permiso registrar-vs-editar por celda, período cerrado, asignación por período, rechazo parcial de filas inválidas (las válidas sí se guardan).
- `actualizarResultados` incremental (conserva `ID_RESULTADO` existentes) y `reconstruirResultados` total (misma proyección que `filaResultado_`, con `NULL` donde el legacy escribía vacío).
- Paridad de `RESULTADOS`: para un dataset de golden, las columnas `PC1..PC4/CF_REAL/CF/CCF/CEXF/NOTA_A/NOTA_R/ESTADO_RESULTADO` del sistema nuevo deben coincidir valor por valor con las generadas por el legacy.

**H. Estrategia de paridad global:** exportar del Apps Script un dataset de registros reales (CALIFICACIONES + RESULTADOS) a JSON; en Vitest, alimentar el motor TS con las entradas y comparar las salidas completas (`calcularRegistro`) con las de `RESULTADOS` del sistema en producción. Ese «snapshot del mundo real» es la prueba definitiva de migración.

---

### Resumen ejecutivo de reglas clave

- **35 campos**: `P{1..4}C{1..4}` (notas), `R{1..4}C{1..4}` (recuperaciones), `CEC/CEEX/CESP` (etapas). Cuatro períodos, cuatro competencias por asignatura; la nota de la asignatura es el **promedio de los promedios de competencia**, no un promedio plano.
- **Nota efectiva por período**: `P` si `P ≥ min`; si `P < min` y hay RP, `Math.max(P, RP)` (la recuperación jamás baja la nota); si `P < min` sin RP, la competencia queda `null` y **bloquea** todo el cálculo posterior (estado `RECUPERACIÓN PENDIENTE`).
- **Decimales**: PC y CF_REAL conservan decimales; lo **mostrado** se trunca a 1 decimal (68.75→68.7); la calificación de etapa (CF/CCF/CEXF) se **redondea al entero** half-up (`floor(x+0.5)`, 70.5→71).
- **Secuencia de etapas** (solo si `CF < min`): Completiva `50%CF+50%CEC` → Extraordinaria `30%CF+70%CEEX` → Especial `CESP = 100%` sin ponderar; `≥ 70` (o el `min` de la asignatura) aprueba; una etapa pendiente detiene la cadena; una aprobada cierra la secuencia; el fallo total → `NO LOGRADO` con `R` = última nota entera fallida.
- **Habilitación estricta de escrituras**: RP solo si P < min (y RP ≥ P); CEC/CEEX/CESP solo si la etapa anterior las habilita; `validarRegistro` recalcula el registro completo para decidirlo.
- **Situaciones**: REPITENTE con ≥1 área no lograda; PROMOVIDO si todas logradas; PENDIENTE si falta algo. Portada: 0 no logradas → PROMOVIDO; 1–2 → PROMOVIDO_PENDIENTE; ≥3 → APLAZADO; solo si todas las áreas tienen resultado final.
- **Persistencia**: fila por estudiante+asignatura+**período** (C1..C4/R1..R4/NOTA_ETAPA), clave de grupo `año|sección|asignatura`, permisos por capas (registrar vs editar, período cerrado, asignación docente por período), RESULTADOS derivado recalculado en cada guardado y reconstruible por completo, y asistencia mensual (0–100 %) con promedios por período y anual sobre **solo los períodos con datos**.

---

### Guardado por lotes (POST /api/grades/batch)

La grilla envía todas las celdas editadas en una sola petición:

```json
{ "ano": "...", "seccion": "...", "asignatura": "...",
  "filas": [ { "idEstudiante": "...", "cambios": { "P1C1": 85 } } ] }
```

**Semántica: guardado parcial con informe por fila.** Cada estudiante se valida
y se persiste en su propia transacción. Si una fila falla, las anteriores ya
quedaron guardadas y el cliente recibe:

```json
{ "ok": true, "resultados": [ { "estudiante": "EST-...", "errores": [ { "campo": "R1C1", "mensaje": "..." } ] } ] }
```

Los estudiantes sin errores no aparecen en `resultados`. Esta decisión es
deliberada: permite corregir una celda inválida sin perder el resto del trabajo
del docente. **No debe cambiarse a todo-o-nada sin rediseñar la interfaz**, que
hoy informa los errores por estudiante. El motor de cálculo no participa en esta
decisión: se ejecuta igual por estudiante, después de validar la fila.

