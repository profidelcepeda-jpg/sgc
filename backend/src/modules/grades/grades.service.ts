import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db';
import { ErrorApp } from '../../lib/errors';
import { siguienteIdTx_ } from '../../lib/ids';
import { Ctx } from '../auth/auth.service';
import { CAMPOS_ETAPAS, camposNotas_, calcularRegistro, CfgAsignatura, notasVacias_, validarNota, validarRegistro } from './grades.engine';
import { leerValoresConfig } from '../configuration/configuration.service';

const clavesNotas = camposNotas_().concat(CAMPOS_ETAPAS);
const globales = ['calificaciones.administrar', 'cursos.ver_todos'];
const valorBool = (x: unknown, defecto: boolean): boolean => x == null ? defecto : ['SI','TRUE','1','YES'].includes(String(x).trim().toUpperCase());
const numCfg = (m: Map<string,string>, k: string, d: number): number => { const n = Number(m.get(k)); return Number.isFinite(n) ? n : d; };
const texto = (x: unknown): string => String(x ?? '').trim();
function sinAcceso(): never { throw new ErrorApp('El recurso no existe o está fuera de su alcance.', 'NO_ENCONTRADO'); }
function exigir(ctx: Ctx, permiso: string): void { if (!ctx.set[permiso]) throw new ErrorApp('No tiene permiso para realizar esta acción.', 'PERMISO'); }

export async function cfgDe_(subject: { notaMinima: number | null; usaRecuperacion: boolean; usaCompletiva: boolean; usaExtraordinaria: boolean; usaEspecial: boolean }): Promise<CfgAsignatura> {
  const rows = await leerValoresConfig(['NOTA_MINIMA','NOTA_MAXIMA','NOTA_ENTERA','DECIMALES_COMPETENCIA','ACTIVAR_RECUPERACION','ACTIVAR_COMPLETIVA','ACTIVAR_EXTRAORDINARIA','ACTIVAR_ESPECIAL','PCT_COMPLETIVA_CF','PCT_COMPLETIVA_CEC','PCT_EXTRA_CF','PCT_EXTRA_CE']);
  const m = new Map(Object.entries(rows));
  const flag = (s: boolean, k: string) => s && valorBool(m.get(k), true);
  const max = numCfg(m, 'NOTA_MAXIMA', 100), entera = valorBool(m.get('NOTA_ENTERA'), true);
  return { min: subject.notaMinima ?? numCfg(m, 'NOTA_MINIMA', 70), max, entera,
    dec: numCfg(m, 'DECIMALES_COMPETENCIA', 1), usaRec: flag(subject.usaRecuperacion, 'ACTIVAR_RECUPERACION'),
    usaComp: flag(subject.usaCompletiva, 'ACTIVAR_COMPLETIVA'), usaExtra: flag(subject.usaExtraordinaria, 'ACTIVAR_EXTRAORDINARIA'),
    usaEsp: flag(subject.usaEspecial, 'ACTIVAR_ESPECIAL'), pctCompCF: numCfg(m, 'PCT_COMPLETIVA_CF', 50),
    pctCompCEC: numCfg(m, 'PCT_COMPLETIVA_CEC', 50), pctExtCF: numCfg(m, 'PCT_EXTRA_CF', 30),
    pctExtCE: numCfg(m, 'PCT_EXTRA_CE', 70), NOTA_MINIMA_ABS: 0, NOTA_MAXIMA: max, NOTA_ENTERA: entera };
}

async function contextoGrupo_(ctx: Ctx, ano: string, seccion: string, asignatura: string, escribir = false) {
  const global = globales.some(p => ctx.set[p]) || ctx.rol === 'ADMINISTRADOR';
  const adminNotas = ctx.set['calificaciones.administrar'] === true || ctx.rol === 'ADMINISTRADOR';
  if (escribir && !ctx.set['calificaciones.administrar'] && !ctx.set['calificaciones.registrar'] && !ctx.set['calificaciones.editar']) exigir(ctx, 'calificaciones.registrar');
  else exigir(ctx, 'calificaciones.ver');
  const [s, subject, periods] = await Promise.all([
    prisma.section.findUnique({ where: { id: seccion }, include: { course: true } }),
    prisma.subject.findUnique({ where: { id: asignatura } }),
    prisma.period.findMany({ where: { schoolYearId: ano }, orderBy: { orden: 'asc' } }),
  ]);
  if (!s || s.estado !== 'ACTIVO' || s.course.estado !== 'ACTIVO' || s.course.schoolYearId !== ano || !subject || subject.estado !== 'ACTIVO') return sinAcceso();
  if (!subject.grados.includes('*') && !subject.grados.includes(s.course.grado)) return sinAcceso();
  const reg = periods.filter(p => p.tipo === 'REGULAR');
  if (reg.length !== 4) throw new ErrorApp('El año escolar debe tener exactamente cuatro períodos regulares.', 'VALIDACION');
  const etapas = Object.fromEntries(periods.filter(p => p.tipo === 'ETAPA' && p.etapa).map(p => [p.etapa!, p]));
  const asigs = await prisma.teachingAssignment.findMany({ where: { schoolYearId: ano, sectionId: seccion, subjectId: asignatura, estado: 'ACTIVO', OR: [{ periodId: null }, { periodId: { in: periods.map(p => p.id) } }], section: { estado: 'ACTIVO', course: { estado: 'ACTIVO', schoolYearId: ano } } } });
  const own = asigs.filter(a => a.teacherId === ctx.idDocente && a.courseId === s.courseId && a.schoolYearId === ano && a.subjectId === asignatura);
  // La tutoría limita la navegación a secciones; la visibilidad de notas sigue
  // requiriendo permiso global de consulta o asignación docente de la asignatura.
  if (!global && !own.length) return sinAcceso();
  const puedeEditar = adminNotas || !!own.length;
  if (escribir) {
    if (!puedeEditar) sinAcceso();
    if (!adminNotas) exigir(ctx, 'calificaciones.registrar');
  }
  const enrollments = await prisma.enrollment.findMany({ where: { schoolYearId: ano, sectionId: seccion, courseId: s.courseId, estado: 'ACTIVO', student: { estado: 'ACTIVO' } }, include: { student: true }, orderBy: { numLista: 'asc' } });
  return { s, subject, reg, etapas, own, puedeEditar, enrollments, cfg: await cfgDe_(subject) };
}

function mapNotas_(rows: Array<Record<string, any>>, periodos: Array<{id:string;tipo:string;etapa:string|null}>) {
  const n = notasVacias_();
  for (const row of rows) {
    const ix = periodos.findIndex(p => p.id === row.periodId);
    if (ix >= 0 && periodos[ix].tipo === 'REGULAR') for (let c=1;c<=4;c++) { n[`P${ix+1}C${c}`] = row[`c${c}`]; n[`R${ix+1}C${c}`] = row[`r${c}`]; }
    else if (ix >= 0 && periodos[ix].etapa) n[periodos[ix].etapa === 'COMPLETIVA' ? 'CEC' : periodos[ix].etapa === 'EXTRAORDINARIA' ? 'CEEX' : 'CESP'] = row.notaEtapa;
  }
  return n;
}

export async function opcionesCalificaciones(ctx: Ctx, ano?: string) {
  exigir(ctx, 'calificaciones.ver');
  const yrs = await prisma.schoolYear.findMany({ select: { id: true } });
  const yearIds = ano ? [ano] : yrs.map(y => y.id);
  const global = globales.some(p => ctx.set[p]) || ctx.rol === 'ADMINISTRADOR';
  const out: Array<{ ano:string; seccion:string; seccionTexto:string; asignaturas:Array<{id:string;texto:string}> }> = [];
  for (const y of yearIds) {
    const sections = global ? await prisma.section.findMany({ where: { estado:'ACTIVO', course:{schoolYearId:y,estado:'ACTIVO'} }, include:{course:true}, orderBy:[{course:{grado:'asc'}},{seccion:'asc'}] }) : await prisma.section.findMany({ where:{ estado:'ACTIVO', course:{schoolYearId:y,estado:'ACTIVO'}, OR:[{assignments:{some:{teacherId:ctx.idDocente||'',schoolYearId:y,estado:'ACTIVO'}}},{tutorings:{some:{teacherId:ctx.idDocente||'',schoolYearId:y,estado:'ACTIVA'}}}] }, include:{course:true}, orderBy:[{course:{grado:'asc'}},{seccion:'asc'}] });
    for (const s of sections) {
      let subjects = global ? await prisma.subject.findMany({ where:{estado:'ACTIVO', OR:[{grados:{has:'*'}},{grados:{has:s.course.grado}}] },orderBy:{orden:'asc'} }) : await prisma.subject.findMany({ where:{estado:'ACTIVO', assignments:{some:{schoolYearId:y,sectionId:s.id,courseId:s.courseId,teacherId:ctx.idDocente||'',estado:'ACTIVO'}}},orderBy:{orden:'asc'} });
      // Tutoría permite consultar la lista y asignaturas cubiertas por al menos una asignación activa.
      out.push({ ano:y, seccion:s.id, seccionTexto:`${s.course.grado} ${s.seccion}`, asignaturas:subjects.map(a=>({id:a.id,texto:a.nombre})) });
    }
  }
  return { opciones: out };
}

export async function obtenerGridCalificaciones(ctx: Ctx, ano: string, seccion: string, asignatura: string) {
  const g = await contextoGrupo_(ctx, ano, seccion, asignatura);
  const rows = await prisma.gradeRecord.findMany({ where:{schoolYearId:ano,sectionId:seccion,subjectId:asignatura} });
  const result = await prisma.resultSummary.findMany({ where:{schoolYearId:ano,sectionId:seccion,subjectId:asignatura} });
  const periods = g.reg.concat(Object.values(g.etapas));
  return { ano, seccion, asignatura, seccionTexto:`${g.s.course.grado} ${g.s.seccion}`, asignaturaTexto:g.subject.nombre,
    puedeEditar:g.puedeEditar, minima:g.cfg.min, periodos:g.reg.map(p=>({id:p.id,codigo:p.codigo,estado:p.estado})),
    etapas:Object.fromEntries(Object.entries(g.etapas).map(([k,p])=>[k,{id:p.id,codigo:p.codigo,estado:p.estado}])),
    estudiantes:g.enrollments.map(e=>{ const nr=rows.filter(r=>r.studentId===e.studentId); const notas=mapNotas_(nr,periods); return {id:e.studentId,nombre:e.student.nombreCompleto,numLista:e.numLista,notas,calculo:calcularRegistro(notas,g.cfg),resultado:result.find(r=>r.studentId===e.studentId)||null}; }) };
}

type Batch = { ano?:unknown; seccion?:unknown; asignatura?:unknown; filas?:unknown };
export async function guardarCalificaciones(ctx: Ctx, body: Batch) {
  const ano=texto(body.ano), seccion=texto(body.seccion), asignatura=texto(body.asignatura);
  if (!ano || !seccion || !asignatura || !Array.isArray(body.filas)) throw new ErrorApp('Datos de calificaciones incompletos.','VALIDACION');
  const g=await contextoGrupo_(ctx,ano,seccion,asignatura,true);
  // Semántica del lote (decisión confirmada): cada estudiante se valida y se
  // guarda en su propia transacción. Un error en una fila NO revierte las
  // anteriores: se devuelve `resultados[]` con los errores por estudiante y el
  // cliente los muestra. No cambiar a todo-o-nada sin revisar la interfaz.
  const out: Array<{estudiante:string; errores:Array<{campo:string;mensaje:string}>}> = [];
  for (const raw of body.filas as Array<Record<string,unknown>>) {
    const id=texto(raw.idEstudiante), changes=(raw.cambios && typeof raw.cambios==='object' ? raw.cambios : {}) as Record<string,unknown>;
    const enrollment=g.enrollments.find(e=>e.studentId===id);
    if (!enrollment) { out.push({estudiante:id,errores:[{campo:'',mensaje:'El estudiante no está matriculado activamente en esta sección.'}]}); continue; }
    const keys=Object.keys(changes); if (!keys.length) continue;
    if (keys.some(k=>!clavesNotas.includes(k))) { out.push({estudiante:id,errores:[{campo:'',mensaje:'La solicitud contiene campos de nota desconocidos.'}]}); continue; }
    const rows=await prisma.gradeRecord.findMany({where:{schoolYearId:ano,sectionId:seccion,subjectId:asignatura,studentId:id}});
    const periods=g.reg.concat(Object.values(g.etapas)); const n=mapNotas_(rows,periods); const normalized:Record<string,unknown>={}; const errors:Array<{campo:string;mensaje:string}> = [];
    for (const k of keys) {
      const periodNo=/^[PR](\d)/.exec(k); const stage=k==='CEC'?'COMPLETIVA':k==='CEEX'?'EXTRAORDINARIA':k==='CESP'?'ESPECIAL':null;
      const period=stage ? g.etapas[stage] : periodNo ? g.reg[Number(periodNo[1])-1] : null;
      if (!period) { errors.push({campo:k,mensaje:'No existe el período configurado para esta nota.'}); continue; }
      const ownPeriod=g.own.some(a=>a.periodId===null || a.periodId===period.id);
      if (!g.puedeEditar || (!(ctx.set['calificaciones.administrar']||ctx.rol==='ADMINISTRADOR') && !ownPeriod)) { errors.push({campo:k,mensaje:'No tiene asignación activa para este período.'}); continue; }
      if (period.estado==='CERRADO' && !ctx.set['calificaciones.cerrar']) { errors.push({campo:k,mensaje:'El período está cerrado.'}); continue; }
      const v=validarNota(changes[k],{NOTA_MINIMA_ABS:0,NOTA_MAXIMA:g.cfg.max,NOTA_ENTERA:g.cfg.entera});
      if (!v.ok) { errors.push({campo:k,mensaje:v.error||'Nota inválida.'}); continue; }
      const current=n[k] ?? null;
      if (current===null && !ctx.set['calificaciones.registrar'] && !ctx.set['calificaciones.administrar']) errors.push({campo:k,mensaje:'No tiene permiso para registrar notas.'});
      if (current!==null && !ctx.set['calificaciones.editar'] && !ctx.set['calificaciones.administrar']) errors.push({campo:k,mensaje:'No tiene permiso para editar notas existentes.'});
      normalized[k]=v.valor; n[k]=v.valor as number|null;
    }
    errors.push(...validarRegistro(n,normalized,g.cfg));
    if(errors.length){out.push({estudiante:id,errores:errors});continue;}
    await prisma.$transaction(async tx=>{
      const before=Object.fromEntries(keys.map(k=>{const record=rows.find(r=>{const i=periods.findIndex(p=>p.id===r.periodId);return /^[PR]/.test(k)?i===Number(k[1])-1:(i>=g.reg.length&&((periods[i]?.etapa==='COMPLETIVA'&&k==='CEC')||(periods[i]?.etapa==='EXTRAORDINARIA'&&k==='CEEX')||(periods[i]?.etapa==='ESPECIAL'&&k==='CESP')));});const field=k.startsWith('P')?'c'+k[3]:k.startsWith('R')?'r'+k[3]:'notaEtapa';return [k,(record as unknown as Record<string,unknown>|undefined)?.[field]??null];}));
      for (const p of periods) {
        const ix=periods.indexOf(p); const changedKeys=keys.filter(k=> /^[PR]/.test(k)?(g.reg[Number(k[1])-1]?.id===p.id):(k==='CEC'&&p.etapa==='COMPLETIVA'||k==='CEEX'&&p.etapa==='EXTRAORDINARIA'||k==='CESP'&&p.etapa==='ESPECIAL'));
        if (!changedKeys.length) continue;
        const record=rows.find(r=>r.periodId===p.id); const data:Record<string,unknown>={modificado:new Date(),modificadoPor:ctx.usuario};
        for(const k of changedKeys) data[k==='CEC'||k==='CEEX'||k==='CESP'?'notaEtapa':(k[0]==='P'?'c':'r')+k[3]]=normalized[k];
        if(!record){data.id=await siguienteIdTx_(tx,'CAL');Object.assign(data,{schoolYearId:ano,studentId:id,teacherId:ctx.idDocente,subjectId:asignatura,courseId:g.s.courseId,sectionId:seccion,periodId:p.id,creado:new Date()}); await tx.gradeRecord.create({data:data as Prisma.GradeRecordUncheckedCreateInput});}
        else await tx.gradeRecord.update({where:{id:record.id},data:data as Prisma.GradeRecordUncheckedUpdateInput});
        for(const k of changedKeys) await tx.auditLog.create({data:{fecha:new Date(),usuario:ctx.usuario,accion:'EDITAR_NOTA',modulo:'CALIFICACIONES',idRegistro:record?.id||id,descripcion:`${k} estudiante ${id}`,valorAnterior:before[k]===undefined?Prisma.JsonNull:before[k] as Prisma.InputJsonValue,valorNuevo:normalized[k]===null?Prisma.JsonNull:normalized[k] as Prisma.InputJsonValue}});
      }
      const calculated=calcularRegistro(n,g.cfg); const prev=await tx.resultSummary.findFirst({where:{schoolYearId:ano,sectionId:seccion,subjectId:asignatura,studentId:id}});
      const resultData={pc1:calculated.pcMostrar[0],pc2:calculated.pcMostrar[1],pc3:calculated.pcMostrar[2],pc4:calculated.pcMostrar[3],cfReal:calculated.cfReal,cf:calculated.cf,cec:n.CEC,ccf:calculated.comp.ccf,ceex:n.CEEX,cexf:calculated.ext.cexf,cesp:n.CESP,etapaLogro:calculated.etapa,notaA:calculated.A,notaR:calculated.R,estadoResultado:calculated.estado||'INCOMPLETO',fechaModificacion:new Date()};
      if(prev) await tx.resultSummary.update({where:{id:prev.id},data:resultData}); else await tx.resultSummary.create({data:{id:await siguienteIdTx_(tx,'RES'),schoolYearId:ano,sectionId:seccion,subjectId:asignatura,studentId:id,...resultData}});
    });
  }
  return { resultados:out };
}
