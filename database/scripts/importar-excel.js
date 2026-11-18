// importar-excel.js — Convierte el Excel real del SGA (exportado de Google Sheets)
// en un seed JSON normalizado para el esquema Prisma de SGA/database/prisma/schema.prisma.
//
// Uso:  node scripts/importar-excel.js <ruta-al-xlsx>
// Salida: seeds/sga-seed.json + informe de inconsistencias en consola.
//
// Reglas:
// - No altera ningún dato: transfiere valores tal cual (fechas a ISO, CSV a listas).
// - No vuelca HASH/SALT al seed (las credenciales se recrean con hash nuevo + rehash).
// - Ignora las hojas SESIONES/ERRORES/HISTORIAL como datos vivos (se migran a auditoría
//   histórica aparte) y ASISTENCIA/LEEME (sin datos / metadatos).

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ABRIR = '<SESIONES_CERRADAS_O_EXPORADAS>'; // marcador no usado

function leerHoja(wb, nombre) {
  const ws = wb.getWorksheet(nombre);
  if (!ws) return { headers: [], rows: [] };
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, n) => { headers[n - 1] = String(c.value == null ? '' : c.value).trim(); });
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (r, n) => {
    if (n === 1) return;
    const o = {};
    headers.forEach((h, i) => {
      let v = r.values[i + 1];
      if (v != null && typeof v === 'object') {
        if (v.result !== undefined) v = v.result;
        else if (v.richText) v = v.richText.map(t => t.text).join('');
        else if (v.text) v = v.text;
      }
      o[h] = v == null || v === '' ? null : v;
    });
    rows.push(o);
  });
  return { headers: headers.filter(Boolean), rows };
}

function fecha(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  // formato legado 'yyyy-MM-dd HH:mm:ss'
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (m) return new Date(m[1] + 'T' + m[2] + 'Z').toISOString();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function listaCsv(v) {
  if (v == null) return [];
  return String(v).split(',').map(x => x.trim()).filter(Boolean);
}

function nota(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v) {
  const s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'SI' || s === 'TRUE' || s === 'SÍ';
}

(async () => {
  const ruta = process.argv[2];
  if (!ruta || !fs.existsSync(ruta)) {
    console.error('Uso: node scripts/importar-excel.js <ruta-al-xlsx>');
    process.exit(1);
  }
  const avisos = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);

  const H = {};
  ['CONFIG','USUARIOS','ROLES','PERMISOS','ROL_PERMISOS','DOCENTES','CURSOS','SECCIONES','ESTUDIANTES','INSCRIPCIONES','ASIGNATURAS','COMPETENCIAS','ASIGNACIONES','TUTORIAS','PERIODOS','CALIFICACIONES','OBSERVACIONES','RESULTADOS','HISTORIAL']
    .forEach(n => { H[n] = leerHoja(wb, n); });

  const seed = { version: 1, origen: path.basename(ruta), generado: new Date().toISOString(), tablas: {} };

  // ── CONFIG ──
  seed.tablas.config = H.CONFIG.rows.map(r => ({
    clave: r.CLAVE, valor: r.VALOR == null ? '' : String(r.VALOR), descripcion: r.DESCRIPCION, fechaModificacion: fecha(r.FECHA_MODIFICACION),
  }));

  // ── Seguridad ──
  seed.tablas.roles = H.ROLES.rows.map(r => ({
    id: r.ID_ROL, nombre: r.NOMBRE, descripcion: r.DESCRIPCION, esSistema: bool(r.ES_SISTEMA),
    estado: r.ESTADO || 'ACTIVO', creado: fecha(r.FECHA_CREACION), modificado: fecha(r.FECHA_MODIFICACION),
  }));
  seed.tablas.permisos = H.PERMISOS.rows.map(r => ({ id: r.ID_PERMISO, modulo: r.MODULO, descripcion: r.DESCRIPCION }));
  seed.tablas.rolPermisos = H.ROL_PERMISOS.rows.map(r => ({ roleId: r.ID_ROL, permissionId: r.ID_PERMISO }));

  seed.tablas.teachers = H.DOCENTES.rows.map(r => ({
    id: r.ID_DOCENTE, titulo: r.TITULO, nombres: r.NOMBRES, apellidos: r.APELLIDOS,
    nombreCompleto: r.NOMBRE_COMPLETO, correo: r.CORREO, telefono: r.TELEFONO,
    estado: r.ESTADO || 'ACTIVO', creado: fecha(r.FECHA_CREACION), modificado: fecha(r.FECHA_MODIFICACION),
  }));

  // ── Estructura escolar ──
  const anos = new Set();
  H.CURSOS.rows.forEach(r => anos.add(String(r.ANO_ESCOLAR)));
  H.PERIODOS.rows.forEach(r => anos.add(String(r.ANO_ESCOLAR)));
  seed.tablas.schoolYears = [...anos].map(a => ({ id: a }));

  seed.tablas.courses = H.CURSOS.rows.map(r => ({
    id: r.ID_CURSO, schoolYearId: String(r.ANO_ESCOLAR), nivel: r.NIVEL, grado: r.GRADO,
    estado: r.ESTADO || 'ACTIVO', creado: fecha(r.FECHA_CREACION), modificado: fecha(r.FECHA_MODIFICACION),
  }));
  seed.tablas.sections = H.SECCIONES.rows.map(r => ({
    id: r.ID_SECCION, courseId: r.ID_CURSO, seccion: r.SECCION,
    estado: r.ESTADO || 'ACTIVO', creado: fecha(r.FECHA_CREACION), modificado: fecha(r.FECHA_MODIFICACION),
  }));
  seed.tablas.students = H.ESTUDIANTES.rows.map(r => ({
    id: r.ID_ESTUDIANTE, matricula: r.MATRICULA, nombres: r.NOMBRES, apellidos: r.APELLIDOS,
    nombreCompleto: r.NOMBRE_COMPLETO, sexo: r.SEXO, fechaNacimiento: fecha(r.FECHA_NACIMIENTO),
    estado: r.ESTADO || 'ACTIVO', creado: fecha(r.FECHA_CREACION), modificado: fecha(r.FECHA_MODIFICACION),
  }));
  seed.tablas.enrollments = H.INSCRIPCIONES.rows.map(r => ({
    id: r.ID_INSCRIPCION, schoolYearId: String(r.ANO_ESCOLAR), studentId: r.ID_ESTUDIANTE,
    courseId: r.ID_CURSO, sectionId: r.ID_SECCION, numLista: nota(r.NUM_LISTA),
    estado: r.ESTADO || 'ACTIVO', creado: fecha(r.FECHA_CREACION), modificado: fecha(r.FECHA_MODIFICACION),
  }));
  seed.tablas.subjects = H.ASIGNATURAS.rows.map(r => ({
    id: r.ID_ASIGNATURA, codigo: r.CODIGO, nombre: r.NOMBRE, nombreReporte: r.NOMBRE_REPORTE,
    abrev: r.ABREV, area: r.AREA, grados: listaCsv(r.GRADOS), orden: nota(r.ORDEN),
    ordenBoletin: nota(r.ORDEN_BOLETIN) || nota(r.ORDEN),
    usaRecuperacion: bool(r.USA_RECUPERACION), usaCompletiva: bool(r.USA_COMPLETIVA),
    usaExtraordinaria: bool(r.USA_EXTRAORDINARIA), usaEspecial: bool(r.USA_ESPECIAL),
    notaMinima: nota(r.NOTA_MINIMA), estado: r.ESTADO || 'ACTIVO',
    creado: fecha(r.FECHA_CREACION), modificado: fecha(r.FECHA_MODIFICACION),
  }));
  seed.tablas.competences = H.COMPETENCIAS.rows.map(r => ({
    id: r.ID_COMPETENCIA, subjectId: r.ID_ASIGNATURA === '*' ? null : r.ID_ASIGNATURA,
    codigo: r.CODIGO, nombre: r.NOMBRE, abrev: r.ABREV, orden: nota(r.ORDEN), estado: r.ESTADO || 'ACTIVO',
  }));
  seed.tablas.periods = H.PERIODOS.rows.map(r => ({
    id: r.ID_PERIODO, schoolYearId: String(r.ANO_ESCOLAR), codigo: r.CODIGO, nombre: r.NOMBRE,
    tipo: r.TIPO, etapa: r.ETAPA || null, orden: nota(r.ORDEN), meses: listaCsv(r.MESES),
    estado: r.ESTADO || 'ABIERTO', creado: fecha(r.FECHA_CREACION), modificado: fecha(r.FECHA_MODIFICACION),
  }));

  seed.tablas.teachingAssignments = H.ASIGNACIONES.rows.map(r => ({
    id: r.ID_ASIGNACION, schoolYearId: String(r.ANO_ESCOLAR), teacherId: r.ID_DOCENTE,
    subjectId: r.ID_ASIGNATURA, courseId: r.ID_CURSO, sectionId: r.ID_SECCION,
    periodId: !r.ID_PERIODO || r.ID_PERIODO === '*' ? null : r.ID_PERIODO,
    estado: r.ESTADO || 'ACTIVO', creado: fecha(r.FECHA_CREACION), modificado: fecha(r.FECHA_MODIFICACION),
  }));
  seed.tablas.tutoringAssignments = H.TUTORIAS.rows.map(r => ({
    id: r.ID_TUTORIA, schoolYearId: String(r.ANO_ESCOLAR), teacherId: r.ID_DOCENTE,
    courseId: r.ID_CURSO, sectionId: r.ID_SECCION, estado: r.ESTADO || 'ACTIVA',
    creado: fecha(r.FECHA_CREACION), modificado: fecha(r.FECHA_MODIFICACION),
  }));

  // ── Calificaciones y resultados (integridad académica: sin transformaciones) ──
  seed.tablas.gradeRecords = H.CALIFICACIONES.rows.map(r => ({
    id: r.ID_CALIFICACION, schoolYearId: String(r.ANO_ESCOLAR), studentId: r.ID_ESTUDIANTE,
    teacherId: r.ID_DOCENTE, subjectId: r.ID_ASIGNATURA, courseId: r.ID_CURSO, sectionId: r.ID_SECCION,
    periodId: r.ID_PERIODO,
    c1: nota(r.C1), c2: nota(r.C2), c3: nota(r.C3), c4: nota(r.C4),
    r1: nota(r.R1), r2: nota(r.R2), r3: nota(r.R3), r4: nota(r.R4),
    notaEtapa: nota(r.NOTA_ETAPA),
    creado: fecha(r.FECHA_CREACION), modificado: fecha(r.FECHA_MODIFICACION), modificadoPor: r.MODIFICADO_POR,
  }));
  seed.tablas.resultSummaries = H.RESULTADOS.rows.map(r => ({
    id: r.ID_RESULTADO, schoolYearId: String(r.ANO_ESCOLAR), studentId: r.ID_ESTUDIANTE,
    subjectId: r.ID_ASIGNATURA, sectionId: r.ID_SECCION,
    pc1: nota(r.PC1), pc2: nota(r.PC2), pc3: nota(r.PC3), pc4: nota(r.PC4),
    cfReal: nota(r.CF_REAL), cf: nota(r.CF),
    cec: nota(r.CEC), ccf: nota(r.CCF), ceex: nota(r.CEEX), cexf: nota(r.CEXF), cesp: nota(r.CESP),
    etapaLogro: r.ETAPA_LOGRO || null, notaA: nota(r.NOTA_A), notaR: nota(r.NOTA_R),
    estadoResultado: r.ESTADO_RESULTADO || 'INCOMPLETO', fechaModificacion: fecha(r.FECHA_MODIFICACION) || new Date(0).toISOString(),
  }));
  seed.tablas.observations = H.OBSERVACIONES.rows.map(r => ({
    id: r.ID_OBSERVACION, schoolYearId: String(r.ANO_ESCOLAR), studentId: r.ID_ESTUDIANTE,
    courseId: r.ID_CURSO, sectionId: r.ID_SECCION, teacherId: r.ID_DOCENTE,
    subjectId: r.ID_ASIGNATURA, periodId: r.ID_PERIODO, tipo: r.TIPO, fecha: fecha(r.FECHA),
    observacion: r.OBSERVACION, estado: r.ESTADO || 'ACTIVA',
    creado: fecha(r.FECHA_CREACION), modificado: fecha(r.FECHA_MODIFICACION), creadoPor: r.CREADO_POR,
  }));

  // Usuarios: sin HASH/SALT (las credenciales se crean de nuevo con rehash al primer login)
  seed.tablas.users = H.USUARIOS.rows.map(r => ({
    id: r.ID_USUARIO, nombre: r.NOMBRE, apellidos: r.APELLIDOS, correo: r.CORREO,
    usuario: r.USUARIO == null ? null : String(r.USUARIO), rolId: r.ROL, teacherId: r.ID_DOCENTE,
    permisosExtra: listaCsv(r.PERMISOS_EXTRA), permisosDenegados: listaCsv(r.PERMISOS_DENEGADOS),
    estado: r.ESTADO || 'ACTIVO', creado: fecha(r.FECHA_CREACION), modificado: fecha(r.FECHA_MODIFICACION),
    ultimoAcceso: fecha(r.ULTIMO_ACCESO),
  }));

  // Auditoría histórica (se conserva como historia; el nuevo sistema escribe la suya)
  seed.tablas.auditLogHistorico = H.HISTORIAL.rows.map(r => ({
    fecha: fecha(r.FECHA), usuario: r.USUARIO, accion: r.ACCION, modulo: r.MODULO,
    idRegistro: r.ID_REGISTRO, descripcion: r.DESCRIPCION,
    valorAnterior: r.VALOR_ANTERIOR == null ? null : String(r.VALOR_ANTERIOR),
    valorNuevo: r.VALOR_NUEVO == null ? null : String(r.VALOR_NUEVO),
  }));

  // ── Verificación de integridad ──
  const ids = {};
  const reg = (tabla, filas, campo) => { ids[tabla] = new Set(filas.map(f => f[campo])); };
  reg('teachers', seed.tablas.teachers, 'id');
  reg('courses', seed.tablas.courses, 'id');
  reg('sections', seed.tablas.sections, 'id');
  reg('students', seed.tablas.students, 'id');
  reg('enrollments', seed.tablas.enrollments, 'id');
  reg('subjects', seed.tablas.subjects, 'id');
  reg('periods', seed.tablas.periods, 'id');
  reg('gradeRecords', seed.tablas.gradeRecords, 'id');
  reg('resultSummaries', seed.tablas.resultSummaries, 'id');

  const chk = (filas, campo, tabla) => {
    const faltan = filas.filter(f => f[campo] != null && !ids[tabla].has(String(f[campo])));
    if (faltan.length) avisos.push(tabla + ': ' + faltan.length + ' filas con ' + campo + ' inexistente (ej: ' + String(faltan[0][campo]) + ')');
  };
  chk(seed.tablas.enrollments, 'studentId', 'students');
  chk(seed.tablas.enrollments, 'courseId', 'courses');
  chk(seed.tablas.enrollments, 'sectionId', 'sections');
  chk(seed.tablas.gradeRecords, 'studentId', 'students');
  chk(seed.tablas.gradeRecords, 'subjectId', 'subjects');
  chk(seed.tablas.gradeRecords, 'sectionId', 'sections');
  chk(seed.tablas.gradeRecords, 'periodId', 'periods');
  chk(seed.tablas.resultSummaries, 'studentId', 'students');
  chk(seed.tablas.resultSummaries, 'subjectId', 'subjects');
  chk(seed.tablas.resultSummaries, 'sectionId', 'sections');

  // duplicados de unicidad
  const u1 = new Set(); let dupEnr = 0;
  seed.tablas.enrollments.forEach(f => { const k = f.schoolYearId + '|' + f.sectionId + '|' + f.numLista; if (u1.has(k)) dupEnr++; u1.add(k); });
  if (dupEnr) avisos.push('enrollments: ' + dupEnr + ' duplicados (año+sección+numLista)');
  const u2 = new Set(); let dupCal = 0;
  seed.tablas.gradeRecords.forEach(f => { const k = [f.schoolYearId, f.sectionId, f.subjectId, f.studentId, f.periodId].join('|'); if (u2.has(k)) dupCal++; u2.add(k); });
  if (dupCal) avisos.push('gradeRecords: ' + dupCal + ' duplicados (unicidad del nuevo índice)');
  const u3 = new Set(); let dupRes = 0;
  seed.tablas.resultSummaries.forEach(f => { const k = [f.schoolYearId, f.sectionId, f.subjectId, f.studentId].join('|'); if (u3.has(k)) dupRes++; u3.add(k); });
  if (dupRes) avisos.push('resultSummaries: ' + dupRes + ' duplicados (unicidad del nuevo índice)');
  const u4 = new Set(); let dupEst = 0;
  seed.tablas.students.forEach(f => { const k = f.nombreCompleto; if (u4.has(k)) dupEst++; u4.add(k); });
  if (dupEst) avisos.push('students: ' + dupEst + ' nombres duplicados (la unicidad global del legado los rechazaría)');

  const destino = path.join(__dirname, '..', 'seeds');
  fs.mkdirSync(destino, { recursive: true });
  fs.writeFileSync(path.join(destino, 'sga-seed.json'), JSON.stringify(seed, null, 1), 'utf8');

  console.log('Seed generado: ' + path.join(destino, 'sga-seed.json'));
  Object.entries(seed.tablas).forEach(([t, f]) => console.log('  ' + t + ': ' + f.length + ' filas'));
  console.log(avisos.length ? 'AVISOS (' + avisos.length + '):\n  ' + avisos.join('\n  ') : 'Integridad: sin avisos');
})().catch(e => { console.error('ERR', e && e.stack || e.message); process.exit(1); });
