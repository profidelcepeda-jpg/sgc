/*********************************************************************
 * verificar-crud.ts — Verificación del motor CRUD contra la BD real
 *
 * Comprueba, sin dejar datos escritos, los defectos corregidos en la
 * auditoría técnica (bloque 1):
 *   · la edición parcial de asignaciones/tutorías ya no falla;
 *   · un PATCH parcial conserva los campos no enviados;
 *   · la secuencia de IDs es atómica y consecutiva;
 *   · los índices únicos y los CHECK existen y rechazan lo inválido;
 *   · dos tutorías INACTIVAS conviven y dos ACTIVAS no.
 * Todo lo que escribe se ejecuta dentro de una transacción que se revierte.
 *
 * Uso: npx.cmd tsx scripts/verificar-crud.ts
 *********************************************************************/

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../database/.env') });
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/db';
import { def_ } from '../src/modules/crud/crud.modulos';
import { combinarPrevio_, crudValidar_, ObjHoja } from '../src/modules/crud/crud.defs';
import { siguienteIdTx_ } from '../src/lib/ids';
import { Ctx } from '../src/modules/auth/auth.service';

const ctx = {
  id: 'USR-000001', usuario: 'admin', nombre: 'Verificación', correo: null, rol: 'ADMINISTRADOR',
  idDocente: null, permisos: [],
  set: { 'asignaciones.editar': true, 'tutorias.editar': true } as Record<string, true>,
  debeCambiar: false,
} as Ctx;

let fallos = 0;

function ok(nombre: string, cond: boolean, extra?: unknown): void {
  console.log((cond ? 'OK    ' : 'FALLO ') + nombre + (extra === undefined ? '' : ' -> ' + JSON.stringify(extra)));
  if (!cond) fallos++;
}

const ROLLBACK = new Error('rollback-intencionado');

/** Ejecuta escrituras y las revierte siempre. */
async function enTransaccion(fn: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  try {
    await prisma.$transaction(async function (tx) { await fn(tx); throw ROLLBACK; });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
}

(async function () {
  // 1. Edición de una asignación existente (antes: "El curso no existe.")
  const dAsg = def_('asignaciones');
  const filaAsg = await prisma.teachingAssignment.findFirst();
  if (filaAsg) {
    const previo = dAsg.dePrisma(filaAsg as unknown as Record<string, unknown>);
    const validado = crudValidar_(dAsg.campos, { ID_DOCENTE: previo.ID_DOCENTE }, previo,
      { docentes: [{ id: String(previo.ID_DOCENTE) }] });
    const o = combinarPrevio_(previo, validado);
    try {
      await dAsg.antes!(o, ctx, false, previo);
      ok('asignaciones: la edición parcial ya no lanza "El curso no existe."', true);
    } catch (e) {
      ok('asignaciones: la edición parcial ya no lanza "El curso no existe."', false, String((e as Error).message));
    }
    const data = dAsg.aPrisma(o, false);
    ok('asignaciones: conserva año/sección/asignatura en el PATCH parcial',
      data.schoolYearId === previo.ANO_ESCOLAR && data.sectionId === previo.ID_SECCION && data.subjectId === previo.ID_ASIGNATURA);
  }

  // 2. Edición de una tutoría existente
  const dTut = def_('tutorias');
  const filaTut = await prisma.tutoringAssignment.findFirst();
  if (filaTut) {
    const previo = dTut.dePrisma(filaTut as unknown as Record<string, unknown>);
    const validado = crudValidar_(dTut.campos, { ID_DOCENTE: previo.ID_DOCENTE }, previo,
      { docentes: [{ id: String(previo.ID_DOCENTE) }] });
    const o = combinarPrevio_(previo, validado);
    try {
      await dTut.antes!(o, ctx, false, previo);
      ok('tutorías: la edición parcial ya no lanza "El curso no existe."', true);
    } catch (e) {
      ok('tutorías: la edición parcial ya no lanza "El curso no existe."', false, String((e as Error).message));
    }
  }

  // 3. Usuario: un PATCH parcial no borra el rol ni los permisos
  const dUsu = def_('usuarios');
  const filaUsu = await prisma.user.findFirst();
  if (filaUsu) {
    const previo = dUsu.dePrisma(filaUsu as unknown as Record<string, unknown>);
    const validado = crudValidar_(dUsu.campos, { NOMBRE: previo.NOMBRE }, previo,
      { roles: [{ id: String(previo.ROL) }], docentes: [] });
    const data = dUsu.aPrisma(combinarPrevio_(previo, validado), false);
    const permisos = (String(previo.PERMISOS_EXTRA || '').split(',').filter(Boolean));
    ok('usuarios: el PATCH parcial conserva rolId y permisos',
      data.rolId === previo.ROL && JSON.stringify(data.permisosExtra) === JSON.stringify(permisos));
  }

  // 4. Asignatura: los flags del motor sobreviven a un PATCH parcial
  const dAsi = def_('asignaturas');
  const filaAsi = await prisma.subject.findFirst();
  if (filaAsi) {
    const previo = dAsi.dePrisma(filaAsi as unknown as Record<string, unknown>);
    const validado = crudValidar_(dAsi.campos, { NOMBRE: previo.NOMBRE }, previo, {});
    const data = dAsi.aPrisma(combinarPrevio_(previo, validado), false);
    ok('asignaturas: usaRecuperacion/notaMinima sobreviven a un PATCH parcial',
      data.usaRecuperacion === filaAsi.usaRecuperacion && data.notaMinima === filaAsi.notaMinima);
  }

  // 5. Secuencia atómica y consecutiva
  await enTransaccion(async function (tx) {
    const a = await siguienteIdTx_(tx, 'USR');
    const b = await siguienteIdTx_(tx, 'USR');
    ok('secuencia: IDs consecutivos y sin repetición',
      a !== b && parseInt(b.split('-')[1], 10) === parseInt(a.split('-')[1], 10) + 1, { a, b });
  });

  // 6. Índices y CHECK creados por la migración
  const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    "SELECT indexname FROM pg_indexes WHERE indexname IN ('tutoring_assignments_activa_key','teaching_assignments_unica_key','competences_general_codigo_key','enrollments_school_year_id_student_id_key') ORDER BY 1");
  ok('BD: los 4 índices únicos nuevos existen', idx.length === 4, idx.map(function (x) { return x.indexname; }));

  const chk = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
    "SELECT conname FROM pg_constraint WHERE conname IN ('chk_gr_notas_c','chk_gr_notas_r','chk_gr_recuperacion_mayor_igual','chk_res_pc','chk_res_cf_real') ORDER BY 1");
  ok('BD: los CHECK completos de notas existen', chk.length === 5, chk.map(function (x) { return x.conname; }));

  // 7. Tutorías: INACTIVAS conviven, ACTIVAS no
  const sec = await prisma.section.findFirst();
  const doc = await prisma.teacher.findFirst();
  if (sec && doc) {
    const curso = await prisma.course.findUnique({ where: { id: sec.courseId } });
    const year = curso!.schoolYearId;
    let inactivasOk = false, activasRechazadas = false;
    await enTransaccion(async function (tx) {
      await tx.tutoringAssignment.create({ data: { id: 'TUT-900001', schoolYearId: year, teacherId: doc.id, courseId: sec.courseId, sectionId: sec.id, estado: 'INACTIVA' } });
      await tx.tutoringAssignment.create({ data: { id: 'TUT-900002', schoolYearId: year, teacherId: doc.id, courseId: sec.courseId, sectionId: sec.id, estado: 'INACTIVA' } });
      inactivasOk = true;
      const activa = await tx.tutoringAssignment.findFirst({ where: { schoolYearId: year, sectionId: sec.id, estado: 'ACTIVA' } });
      if (activa) await tx.tutoringAssignment.update({ where: { id: activa.id }, data: { estado: 'INACTIVA' } });
      await tx.tutoringAssignment.create({ data: { id: 'TUT-900003', schoolYearId: year, teacherId: doc.id, courseId: sec.courseId, sectionId: sec.id, estado: 'ACTIVA' } });
      try {
        await tx.tutoringAssignment.create({ data: { id: 'TUT-900004', schoolYearId: year, teacherId: doc.id, courseId: sec.courseId, sectionId: sec.id, estado: 'ACTIVA' } });
      } catch { activasRechazadas = true; }
    });
    ok('tutorías: dos INACTIVAS conviven (el UNIQUE viejo lo impedía)', inactivasOk);
    ok('tutorías: dos ACTIVAS en la misma sección se rechazan', activasRechazadas);
  }

  // 8. CHECK de notas: rechazan rangos y recuperaciones menores
  const gr = await prisma.gradeRecord.findFirst({ where: { c2: { not: null } } });
  if (gr) {
    let fueraDeRango = false, recuperacionMenor = false;
    await enTransaccion(async function (tx) {
      try { await tx.gradeRecord.update({ where: { id: gr.id }, data: { c2: 101 } }); } catch { fueraDeRango = true; }
    });
    const c2 = Number(gr.c2);
    if (c2 > 0) {
      await enTransaccion(async function (tx) {
        try { await tx.gradeRecord.update({ where: { id: gr.id }, data: { r2: c2 - 1 } }); } catch { recuperacionMenor = true; }
      });
    }
    ok('BD: el CHECK rechaza una nota c2 fuera de 0..100', fueraDeRango);
    if (c2 > 0) ok('BD: el CHECK rechaza una recuperación menor que la nota', recuperacionMenor);
  }

  // 9. Unicidad exacta de asignaciones
  const asg = await prisma.teachingAssignment.findFirst();
  if (asg) {
    let duplicada = false;
    await enTransaccion(async function (tx) {
      try {
        await tx.teachingAssignment.create({ data: {
          id: 'ASG-900001', schoolYearId: asg.schoolYearId, teacherId: asg.teacherId, subjectId: asg.subjectId,
          courseId: asg.courseId, sectionId: asg.sectionId, periodId: asg.periodId, estado: 'ACTIVO',
        } });
      } catch { duplicada = true; }
    });
    ok('BD: una asignación duplicada se rechaza por el índice único', duplicada);
  }

  await prisma.$disconnect();
  console.log(fallos ? ('VERIFICACIÓN CON ' + fallos + ' FALLO(S)') : 'VERIFICACIÓN COMPLETA');
  process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
