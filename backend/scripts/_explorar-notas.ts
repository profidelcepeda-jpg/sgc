import { prisma } from '../src/lib/db';

async function main() {
  const ano = '2026-2027';
  const pers = await prisma.period.findMany({ where: { schoolYearId: ano }, orderBy: { orden: 'asc' } });
  console.log('PERIODOS', pers.map(p => [p.id, p.codigo, p.tipo, p.etapa, p.estado, p.meses.join(',')].join(' | ')).join('\n'));
  const secs = await prisma.section.findMany({ where: { course: { schoolYearId: ano } }, include: { course: true } });
  console.log('SECCIONES', secs.map(s => [s.id, s.course.grado, s.seccion, s.estado].join(' ')).join(' ; '));
  const asigs = await prisma.subject.findMany({ orderBy: { orden: 'asc' } });
  console.log('ASIGNATURAS', asigs.map(a => [a.id, a.codigo, a.abrev, a.grados.join(','), a.nombre].join(' | ')).join('\n'));
  const comps = await prisma.competence.findMany({ orderBy: { orden: 'asc' } });
  console.log('COMPETENCIAS', comps.map(c => [c.id, c.subjectId || '*', c.codigo, c.nombre, c.abrev].join(' | ')).join('\n'));
  const enr = await prisma.enrollment.count({ where: { sectionId: 'SEC-000001', estado: { not: 'RETIRADO' } } });
  console.log('INSCRITOS SEC-000001', enr);
  const gr = await prisma.gradeRecord.findMany({ where: { sectionId: 'SEC-000001' }, take: 4, orderBy: { id: 'asc' } });
  console.log('NOTAS', JSON.stringify(gr, null, 1).slice(0, 1600));
  const rs = await prisma.resultSummary.findMany({ where: { sectionId: 'SEC-000001' }, take: 2 });
  console.log('RESULTADOS', JSON.stringify(rs, null, 1).slice(0, 1200));
  const asg = await prisma.teachingAssignment.findMany({ where: { schoolYearId: ano, sectionId: 'SEC-000001' }, include: { teacher: true, subject: true, period: true } });
  console.log('ASIGNACIONES SEC-000001', asg.map(a => [a.teacher.nombreCompleto, a.subject.abrev, a.period ? a.period.codigo : '*', a.estado].join(' | ')).join('\n'));
  process.exit(0);
}
main();
