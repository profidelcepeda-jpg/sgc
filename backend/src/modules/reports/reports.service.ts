import { Ctx } from '../auth/auth.service';
import { ErrorApp } from '../../lib/errors';
import { prisma } from '../../lib/db';
import { CAMPOS_ETAPAS, calcularRegistro, determinarSituacionFinal, determinarSituacionPortada, notasVacias_, resumenAsistencia_ } from '../grades/grades.engine';
import { cfgDe_ } from '../grades/grades.service';
import { exigirAccesoSeccionAcademica } from '../crud/autorizacion';
import { observacionesParaExpediente } from '../observations/observations.service';
import { leerValoresConfig } from '../configuration/configuration.service';

const globalReporte=(ctx:Ctx)=>ctx.rol==='ADMINISTRADOR'||ctx.set['cursos.ver_todos']===true;
function permiso(ctx:Ctx,p:string){if(!ctx.set[p])throw new ErrorApp('No tiene permiso para realizar esta acción.','PERMISO');}
function fuera():never{throw new ErrorApp('El recurso no existe o está fuera de su alcance.','NO_ENCONTRADO');}
function exigirAno(ano:string){if(!/^\d{4}-\d{4}$/.test(ano))throw new ErrorApp('Año escolar inválido.','VALIDACION');}

async function seccionVisible(ctx:Ctx,ano:string,id:string){
  exigirAno(ano);
  return exigirAccesoSeccionAcademica(ctx,ano,id);
}
export async function opcionesReportes(ctx:Ctx){
  permiso(ctx,'reportes.ver');
  if(globalReporte(ctx)){
    const rows=await prisma.section.findMany({where:{estado:'ACTIVO',course:{estado:'ACTIVO'}},include:{course:true},orderBy:[{course:{schoolYearId:'desc'}},{course:{grado:'asc'}},{seccion:'asc'}]});
    return {opciones:rows.map(s=>({ano:s.course.schoolYearId,seccion:s.id,etiqueta:`${s.course.schoolYearId} · ${s.course.grado} ${s.seccion}`}))};
  }
  if(!ctx.idDocente)return {opciones:[]};
  const [a,t]=await Promise.all([
    prisma.teachingAssignment.findMany({where:{teacherId:ctx.idDocente,estado:'ACTIVO',section:{estado:'ACTIVO',course:{estado:'ACTIVO'}}},select:{schoolYearId:true,sectionId:true,courseId:true}}),
    prisma.tutoringAssignment.findMany({where:{teacherId:ctx.idDocente,estado:'ACTIVA',section:{estado:'ACTIVO',course:{estado:'ACTIVO'}}},select:{schoolYearId:true,sectionId:true,courseId:true}}),
  ]);
  const keys=Array.from(new Set(a.concat(t).map(x=>`${x.schoolYearId}|${x.sectionId}|${x.courseId}`)));
  const rows=await prisma.section.findMany({where:{id:{in:keys.map(k=>k.split('|')[1])},estado:'ACTIVO',course:{estado:'ACTIVO'}},include:{course:true},orderBy:[{course:{schoolYearId:'desc'}},{course:{grado:'asc'}},{seccion:'asc'}]});
  return {opciones:rows.filter(s=>keys.includes(`${s.course.schoolYearId}|${s.id}|${s.courseId}`)).map(s=>({ano:s.course.schoolYearId,seccion:s.id,etiqueta:`${s.course.schoolYearId} · ${s.course.grado} ${s.seccion}`}))};
}

function fusionNotas(rows:Array<Record<string,any>>,per:Array<{id:string;tipo:string;etapa:string|null}>){
  const n=notasVacias_();
  for(const r of rows){const i=per.findIndex(p=>p.id===r.periodId);if(i<0)continue;
    if(per[i].tipo==='REGULAR')for(let c=1;c<=4;c++){n[`P${i+1}C${c}`]=r[`c${c}`];n[`R${i+1}C${c}`]=r[`r${c}`];}
    else if(per[i].etapa)n[per[i].etapa==='COMPLETIVA'?'CEC':per[i].etapa==='EXTRAORDINARIA'?'CEEX':'CESP']=r.notaEtapa;
  } return n;
}
const centerKeys=['CENTRO','REGIONAL','DISTRITO','CODIGO_CENTRO','DIRECCION_CENTRO','PROVINCIA','MUNICIPIO','TANDA','NIVEL','DIRECTOR'];

const estadosDiarios=['PRESENTE','AUSENTE','TARDANZA','EXCUSADO'] as const;
function resumenAsistenciaDiaria(marks:Array<{estado:string}>){
  const counts={PRESENTE:0,AUSENTE:0,TARDANZA:0,EXCUSADO:0};
  for(const mark of marks)if(estadosDiarios.includes(mark.estado as typeof estadosDiarios[number]))counts[mark.estado as keyof typeof counts]++;
  const considerados=counts.PRESENTE+counts.AUSENTE+counts.TARDANZA;
  return {...counts,total:marks.length,considerados,porcentaje:considerados?Math.round((counts.PRESENTE+counts.TARDANZA)/considerados*10000)/100:null};
}

export async function datosCursoReporte(ctx:Ctx,ano:string,idSeccion:string,requierePermiso=true,idEstudiante?:string,incluirAsistencia=true,alcanceNotas?:{porAsignatura?:Record<string,string[]|null>}){
  if(requierePermiso)permiso(ctx,'reportes.ver'); const sec=await seccionVisible(ctx,ano,idSeccion);
  const [periodos,estudiantes,asignaturas,cfgRows,tutor,asistencia,asistenciaDiaria]=await Promise.all([
    prisma.period.findMany({where:{schoolYearId:ano},orderBy:{orden:'asc'}}),
    prisma.enrollment.findMany({where:{schoolYearId:ano,sectionId:idSeccion,courseId:sec.courseId,...(idEstudiante?{studentId:idEstudiante}:{estado:'ACTIVO',student:{estado:'ACTIVO'}})},include:{student:true},orderBy:{numLista:'asc'}}),
    prisma.subject.findMany({where:{estado:'ACTIVO',OR:[{grados:{has:'*'}},{grados:{has:sec.course.grado}}],...(alcanceNotas?.porAsignatura?{id:{in:Object.keys(alcanceNotas.porAsignatura)}}:{})},orderBy:{orden:'asc'}}),
    leerValoresConfig(centerKeys.concat(['NOTA_MINIMA','FORMATO_PAPEL','ORIENTACION_IMPRESION'])),
    prisma.tutoringAssignment.findFirst({where:{schoolYearId:ano,sectionId:idSeccion,courseId:sec.courseId,estado:'ACTIVA',teacher:{estado:'ACTIVO'}},include:{teacher:true}}),
    incluirAsistencia?prisma.attendance.findMany({where:{schoolYearId:ano,sectionId:idSeccion,...(idEstudiante?{studentId:idEstudiante}:{})}}):Promise.resolve([]),
    incluirAsistencia&&ctx.set['asistencia.ver']===true?prisma.attendanceSession.findMany({where:{schoolYearId:ano,sectionId:idSeccion,...(idEstudiante?{marks:{some:{enrollment:{studentId:idEstudiante}}}}:{})},select:{fecha:true,marks:{where:idEstudiante?{enrollment:{studentId:idEstudiante}}:undefined,select:{enrollmentId:true,estado:true,enrollment:{select:{studentId:true}}}}},orderBy:{fecha:'asc'}}):Promise.resolve([]),
  ]);
  const reg=periodos.filter(p=>p.tipo==='REGULAR');
  if(reg.length!==4)throw new ErrorApp('El año escolar debe tener exactamente cuatro períodos regulares.','VALIDACION');
  const etapas=periodos.filter(p=>p.tipo==='ETAPA'); const periodMap=reg.concat(etapas);
  const idsEst=estudiantes.map(e=>e.studentId),idsAsig=asignaturas.map(a=>a.id);
  const [grades,competencias,asignaciones]=await Promise.all([
    prisma.gradeRecord.findMany({where:{schoolYearId:ano,sectionId:idSeccion,courseId:sec.courseId,studentId:{in:idsEst},subjectId:{in:idsAsig},period:{schoolYearId:ano},...(alcanceNotas?.porAsignatura?{OR:idsAsig.map(subjectId=>{const ids=alcanceNotas.porAsignatura![subjectId];return ids===null?{subjectId}: {subjectId,periodId:{in:ids||[]}};})}:{})}}),
    prisma.competence.findMany({where:{estado:'ACTIVO',OR:[{subjectId:{in:idsAsig}},{subjectId:null}]},orderBy:{orden:'asc'}}),
    prisma.teachingAssignment.findMany({where:{schoolYearId:ano,sectionId:idSeccion,courseId:sec.courseId,estado:'ACTIVO',teacher:{estado:'ACTIVO'}},include:{teacher:true}}),
  ]);
  const cfgs=new Map<string,Awaited<ReturnType<typeof cfgDe_>>>();
  await Promise.all(asignaturas.map(async a=>cfgs.set(a.id,await cfgDe_(a))));
  const compsPor=new Map<string,typeof competencias>();
  for(const a of asignaturas){const own=competencias.filter(c=>c.subjectId===a.id),general=competencias.filter(c=>c.subjectId===null);compsPor.set(a.id,own.length?own:general);}
  const cfgMap=new Map(Object.entries(cfgRows));
  const datosAsig=asignaturas.map(a=>({id:a.id,codigo:a.codigo,nombre:a.nombre,nombreReporte:a.nombreReporte||a.nombre,abrev:a.abrev||a.codigo,area:a.area,orden:a.orden,ordenBoletin:a.ordenBoletin,esOptativa:a.codigo.toUpperCase()==='OPT',competencias:compsPor.get(a.id)||[],docentes:Array.from(new Set(asignaciones.filter(x=>x.subjectId===a.id).map(x=>x.teacher.nombreCompleto)))}));
  const idx:Record<string,number>={}; const meses=Array.from(new Set(reg.flatMap(p=>p.meses))); meses.forEach((m,i)=>idx[m]=i);
  const periodsMeses={regulares:reg.map(p=>({MESES:p.meses.join(',')}))};
  const enrollmentByStudent=new Map(estudiantes.map(e=>[e.studentId,e.id]));
  const dailyByStudent=new Map<string,Array<{fecha:string;estado:string;periodo:string}>>();
  for(const session of asistenciaDiaria){
    const fecha=session.fecha.toISOString().slice(0,10),month=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][session.fecha.getUTCMonth()];
    const periodo=reg.find(p=>p.meses.includes(month))?.codigo||'SIN_PERIODO';
    for(const mark of session.marks){const studentId=mark.enrollment.studentId;if(!enrollmentByStudent.has(studentId))continue;const rows=dailyByStudent.get(studentId)||[];rows.push({fecha,estado:mark.estado,periodo});dailyByStudent.set(studentId,rows);}
  }
  const dataEst=estudiantes.map(e=>{
    const recordsBy=new Map<string,Record<string,any>[]>();
    for(const r of grades.filter(x=>x.studentId===e.studentId)){const ar=recordsBy.get(r.subjectId)||[];ar.push(r);recordsBy.set(r.subjectId,ar);}
    const registros:Record<string,{notas:ReturnType<typeof notasVacias_>;calc:ReturnType<typeof calcularRegistro>} >={};const situaciones:string[]=[];
    for(const a of asignaturas){const notas=fusionNotas(recordsBy.get(a.id)||[],periodMap);const calc=calcularRegistro(notas,cfgs.get(a.id)!);registros[a.id]={notas,calc};situaciones.push(calc.situacion);}
    const rowsAs=asistencia.filter(x=>x.studentId===e.studentId).map(x=>{const row=Array(meses.length).fill(null);if(idx[x.mes]!==undefined)row[idx[x.mes]]=x.porcentaje;return row;});
    const resumen=resumenAsistencia_(rowsAs,{idx},periodsMeses);
    const daily=dailyByStudent.get(e.studentId)||[];
    const asistenciaDiaria={sesiones:daily.length,resumen:resumenAsistenciaDiaria(daily),marcas:daily,periodos:reg.map(p=>({codigo:p.codigo,...resumenAsistenciaDiaria(daily.filter(x=>x.periodo===p.codigo))}))};
    return {idEstudiante:e.studentId,num:e.numLista,nombre:e.student.nombreCompleto,nombres:e.student.nombres,apellidos:e.student.apellidos,registros,situacion:determinarSituacionFinal(situaciones,asignaturas.length),situacionPortada:determinarSituacionPortada(situaciones,asignaturas.length),asistencia:resumen,asistenciaDiaria:incluirAsistencia&&ctx.set['asistencia.ver']===true?asistenciaDiaria:null};
  });
  return {ano,idSeccion,grado:sec.course.grado,seccion:sec.seccion,tutor:tutor?.teacher.nombreCompleto||'',centro:Object.fromEntries(centerKeys.map(k=>[k,cfgMap.get(k)||''])),formato:{papel:cfgMap.get('FORMATO_PAPEL')||'A4',orientacion:cfgMap.get('ORIENTACION_IMPRESION')||'LANDSCAPE'},min:Number(cfgMap.get('NOTA_MINIMA'))||70,periodos:reg.map(p=>({id:p.id,codigo:p.codigo,nombre:p.nombre,meses:p.meses,estado:p.estado})),etapas:etapas.map(p=>({id:p.id,codigo:p.codigo,etapa:p.etapa,nombre:p.nombre,estado:p.estado})),asignaturas:datosAsig,estudiantes:dataEst};
}

export async function dashboardReporte(ctx:Ctx,ano:string,idSeccion:string,periodo:number){
  if(!Number.isInteger(periodo)||periodo<1||periodo>4)throw new ErrorApp('Período inválido.','VALIDACION');
  const d=await datosCursoReporte(ctx,ano,idSeccion);
  const promedio=(arr:Array<number|null>)=>{const v=arr.filter((x):x is number=>x!==null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
  const porAsignatura=d.asignaturas.map(a=>({id:a.id,nombre:a.nombre,periodos:[0,1,2,3].map(i=>promedio(d.estudiantes.map(e=>e.registros[a.id].calc.periodos[i].promedio)))}));
  const promEst=d.estudiantes.map(e=>{const proms=d.asignaturas.map(a=>e.registros[a.id].calc.periodos[periodo-1].promedio);const riesgo=d.asignaturas.filter(a=>{const x=e.registros[a.id].calc.periodos[periodo-1].promedio;return x!==null&&x<d.min;}).map(a=>a.nombre);return {id:e.idEstudiante,nombre:e.nombre,promedio:promedio(proms),riesgo};});
  const con=promEst.filter(x=>x.promedio!==null);let pendientes=0,recuperacion=0;
  d.estudiantes.forEach(e=>{let pend=false,rec=false;d.asignaturas.forEach(a=>{const c=e.registros[a.id].calc,p=c.periodos[periodo-1];if(c.estado==='INCOMPLETO'||p.estado==='INCOMPLETO'||p.estado==='SIN NOTAS')pend=true;if(p.pendientesRP>0||p.estado==='RECUPERACIÓN PENDIENTE')rec=true;});if(pend)pendientes++;if(rec)recuperacion++;});
  const dist=[0,0,0,0];con.forEach(x=>{const n=x.promedio!;dist[n<70?0:n<80?1:n<90?2:3]++;});
  const situacion={PROMOVIDO:0,REPITENTE:0,PENDIENTE:0};d.estudiantes.forEach(e=>situacion[e.situacion]++);
  const contar=(re:RegExp)=>d.estudiantes.filter(e=>d.asignaturas.some(a=>re.test(e.registros[a.id].calc.estado||''))).length;
  return {curso:{ano:d.ano,grado:d.grado,seccion:d.seccion},periodo,min:d.min,totalEstudiantes:d.estudiantes.length,promedioGeneral:promedio(con.map(x=>x.promedio)),porcentajeAprobando:con.length?con.filter(x=>x.promedio!>=d.min).length/con.length:null,enRiesgo:promEst.filter(x=>x.riesgo.length).sort((a,b)=>b.riesgo.length-a.riesgo.length),mejor:con.slice().sort((a,b)=>b.promedio!-a.promedio!).slice(0,5),porAsignatura,distribucion:dist,situacion,estudiantesPendientes:pendientes,estudiantesEnRecuperacion:recuperacion,estudiantesCompletiva:contar(/COMPLETIVA/),estudiantesExtraordinaria:contar(/EXTRAORDINARIA/),estudiantesEspecial:contar(/ESPECIAL/)};
}

export async function historialReporte(ctx:Ctx,idEstudiante:string){
  permiso(ctx,'estudiantes.ver');
  const rows=await prisma.enrollment.findMany({where:{studentId:idEstudiante},include:{section:{include:{course:true}}},orderBy:{schoolYearId:'desc'}});
  const result=[];
  for(const e of rows){try{const d=await datosCursoReporte(ctx,e.schoolYearId,e.sectionId,false,idEstudiante,false);const est=d.estudiantes.find(x=>x.idEstudiante===idEstudiante);result.push({ano:e.schoolYearId,curso:`${d.grado} ${d.seccion}`,situacion:est?.situacion||'RETIRADO'});}catch(err){if(err instanceof ErrorApp&&['NO_ENCONTRADO','VALIDACION'].includes(err.codigo))continue;throw err;}}
  return {items:result};
}

export async function boletinEstudiante(ctx:Ctx,ano:string,idSeccion:string,idEstudiante:string){
  const d=await datosCursoReporte(ctx,ano,idSeccion);const estudiante=d.estudiantes.find(e=>e.idEstudiante===idEstudiante);if(!estudiante)return fuera();return {curso:d,estudiante};
}

/** Expediente individual separado del boletín oficial; observaciones solo si tiene permiso propio. */
export async function expedienteEstudiante(ctx:Ctx,ano:string,idSeccion:string,idEstudiante:string){
  const result=await boletinEstudiante(ctx,ano,idSeccion,idEstudiante);
  const observaciones=ctx.set['observaciones.ver']===true?await observacionesParaExpediente(ctx,ano,idSeccion,idEstudiante):null;
  return {...result,observaciones};
}
