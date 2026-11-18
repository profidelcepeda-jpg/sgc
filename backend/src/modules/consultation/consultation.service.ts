import { prisma } from '../../lib/db';
import { ErrorApp } from '../../lib/errors';
import { Ctx } from '../auth/auth.service';
import { anosAlcanzables, exigirAccesoSeccionAcademica, exigirPermiso, seccionesAlcanzables } from '../crud/autorizacion';
import { datosCursoReporte, historialReporte } from '../reports/reports.service';
import { observacionesParaExpediente } from '../observations/observations.service';
import { buscarEstudiantes, estudiantesDeSeccion, perfilEstudiante, resolverInscripcionVisible } from '../students/students.service';
export { buscarEstudiantes, estudiantesDeSeccion, perfilEstudiante };

const global = (ctx:Ctx) => ctx.rol === 'ADMINISTRADOR' || ctx.set['cursos.ver_todos'] === true;
const globalNotas = (ctx:Ctx) => global(ctx) || ctx.set['calificaciones.administrar'] === true;
const texto = (x:unknown) => typeof x === 'string' ? x.trim() : '';
function anoValido(ano:string){if(!/^\d{4}-\d{4}$/.test(ano))throw new ErrorApp('Año escolar inválido.','VALIDACION');}
function sinAcceso():never{throw new ErrorApp('El registro no existe o está fuera de su alcance.','NO_ENCONTRADO');}

/** Años y secciones que el usuario puede usar como filtros; los IDs se resuelven desde PostgreSQL. */
export async function opcionesConsulta(ctx:Ctx,anoSolicitado?:unknown){
  exigirPermiso(ctx,'estudiantes.ver');
  const anos=global(ctx)?(await prisma.schoolYear.findMany({select:{id:true},orderBy:{id:'desc'}})).map(x=>x.id):await anosAlcanzables(ctx);
  const ano=texto(anoSolicitado);
  if(ano){anoValido(ano);if(!anos.includes(ano))return {anos:[],secciones:[],grados:[],asignaturas:[],docentes:[],periodos:[]};}
  const anosConsulta=ano?[ano]:anos;
  const permitidas=global(ctx)?null:(await Promise.all(anosConsulta.map(y=>seccionesAlcanzables(ctx,y)))).flat();
  const rows=await prisma.section.findMany({where:{estado:'ACTIVO',...(permitidas?{id:{in:permitidas}}:{}),course:{estado:'ACTIVO',...(ano?{schoolYearId:ano}:{schoolYearId:{in:anosConsulta}})}},include:{course:true,tutorings:{where:{estado:'ACTIVA',...(!global(ctx)?{teacherId:ctx.idDocente||''}:{})},include:{teacher:true}},assignments:{where:{estado:'ACTIVO',...(!global(ctx)?{teacherId:ctx.idDocente||''}:{})},include:{teacher:true,subject:true}}},orderBy:[{course:{schoolYearId:'desc'}},{course:{grado:'asc'}},{seccion:'asc'}]});
  const periodos=await prisma.period.findMany({where:{schoolYearId:{in:anosConsulta}},select:{id:true,schoolYearId:true,codigo:true,nombre:true,tipo:true},orderBy:{orden:'asc'}});
  const secciones=rows.map(s=>({id:s.id,ano:s.course.schoolYearId,curso:s.courseId,grado:s.course.grado,seccion:s.seccion,etiqueta:`${s.course.schoolYearId} · ${s.course.grado} ${s.seccion}`,tutor:s.tutorings[0]?.teacher.nombreCompleto||'',docentes:Array.from(new Set(s.assignments.map(a=>a.teacher.nombreCompleto)))}));
  const materias=Array.from(new Map(rows.flatMap(s=>s.assignments.map(a=>[a.subject.id,{id:a.subject.id,nombre:a.subject.nombre}] as const))).values()).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  const docentes=Array.from(new Map(rows.flatMap(s=>[...s.assignments.map(a=>[a.teacher.id,{id:a.teacher.id,nombre:a.teacher.nombreCompleto}] as const),...s.tutorings.map(t=>[t.teacher.id,{id:t.teacher.id,nombre:t.teacher.nombreCompleto}] as const)])).values()).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  return {anos:anosConsulta,secciones,grados:Array.from(new Set(secciones.map(s=>s.grado))).sort(),asignaturas:materias,docentes,periodos};
}

/** Búsqueda paginada en BD; los filtros de sección siempre se intersectan con el alcance servidor. */
/** Orquesta datos de expediente; el motor y las reglas de reportes siguen siendo la fuente académica. */
export async function expedienteAcademico(ctx:Ctx,idEstudiante:string,ano:unknown){
  exigirPermiso(ctx,'estudiantes.ver');exigirPermiso(ctx,'calificaciones.ver');
  const year=texto(ano);if(!year)throw new ErrorApp('Seleccione el año escolar.','VALIDACION');
  const ins=await resolverInscripcionVisible(ctx,idEstudiante,year);
  let porAsignatura:Record<string,string[]|null>|undefined;
  if(!globalNotas(ctx)){
    porAsignatura={};
    if(ctx.idDocente){
      const asignaciones=await prisma.teachingAssignment.findMany({where:{schoolYearId:year,sectionId:ins.sectionId,courseId:ins.courseId,teacherId:ctx.idDocente,estado:'ACTIVO',section:{estado:'ACTIVO',course:{schoolYearId:year,estado:'ACTIVO'}},OR:[{periodId:null},{period:{schoolYearId:year}}]},select:{subjectId:true,periodId:true}});
      for(const a of asignaciones){if(a.periodId===null)porAsignatura[a.subjectId]=null;else if(porAsignatura[a.subjectId]!==null)(porAsignatura[a.subjectId]||=[]).push(a.periodId);}
      for(const [id,ids] of Object.entries(porAsignatura))if(ids)porAsignatura[id]=Array.from(new Set(ids));
    }
  }
  const [reporte,observaciones]=await Promise.all([
    datosCursoReporte(ctx,year,ins.sectionId,false,idEstudiante,ctx.set['asistencia.ver']===true,porAsignatura?{porAsignatura}:undefined),
    ctx.set['observaciones.ver']===true?observacionesParaExpediente(ctx,year,ins.sectionId,idEstudiante):Promise.resolve(null),
  ]);
  const estudianteOriginal=reporte.estudiantes[0];if(!estudianteOriginal)sinAcceso();
  const estudiante=porAsignatura?{...estudianteOriginal,registros:Object.fromEntries(Object.entries(estudianteOriginal.registros).map(([subjectId,registro])=>{
    const permitidos=porAsignatura![subjectId];if(permitidos===null)return [subjectId,registro];
    const notas={...registro.notas};reporte.periodos.forEach((p,i)=>{if(!permitidos?.includes(p.id))for(let c=1;c<=4;c++){notas[`P${i+1}C${c}`]=null;notas[`R${i+1}C${c}`]=null;}});
    for(const p of reporte.etapas)if(!permitidos?.includes(p.id))notas[p.etapa==='COMPLETIVA'?'CEC':p.etapa==='EXTRAORDINARIA'?'CEEX':'CESP']=null;
    const calc=registro.calc,visible=reporte.periodos.map(p=>permitidos?.includes(p.id));
    const parcial={...calc,periodos:calc.periodos.map((p,i)=>visible[i]?p:{...p,promedio:null,ingresadas:0,pendientesRP:0,estado:'SIN ACCESO'}),efectiva:calc.efectiva.map((r,i)=>visible[i]?r:r.map(()=>null)),vigente:calc.vigente.map((r,i)=>visible[i]?r:r.map(()=>null)),pcMostrar:calc.pcMostrar.map((n,i)=>visible[i]?n:null),cf:null,cfReal:null,estado:'CONSULTA PARCIAL',etapa:null,A:null,R:null,situacion:'CONSULTA PARCIAL',comp:{base:null,mitad:null,cec:null,ccf:null},ext:{base:null,mitad:null,ceex:null,cexf:null},esp:{cf:null,cesp:null}};
    return [subjectId,{notas,calc:parcial}];
  }))}:estudianteOriginal;
  const asignaturas=globalNotas(ctx)?reporte.asignaturas:reporte.asignaturas.map(a=>({...a,docentes:[ctx.nombre]}));
  return {datos:{id:ins.studentId,nombre:ins.student.nombreCompleto,nombres:ins.student.nombres,apellidos:ins.student.apellidos,matricula:ins.student.matricula,estado:ins.student.estado},inscripcion:{ano:ins.schoolYearId,estado:ins.estado,numLista:ins.numLista},curso:{id:ins.courseId,ano:year,grado:ins.section.course.grado,seccion:ins.section.seccion,idSeccion:ins.sectionId,tutor:reporte.tutor},asignaturas,periodos:reporte.periodos,etapas:reporte.etapas,estudiante,asistencia:ctx.set['asistencia.ver']===true?estudiante.asistencia:null,observaciones};
}

export async function historialEstudiante(ctx:Ctx,idEstudiante:string){
  exigirPermiso(ctx,'estudiantes.ver');
  exigirPermiso(ctx,'calificaciones.ver');
  if(globalNotas(ctx))return historialReporte(ctx,idEstudiante);
  const rows=await prisma.enrollment.findMany({where:{studentId:idEstudiante},include:{section:{include:{course:true}}},orderBy:{schoolYearId:'desc'}});
  const items=[];
  for(const e of rows){try{await exigirAccesoSeccionAcademica(ctx,e.schoolYearId,e.sectionId);items.push({ano:e.schoolYearId,curso:`${e.section.course.grado} ${e.section.seccion}`,situacion:'CONSULTA PARCIAL'});}catch(err){if(err instanceof ErrorApp&&err.codigo==='NO_ENCONTRADO')continue;throw err;}}
  return {items};
}

export async function seccionesConsulta(ctx:Ctx,ano?:unknown,grado?:unknown,estado?:unknown){
  exigirPermiso(ctx,'cursos.ver');
  const year=texto(ano),grade=texto(grado),state=texto(estado);if(year)anoValido(year);if(state&&!['ACTIVO','INACTIVO'].includes(state))throw new ErrorApp('Estado inválido.','VALIDACION');
  const accessibleYears=global(ctx)?undefined:await anosAlcanzables(ctx);
  if(year&&accessibleYears&&!accessibleYears.includes(year))return {items:[]};
  const ids=global(ctx)?undefined:await seccionesAlcanzables(ctx,year||'');
  const rows=await prisma.section.findMany({where:{...(state?{estado:state}:{estado:'ACTIVO'}),...(ids?{id:{in:ids}}:{}),course:{estado:'ACTIVO',...(year?{schoolYearId:year}:accessibleYears?{schoolYearId:{in:accessibleYears}}:{}),...(grade?{grado:grade}:{})}},include:{course:true,tutorings:{where:{estado:'ACTIVA',...(year?{schoolYearId:year}:{})},include:{teacher:true}},assignments:{where:{estado:'ACTIVO',...(year?{schoolYearId:year}:{})},include:{teacher:true}}},orderBy:[{course:{schoolYearId:'desc'}},{course:{grado:'asc'}},{seccion:'asc'}]});
  return {items:rows.map(s=>({id:s.id,ano:s.course.schoolYearId,curso:s.courseId,grado:s.course.grado,seccion:s.seccion,estado:s.estado,tutor:s.tutorings[0]?.teacher.nombreCompleto||'',docentes:Array.from(new Set(s.assignments.map(a=>a.teacher.nombreCompleto)))}))};
}

