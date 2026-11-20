// seed.js — Carga una semilla en la base de datos (idempotente: upsert).
// Uso: node scripts/seed.js [--real] [--con-historial]
//   Por defecto usa seeds/sga-seed.anon.json (datos anonimizados, versionable).
//   --real usa seeds/sga-seed.json (datos personales reales; solo en local y
//   fuera de Git). No comparta ni versione ese archivo.
// Requiere DATABASE_URL (archivo .env junto a prisma/schema.prisma).

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function jsonVal(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return { texto: v }; }
  }
  return v;
}

async function main() {
  const usarReal = process.argv.includes('--real');
  const archivo = usarReal ? 'sga-seed.json' : 'sga-seed.anon.json';
  const ruta = path.join(__dirname, '..', 'seeds', archivo);

  if (!fs.existsSync(ruta)) {
    throw new Error('No existe la semilla ' + archivo + '. Use --real solo si el archivo real esta en local.');
  }
  if (usarReal) {
    console.warn('AVISO: se cargara la semilla con datos personales reales (' + archivo + ').');
    console.warn('       Ese archivo no debe versionarse ni compartirse.');
  }

  const seed = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const t = seed.tablas;
  let n = 0;
  const log = (k, v) => { n += v; console.log('  ' + k + ': ' + v); };

  console.log('Semilla: ' + archivo);
  console.log('Cargando seed generado: ' + seed.generado);

  for (const r of t.config) {
    await prisma.config.upsert({ where: { clave: r.clave }, update: { valor: r.valor, descripcion: r.descripcion, fechaModificacion: r.fechaModificacion }, create: r });
  }
  log('config', t.config.length);

  for (const r of t.roles) {
    await prisma.role.upsert({ where: { id: r.id }, update: { nombre: r.nombre, descripcion: r.descripcion, esSistema: r.esSistema, estado: r.estado }, create: r });
  }
  log('roles', t.roles.length);

  for (const r of t.permisos) {
    await prisma.permission.upsert({ where: { id: r.id }, update: { modulo: r.modulo, descripcion: r.descripcion }, create: r });
  }
  log('permisos', t.permisos.length);

  for (const r of t.rolPermisos) {
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: r.roleId, permissionId: r.permissionId } }, update: {}, create: r });
  }
  log('rolPermisos', t.rolPermisos.length);

  for (const r of t.teachers) {
    await prisma.teacher.upsert({ where: { id: r.id }, update: r, create: r });
  }
  log('teachers', t.teachers.length);

  for (const r of t.schoolYears) {
    await prisma.schoolYear.upsert({ where: { id: r.id }, update: {}, create: r });
  }
  log('schoolYears', t.schoolYears.length);

  for (const r of t.courses) {
    await prisma.course.upsert({ where: { id: r.id }, update: r, create: r });
  }
  log('courses', t.courses.length);

  for (const r of t.sections) {
    await prisma.section.upsert({ where: { id: r.id }, update: r, create: r });
  }
  log('sections', t.sections.length);

  for (const r of t.students) {
    await prisma.student.upsert({ where: { id: r.id }, update: r, create: r });
  }
  log('students', t.students.length);

  for (const r of t.enrollments) {
    await prisma.enrollment.upsert({ where: { id: r.id }, update: r, create: r });
  }
  log('enrollments', t.enrollments.length);

  for (const r of t.subjects) {
    await prisma.subject.upsert({ where: { id: r.id }, update: r, create: r });
  }
  log('subjects', t.subjects.length);

  for (const r of t.competences) {
    await prisma.competence.upsert({ where: { id: r.id }, update: r, create: r });
  }
  log('competences', t.competences.length);

  for (const r of t.periods) {
    await prisma.period.upsert({ where: { id: r.id }, update: r, create: r });
  }
  log('periods', t.periods.length);

  for (const r of t.teachingAssignments) {
    await prisma.teachingAssignment.upsert({ where: { id: r.id }, update: r, create: r });
  }
  log('teachingAssignments', t.teachingAssignments.length);

  for (const r of t.tutoringAssignments) {
    await prisma.tutoringAssignment.upsert({ where: { id: r.id }, update: r, create: r });
  }
  log('tutoringAssignments', t.tutoringAssignments.length);

  for (const r of t.gradeRecords) {
    await prisma.gradeRecord.upsert({ where: { id: r.id }, update: r, create: r });
  }
  log('gradeRecords', t.gradeRecords.length);

  for (const r of t.resultSummaries) {
    await prisma.resultSummary.upsert({ where: { id: r.id }, update: r, create: r });
  }
  log('resultSummaries', t.resultSummaries.length);

  for (const r of t.observations) {
    await prisma.observation.upsert({ where: { id: r.id }, update: r, create: r });
  }
  log('observations', t.observations.length);

  for (const r of t.users) {
    await prisma.user.upsert({ where: { id: r.id }, update: r, create: r });
  }
  log('users', t.users.length);
  console.log('  (credenciales NO migradas: se recrean con hash nuevo al primer login)');

  if (process.argv.includes('--con-historial')) {
    for (const r of t.auditLogHistorico) {
      await prisma.auditLog.create({ data: {
        fecha: new Date(r.fecha), usuario: r.usuario, accion: r.accion, modulo: r.modulo,
        idRegistro: r.idRegistro, descripcion: r.descripcion,
        valorAnterior: jsonVal(r.valorAnterior), valorNuevo: jsonVal(r.valorNuevo),
      } });
    }
    log('auditLogHistorico', t.auditLogHistorico.length);
  } else {
    console.log('  auditLogHistorico: omitido (use --con-historial para cargar las ' + t.auditLogHistorico.length + ' filas)');
  }

  console.log('Total filas insertadas/actualizadas: ' + n);
}

main()
  .catch(e => { console.error('ERR', e && e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
