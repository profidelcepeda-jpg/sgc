/*********************************************************************
 * verificar-paridad.ts — Compara el motor nuevo contra los RESULTADOS
 * guardados por el sistema en producción (SGA/database → PostgreSQL).
 * Regla: si algo difiere, el motor nuevo NO debe reemplazar al legado.
 * Uso: npx tsx scripts/verificar-paridad.ts
 *********************************************************************/

import { PrismaClient } from '@prisma/client';
import { calcularRegistro, num_ } from '../src/modules/grades/grades.engine';

const prisma = new PrismaClient();

// cfgAsignatura_ de Subjects.js con la CONFIG real cargada (NOTA_MINIMA=70,
// DECIMALES_COMPETENCIA=1, pesos 50/50 y 30/70, todas las etapas activas).
const ca = {
  min: 70, max: 100, entera: true, dec: 1,
  usaRec: true, usaComp: true, usaExtra: true, usaEsp: true,
  pctCompCF: 50, pctCompCEC: 50, pctExtCF: 30, pctExtCE: 70,
  NOTA_MINIMA_ABS: 0, NOTA_MAXIMA: 100, NOTA_ENTERA: true,
};

async function main() {
  // Solo se pueden comparar los resultados con C.F. calculada (los demás siguen INCOMPLETOS)
  const resultados = await prisma.resultSummary.findMany({
    where: { cf: { not: null } },
    include: { student: true, subject: true },
  });
  console.log('Resultados con C.F. calculada: ' + resultados.length);

  let ok = 0, dif = 0;
  for (const res of resultados) {
    const filas = await prisma.gradeRecord.findMany({
      where: {
        studentId: res.studentId, subjectId: res.subjectId, sectionId: res.sectionId, schoolYearId: res.schoolYearId,
      },
      orderBy: { periodId: 'asc' },
    });
    // Registro fusionado (Grades.js notasPorEstudiante_): P/R por período + etapas
    const n: Record<string, number | null> = {};
    ['P1C1','P1C2','P1C3','P1C4','P2C1','P2C2','P2C3','P2C4','P3C1','P3C2','P3C3','P3C4','P4C1','P4C2','P4C3','P4C4',
     'R1C1','R1C2','R1C3','R1C4','R2C1','R2C2','R2C3','R2C4','R3C1','R3C2','R3C3','R3C4','R4C1','R4C2','R4C3','R4C4',
     'CEC','CEEX','CESP'].forEach(k => { n[k] = null; });
    const orden = ['P1','P2','P3','P4','COMP','EXTRA','ESP'];
    filas.sort((a, b) => orden.indexOf(a.periodId) - orden.indexOf(b.periodId));
    filas.forEach((f, i) => {
      if (i < 4) {
        n['P' + (i + 1) + 'C1'] = f.c1; n['P' + (i + 1) + 'C2'] = f.c2; n['P' + (i + 1) + 'C3'] = f.c3; n['P' + (i + 1) + 'C4'] = f.c4;
        n['R' + (i + 1) + 'C1'] = f.r1; n['R' + (i + 1) + 'C2'] = f.r2; n['R' + (i + 1) + 'C3'] = f.r3; n['R' + (i + 1) + 'C4'] = f.r4;
      } else if (f.periodId === 'PER-000005') n.CEC = f.notaEtapa;
      else if (f.periodId === 'PER-000006') n.CEEX = f.notaEtapa;
      else if (f.periodId === 'PER-000007') n.CESP = f.notaEtapa;
    });
    const r = calcularRegistro(n as never, ca);

    const cmp: Array<[string, unknown, unknown]> = [
      // El legado escribe en RESULTADOS los valores MOSTRADOS (filaResultado_):
      // PC1..PC4 = pcMostrar (truncados); CF_REAL sí guarda el real con decimales.
      ['pc1', r.pcMostrar[0], num_(res.pc1)],
      ['pc2', r.pcMostrar[1], num_(res.pc2)],
      ['pc3', r.pcMostrar[2], num_(res.pc3)],
      ['pc4', r.pcMostrar[3], num_(res.pc4)],
      ['cfReal', r.cfReal, num_(res.cfReal)],
      ['cf', r.cf, res.cf],
      ['cecf', r.comp.ccf, num_(res.ccf)],
      ['notaA', r.A, num_(res.notaA)],
      ['estado', r.estado, res.estadoResultado],
    ];
    const mal = cmp.filter(([, a, b]) => a !== b);
    if (mal.length === 0) ok++;
    else {
      dif++;
      console.log('DIFERENCIA en ' + res.student.nombreCompleto + ' / ' + res.subject.codigo + ' (' + res.id + '):');
      mal.forEach(([k, a, b]) => console.log('  ' + k + ': motor=' + a + '  produccion=' + b));
    }
  }
  console.log('PARIDAD: ' + ok + ' idénticos, ' + dif + ' con diferencias');
  process.exit(dif === 0 ? 0 : 1);
}

main().catch(e => { console.error('ERR', e); process.exit(1); }).finally(() => prisma.$disconnect());
