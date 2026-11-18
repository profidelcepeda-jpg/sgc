import { prisma } from '../src/lib/db';

async function main() {
  const g = await prisma.gradeRecord.groupBy({ by: ['sectionId', 'subjectId'], _count: true, orderBy: { sectionId: 'asc' } });
  console.log('GRUPOS', g.length);
  console.log(g.map(x => x.sectionId + ' ' + x.subjectId + ' ' + x._count).join('\n'));
  const rs = await prisma.resultSummary.groupBy({ by: ['sectionId', 'subjectId'], _count: true });
  console.log('RESULTADOS GRUPOS', rs.length);
  const enr = await prisma.enrollment.groupBy({ by: ['sectionId'], _count: true });
  console.log('INSCRITOS/SECC', enr.map(x => x.sectionId + ':' + x._count).join(' ; '));
  const est = await prisma.student.findMany({ take: 3 });
  console.log('EST', est.map(x => x.id + ' | ' + x.nombreCompleto + ' | ' + x.estado).join('\n'));
  process.exit(0);
}
main();
