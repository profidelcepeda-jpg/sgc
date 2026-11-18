/*********************************************************************
 * Subjects.gs — Catálogo de asignaturas y competencias
 *********************************************************************/

function asignaturasDeGrado_(grado) {
  return activos_(HOJA.ASIGNATURAS).filter(function (a) {
    const g = String(a.GRADOS || '').split(',').map(function (x) { return x.trim(); });
    return g.indexOf(String(grado)) >= 0 || String(a.GRADOS).trim() === '*';
  }).sort(function (x, y) { return (num_(x.ORDEN) || 99) - (num_(y.ORDEN) || 99); });
}
function asignaturaPorId_(id) {
  const a = porId_(HOJA.ASIGNATURAS, id);
  if (!a) throw new ErrorApp('La asignatura indicada no existe.');
  return a;
}
/** Competencias de una asignatura: las específicas reemplazan a las generales ('*') por código. */
function competenciasDe_(idAsig) {
  const todas = activos_(HOJA.COMPETENCIAS), porCodigo = {};
  todas.forEach(function (c) {
    const a = String(c.ID_ASIGNATURA || '*');
    if (a === '*') { if (!porCodigo[c.CODIGO]) porCodigo[c.CODIGO] = c; } else if (a === String(idAsig)) porCodigo[c.CODIGO] = c;
  });
  const lista = [];
  for (let i = 1; i <= SGA.COMPETENCIAS; i++) { const c = porCodigo['C' + i] || {}; lista.push({ codigo: 'C' + i, nombre: c.NOMBRE || ('Competencia ' + i), abrev: c.ABREV || ('C' + i) }); }
  return lista;
}
/** Parámetros de cálculo de UNA asignatura (hereda de la configuración global). */
function cfgAsignatura_(cfg, a) {
  const min = a && num_(a.NOTA_MINIMA) !== null ? num_(a.NOTA_MINIMA) : cfg.NOTA_MINIMA;
  const flag = function (campo, global) { return a && String(a[campo]).trim() !== '' ? (esSi_(a[campo]) && global) : global; };
  return { min: min, max: cfg.NOTA_MAXIMA, entera: cfg.NOTA_ENTERA, dec: cfg.DECIMALES_COMPETENCIA,
    usaRec: flag('USA_RECUPERACION', cfg.ACTIVAR_RECUPERACION), usaComp: flag('USA_COMPLETIVA', cfg.ACTIVAR_COMPLETIVA),
    usaExtra: flag('USA_EXTRAORDINARIA', cfg.ACTIVAR_EXTRAORDINARIA), usaEsp: flag('USA_ESPECIAL', cfg.ACTIVAR_ESPECIAL),
    pctCompCF: cfg.PCT_COMPLETIVA_CF, pctCompCEC: cfg.PCT_COMPLETIVA_CEC, pctExtCF: cfg.PCT_EXTRA_CF, pctExtCE: cfg.PCT_EXTRA_CE };
}

function defAsignaturas_() {
  return {
    titulo: 'Asignaturas', singular: 'Asignatura', hoja: HOJA.ASIGNATURAS, etiqueta: 'NOMBRE',
    permisos: { ver: 'asignaturas.ver', crear: 'asignaturas.crear', editar: 'asignaturas.editar' },
    columnas: [['ORDEN', 'Orden'], ['CODIGO', 'Código'], ['NOMBRE', 'Nombre'], ['AREA', 'Área'], ['GRADOS', 'Grados'], ['ESTADO', 'Estado']],
    campos: [
      { k: 'CODIGO', et: 'Código (ej. MAT)', tipo: 'patron', patron: '^[A-Za-z0-9]{2,8}$', req: true, msg: 'El código debe tener 2 a 8 letras o números.' },
      { k: 'NOMBRE', et: 'Nombre', tipo: 'texto', req: true, max: 100 }, { k: 'NOMBRE_REPORTE', et: 'Nombre en reportes', tipo: 'texto', max: 60 },
      { k: 'ABREV', et: 'Abreviatura', tipo: 'texto', max: 10 }, { k: 'AREA', et: 'Área curricular', tipo: 'texto', max: 80 },
      { k: 'GRADOS', et: 'Grados (ej. 1ro,2do,3ro o *)', tipo: 'texto', req: true, max: 60 },
      { k: 'ORDEN', et: 'Orden en listas', tipo: 'num', min: 1, max: 99 }, { k: 'ORDEN_BOLETIN', et: 'Orden en el boletín', tipo: 'num', min: 1, max: 99 },
      { k: 'USA_RECUPERACION', et: 'Usa recuperación', tipo: 'si_no', defecto: 'SI' }, { k: 'USA_COMPLETIVA', et: 'Usa completiva', tipo: 'si_no', defecto: 'SI' },
      { k: 'USA_EXTRAORDINARIA', et: 'Usa extraordinaria', tipo: 'si_no', defecto: 'SI' }, { k: 'USA_ESPECIAL', et: 'Usa evaluación especial', tipo: 'si_no', defecto: 'SI' },
      { k: 'NOTA_MINIMA', et: 'Nota mínima propia (opcional)', tipo: 'num', min: 1, max: 100 }
    ],
    buscar: ['CODIGO', 'NOMBRE', 'AREA'], filtros: [{ k: 'ESTADO', et: 'Estado', opciones: ['ACTIVO', 'INACTIVO'] }],
    decorar: function (items) { return items.sort(function (a, b) { return (num_(a.ORDEN) || 99) - (num_(b.ORDEN) || 99); }); },
    antes: function (o, ctx, nuevo, previo) {
      const x = Object.assign({}, previo || {}, o);
      o.CODIGO = String(x.CODIGO).toUpperCase();
      if (!x.NOMBRE_REPORTE) o.NOMBRE_REPORTE = x.NOMBRE;
      if (!x.ABREV) o.ABREV = String(x.CODIGO).slice(0, 4);
      const grados = String(x.GRADOS).split(',').map(function (g) { return g.trim(); }).filter(Boolean), validos = opcionesRef_('grados').map(function (g) { return g.id; });
      grados.forEach(function (g) { exigir_(g === '*' || validos.indexOf(g) >= 0, 'Grado no válido: ' + g + '.'); });
      o.GRADOS = grados.join(',');
    },
    unico: [['CODIGO']], msgUnico: 'Ya existe una asignatura con ese código.'
  };
}
function defCompetencias_() {
  return {
    titulo: 'Competencias', singular: 'Competencia', hoja: HOJA.COMPETENCIAS, etiqueta: 'NOMBRE',
    permisos: { ver: 'asignaturas.ver', crear: 'asignaturas.crear', editar: 'asignaturas.editar' },
    columnas: [['ID_ASIGNATURA_TXT', 'Asignatura'], ['CODIGO', 'Código'], ['NOMBRE', 'Nombre'], ['ABREV', 'Abrev.'], ['ESTADO', 'Estado']],
    campos: [
      { k: 'ID_ASIGNATURA', et: 'Asignatura (* = todas)', tipo: 'ref', ref: 'asignaturas*', req: true },
      { k: 'CODIGO', et: 'Código', tipo: 'enum', opciones: ['C1', 'C2', 'C3', 'C4'], req: true },
      { k: 'NOMBRE', et: 'Nombre', tipo: 'texto', req: true, max: 150 }, { k: 'ABREV', et: 'Abreviatura (aparece en los reportes)', tipo: 'texto', req: true, max: 10 },
      { k: 'ORDEN', et: 'Orden', tipo: 'num', min: 1, max: 9 }
    ],
    buscar: ['NOMBRE', 'ABREV'], filtros: [{ k: 'ESTADO', et: 'Estado', opciones: ['ACTIVO', 'INACTIVO'] }],
    ayuda: 'Las competencias con asignatura "*" aplican a todas; una competencia específica reemplaza a la general del mismo código.',
    decorar: function (items) { const a = {}; todos_(HOJA.ASIGNATURAS).forEach(function (x) { a[x.ID_ASIGNATURA] = x.NOMBRE; }); return items.map(function (c) { c.ID_ASIGNATURA_TXT = c.ID_ASIGNATURA === '*' ? 'Todas' : (a[c.ID_ASIGNATURA] || ''); return c; }); },
    antes: function (o) { if (!o.ORDEN) o.ORDEN = Number(String(o.CODIGO).slice(1)); },
    unico: [['ID_ASIGNATURA', 'CODIGO']], msgUnico: 'Ya existe esa competencia para la asignatura.'
  };
}
