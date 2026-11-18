import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db';
import { ErrorApp } from '../../lib/errors';
import { siguienteIdTx_ } from '../../lib/ids';
import { Ctx } from '../auth/auth.service';
import { exigirAccesoSeccionAcademica } from '../crud/autorizacion';
import { tiposObservacionConfigurados } from '../configuration/configuration.service';

export const TIPOS_OBSERVACION = ['ACADEMICA', 'CONDUCTA', 'ASISTENCIA', 'FAMILIA', 'OTRA'] as const;
export type TipoObservacion = string;
export type EstadoObservacion = 'ACTIVA' | 'ANULADA';
export interface FiltrosObservaciones { ano:string; seccion:string; estudiante?:string; tipo?:string; q?:string; incluirAnuladas?:boolean; pag?:number; tam?:number }
export interface DatosObservacion { idEstudiante?:unknown; tipo?:unknown; fecha?:unknown; idAsignatura?:unknown; idPeriodo?:unknown; texto?:unknown }
const errFuera=()=>new ErrorApp('El registro no existe o está fuera de su alcance.','NO_ENCONTRADO');
const exigirPermiso=(ctx:Ctx,p:string)=>{if(ctx.set[p]!==true)throw new ErrorApp('No tiene permiso para realizar esta acción.','PERMISO');};
const elevado=(ctx:Ctx)=>ctx.rol==='ADMINISTRADOR'||ctx.set['cursos.ver_todos']===true||ctx.set['observaciones.administrar']===true;
const limpiar=(v:unknown)=>String(v??'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim();
const fechaTxt=(d:Date|string)=>{const x=d instanceof Date?d:new Date(d);return Number.isNaN(x.getTime())?'':x.toISOString().slice(0,10);};
function fechaValida(v:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00.000Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;}
function validarTipo(v:unknown,permitidos:readonly string[]=TIPOS_OBSERVACION):TipoObservacion{const t=limpiar(v);if(!permitidos.includes(t))throw new ErrorApp('El tipo de observación no es válido o está inactivo.','VALIDACION');return t as TipoObservacion;}
function textoValido(v:unknown){const t=limpiar(v);if(!t)throw new ErrorApp('Escriba la observación.','VALIDACION');if(t.length<3)throw new ErrorApp('La observación es demasiado corta.','VALIDACION');if(t.length>600)throw new ErrorApp('La observación es demasiado larga (máximo 600 caracteres).','VALIDACION');return t;}
function fechaEntrada(v:unknown){const s=limpiar(v)||new Date().toISOString().slice(0,10);if(!fechaValida(s))throw new ErrorApp('La fecha no es válida.','VALIDACION');return s;}
function idOpcional(v:unknown){return limpiar(v)||null;}
function autor(ctx:Ctx,o:{teacherId:string|null;creadoPor:string}){return ctx.idDocente?o.teacherId===ctx.idDocente:o.creadoPor===ctx.usuario;}
function puedeEditar(ctx:Ctx,o:{teacherId:string|null;creadoPor:string}){return ctx.set['observaciones.administrar']===true||ctx.rol==='ADMINISTRADOR'||(ctx.set['observaciones.editar']===true&&autor(ctx,o));}

async function tutorDeSeccion(ctx:Ctx,ano:string,seccion:string,courseId:string){
  if(!ctx.idDocente)return false;
  return !!(await prisma.tutoringAssignment.findFirst({where:{schoolYearId:ano,sectionId:seccion,courseId,teacherId:ctx.idDocente,estado:'ACTIVA',section:{estado:'ACTIVO',course:{schoolYearId:ano,estado:'ACTIVO'} }},select:{id:true}}));
}
async function permisoVerTodas(ctx:Ctx,ano:string,seccion:string,courseId:string){
  if(elevado(ctx))return true;
  return tutorDeSeccion(ctx,ano,seccion,courseId);
}
async function seccion(ctx:Ctx,ano:string,id:string){
  if(!/^\d{4}-\d{4}$/.test(ano))throw new ErrorApp('Año escolar inválido.','VALIDACION');
  return exigirAccesoSeccionAcademica(ctx,ano,id);
}

async function validarMatricula(ano:string,seccionId:string,courseId:string,studentId:string,tx:typeof prisma=prisma){
  const enrollment=await tx.enrollment.findFirst({where:{schoolYearId:ano,sectionId:seccionId,courseId,studentId,estado:'ACTIVO',student:{estado:'ACTIVO'},section:{estado:'ACTIVO',course:{estado:'ACTIVO',schoolYearId:ano}}},select:{id:true}});
  if(!enrollment)throw new ErrorApp('El estudiante no está inscrito activamente en esta sección.','VALIDACION');
}
async function validarMatriculaRegistrada(ano:string,seccionId:string,courseId:string,studentId:string){
  const enrollment=await prisma.enrollment.findFirst({where:{schoolYearId:ano,sectionId:seccionId,courseId,studentId},select:{id:true}});
  if(!enrollment)throw errFuera();
}

async function validarPeriodo(ano:string,periodId:string|null,tx:typeof prisma=prisma){
  if(!periodId)return null;
  const period=await tx.period.findFirst({where:{id:periodId,schoolYearId:ano},select:{id:true}});
  if(!period)throw new ErrorApp('El período no corresponde al año escolar.','VALIDACION');
  return period;
}

async function validarAsignatura(ctx:Ctx,ano:string,courseId:string,seccionId:string,subjectId:string|null,periodId:string|null){
  if(!subjectId)return null;
  const [subject,course]=await Promise.all([
    prisma.subject.findUnique({where:{id:subjectId},select:{id:true,estado:true,grados:true,nombre:true}}),
    prisma.course.findUnique({where:{id:courseId},select:{grado:true,schoolYearId:true,estado:true}}),
  ]);
  if(!subject||subject.estado!=='ACTIVO'||!course||course.estado!=='ACTIVO'||course.schoolYearId!==ano||(!subject.grados.includes('*')&&!subject.grados.includes(course.grado)))
    throw new ErrorApp('La asignatura no corresponde a esta sección.','VALIDACION');
  if(!elevado(ctx)){
    const assignment=await prisma.teachingAssignment.findFirst({where:{schoolYearId:ano,sectionId:seccionId,courseId,subjectId,teacherId:ctx.idDocente||'',estado:'ACTIVO',...(periodId?{OR:[{periodId:null},{periodId}]}:{periodId:null}),section:{estado:'ACTIVO',course:{schoolYearId:ano,estado:'ACTIVO'}}},select:{id:true}});
    if(!assignment)throw new ErrorApp('No tiene asignación activa para esa asignatura y período.','PERMISO');
  }
  return subject;
}

export async function seccionesObservaciones(ctx:Ctx){
  exigirPermiso(ctx,'observaciones.ver');
  if(elevado(ctx)){
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

export async function opcionesObservaciones(ctx:Ctx,ano:string,seccionId:string){
  exigirPermiso(ctx,'observaciones.ver');const s=await seccion(ctx,ano,seccionId);
  const [enrollments,periods,subjects,all]=await Promise.all([
    prisma.enrollment.findMany({where:{schoolYearId:ano,sectionId:seccionId,courseId:s.courseId,student:{estado:{not:'INACTIVO'}}},include:{student:true},orderBy:{numLista:'asc'}}),
    prisma.period.findMany({where:{schoolYearId:ano},orderBy:{orden:'asc'}}),
    elevado(ctx)?prisma.subject.findMany({where:{estado:'ACTIVO',OR:[{grados:{has:'*'}},{grados:{has:s.course.grado}}]},orderBy:{orden:'asc'}}):ctx.idDocente?prisma.subject.findMany({where:{estado:'ACTIVO',assignments:{some:{schoolYearId:ano,sectionId:seccionId,courseId:s.courseId,teacherId:ctx.idDocente,estado:'ACTIVO',section:{estado:'ACTIVO',course:{schoolYearId:ano,estado:'ACTIVO'}}}}},orderBy:{orden:'asc'}}):Promise.resolve([]),
    permisoVerTodas(ctx,ano,seccionId,s.courseId),
  ]);
  const tipos=(await tiposObservacionConfigurados()).filter(t=>t.activo).map(t=>({codigo:t.codigo,nombre:t.nombre}));
  return {ano,seccion:seccionId,estudiantes:enrollments.map(e=>({id:e.studentId,num:e.numLista,nombre:e.student.nombreCompleto,activo:e.estado==='ACTIVO'})),periodos:periods.map(p=>({id:p.id,codigo:p.codigo,nombre:p.nombre})),asignaturas:subjects.map(a=>({id:a.id,nombre:a.nombre})),tipos,puedeRegistrar:ctx.set['observaciones.registrar']===true,puedeVerTodas:all};
}

function whereAutorizado(ctx:Ctx,ano:string,seccionId:string,courseId:string,all:boolean,filters:FiltrosObservaciones,tipos:readonly string[]):Prisma.ObservationWhereInput{
  return {schoolYearId:ano,sectionId:seccionId,courseId,...(!filters.incluirAnuladas?{estado:'ACTIVA'}:{}),...(filters.estudiante?{studentId:filters.estudiante}:{}),...(filters.tipo?{tipo:validarTipo(filters.tipo,tipos)}:{}),OR:[{periodId:null},{period:{schoolYearId:ano}}],...(!all?{...(ctx.idDocente?{teacherId:ctx.idDocente}:{creadoPor:ctx.usuario})}:{}),...(filters.q?{AND:[{OR:[{observacion:{contains:filters.q,mode:'insensitive'}},{student:{nombreCompleto:{contains:filters.q,mode:'insensitive'}}},{subject:{nombre:{contains:filters.q,mode:'insensitive'}}},{teacher:{nombreCompleto:{contains:filters.q,mode:'insensitive'}}}]}]}:{})};
}

function dto(o:{id:string;fecha:Date;studentId:string;tipo:string;subjectId:string|null;periodId:string|null;teacherId:string|null;creadoPor:string;observacion:string;estado:string;student:{nombreCompleto:string};subject:{nombre:string}|null;period:{codigo:string}|null;teacher:{nombreCompleto:string}|null},ctx:Ctx){
  return {id:o.id,fecha:fechaTxt(o.fecha),idEstudiante:o.studentId,estudiante:o.student.nombreCompleto,tipo:o.tipo,idAsignatura:o.subjectId,asignatura:o.subject?.nombre||'',idPeriodo:o.periodId,periodo:o.period?.codigo||'',docente:o.teacher?.nombreCompleto||o.creadoPor,texto:o.observacion,estado:o.estado,puedeEditar:puedeEditar(ctx,o)};
}

export async function listarObservaciones(ctx:Ctx,f:FiltrosObservaciones){
  exigirPermiso(ctx,'observaciones.ver');const s=await seccion(ctx,f.ano,f.seccion);const all=await permisoVerTodas(ctx,f.ano,f.seccion,s.courseId);
  const tipos=(await tiposObservacionConfigurados()).map(t=>t.codigo);
  if(f.tipo)validarTipo(f.tipo,tipos);
  const pag=Math.max(1,Math.floor(f.pag||1)),tam=Math.min(100,Math.max(1,Math.floor(f.tam||25))),filters={...f,q:limpiar(f.q).slice(0,100)},where:Prisma.ObservationWhereInput={...whereAutorizado(ctx,f.ano,f.seccion,s.courseId,all,filters,tipos),student:{enrollments:{some:{schoolYearId:f.ano,sectionId:f.seccion,courseId:s.courseId}}}};
  const [total,rows]=await Promise.all([prisma.observation.count({where}),prisma.observation.findMany({where,include:{student:true,subject:true,period:true,teacher:true},orderBy:[{fecha:'desc'},{modificado:'desc'},{creado:'desc'}],skip:(pag-1)*tam,take:tam})]);
  return {items:rows.map(r=>dto(r,ctx)),total,pag,paginas:Math.ceil(total/tam),estudiantes:(await prisma.enrollment.findMany({where:{schoolYearId:f.ano,sectionId:f.seccion,courseId:s.courseId,student:{estado:{not:'INACTIVO'}}},include:{student:true},orderBy:{numLista:'asc'}})).map(e=>({id:e.studentId,num:e.numLista,nombre:e.student.nombreCompleto,activo:e.estado==='ACTIVO'})),puedeRegistrar:ctx.set['observaciones.registrar']===true};
}

/** Observaciones activas y visibles para una ficha individual de reportes. */
export async function observacionesParaExpediente(ctx:Ctx,ano:string,seccionId:string,studentId:string){
  exigirPermiso(ctx,'observaciones.ver');
  const first=await listarObservaciones(ctx,{ano,seccion:seccionId,estudiante:studentId,pag:1,tam:100});
  const items=[...first.items];
  for(let pag=2;pag<=first.paginas;pag++){
    const next=await listarObservaciones(ctx,{ano,seccion:seccionId,estudiante:studentId,pag,tam:100});items.push(...next.items);
  }
  return items;
}

async function observacionAutorizada(ctx:Ctx,id:string){
  const o=await prisma.observation.findUnique({where:{id},include:{student:true,subject:true,period:true,teacher:true,section:{include:{course:true}}}});
  if(!o||o.section.course.schoolYearId!==o.schoolYearId||o.section.courseId!==o.courseId||o.sectionId!==o.section.id)throw errFuera();
  await seccion(ctx,o.schoolYearId,o.sectionId);
  await validarMatriculaRegistrada(o.schoolYearId,o.sectionId,o.courseId,o.studentId);
  await validarPeriodo(o.schoolYearId,o.periodId);
  const all=await permisoVerTodas(ctx,o.schoolYearId,o.sectionId,o.courseId);
  if(!all&&!autor(ctx,o))throw errFuera();
  return o;
}

export async function obtenerObservacion(ctx:Ctx,id:string){
  exigirPermiso(ctx,'observaciones.ver');const o=await observacionAutorizada(ctx,id);return dto(o,ctx);
}

function campos(datos:DatosObservacion,actual?:{tipo:string;fecha:Date;observacion:string;subjectId:string|null;periodId:string|null},permitidos:readonly string[]=TIPOS_OBSERVACION){
  const idAsignatura=datos.idAsignatura===undefined&&actual?actual.subjectId:idOpcional(datos.idAsignatura),idPeriodo=datos.idPeriodo===undefined&&actual?actual.periodId:idOpcional(datos.idPeriodo);
  return {tipo:datos.tipo===undefined&&actual?validarTipo(actual.tipo,permitidos):validarTipo(datos.tipo,permitidos),fecha:fechaEntrada(datos.fecha===undefined&&actual?fechaTxt(actual.fecha):datos.fecha),observacion:textoValido(datos.texto===undefined&&actual?actual.observacion:datos.texto),subjectId:idAsignatura,periodId:idPeriodo};
}

export async function crearObservacion(ctx:Ctx,input:{ano:unknown;seccion:unknown;idEstudiante:unknown}&DatosObservacion){
  exigirPermiso(ctx,'observaciones.registrar');const ano=limpiar(input.ano),seccionId=limpiar(input.seccion),studentId=limpiar(input.idEstudiante);
  if(!ano||!seccionId||!studentId)throw new ErrorApp('Indique año, sección y estudiante.','VALIDACION');
  const s=await seccion(ctx,ano,seccionId);const tipos=(await tiposObservacionConfigurados()).filter(t=>t.activo).map(t=>t.codigo);const data=campos(input,undefined,tipos);await validarMatricula(ano,seccionId,s.courseId,studentId);await validarPeriodo(ano,data.periodId);await validarAsignatura(ctx,ano,s.courseId,seccionId,data.subjectId,data.periodId);
  const id=await prisma.$transaction(async tx=>{
    await validarMatricula(ano,seccionId,s.courseId,studentId,tx as unknown as typeof prisma);await validarPeriodo(ano,data.periodId,tx as unknown as typeof prisma);
    const newId=await siguienteIdTx_(tx,'OBS');const now=new Date();
    await tx.observation.create({data:{id:newId,schoolYearId:ano,studentId,courseId:s.courseId,sectionId:seccionId,teacherId:ctx.idDocente,subjectId:data.subjectId,periodId:data.periodId,tipo:data.tipo,fecha:new Date(data.fecha+'T00:00:00.000Z'),observacion:data.observacion,estado:'ACTIVA',creado:now,modificado:now,creadoPor:ctx.usuario}});
    await tx.auditLog.create({data:{fecha:now,usuario:ctx.usuario,accion:'CREAR',modulo:'OBSERVACIONES',idRegistro:newId,descripcion:`${data.tipo} · ${studentId}`,valorAnterior:Prisma.JsonNull,valorNuevo:{tipo:data.tipo,fecha:data.fecha,texto:data.observacion.slice(0,120)}}});
    return newId;
  });return {id};
}

export async function actualizarObservacion(ctx:Ctx,id:string,input:DatosObservacion&{idEstudiante?:unknown}){
  exigirPermiso(ctx,'observaciones.editar');const current=await observacionAutorizada(ctx,id);
  if(!puedeEditar(ctx,current))throw new ErrorApp('Solo el autor de la observación (o un administrador) puede modificarla.','PERMISO');
  if(current.estado==='ANULADA')throw new ErrorApp('La observación está anulada.','VALIDACION');
  if(input.idEstudiante!==undefined&&limpiar(input.idEstudiante)!==current.studentId)throw new ErrorApp('No se puede cambiar el estudiante de una observación existente.','VALIDACION');
  const tipos=(await tiposObservacionConfigurados()).filter(t=>t.activo).map(t=>t.codigo);if(input.tipo===undefined||String(input.tipo)===current.tipo)tipos.push(current.tipo);const data=campos(input,current,tipos);await validarPeriodo(current.schoolYearId,data.periodId);if(data.subjectId!==current.subjectId||data.periodId!==current.periodId)await validarAsignatura(ctx,current.schoolYearId,current.courseId,current.sectionId,data.subjectId,data.periodId);
  await prisma.$transaction(async tx=>{
    const fresh=await tx.observation.findUnique({where:{id}});if(!fresh||fresh.estado!=='ACTIVA'||fresh.schoolYearId!==current.schoolYearId||fresh.sectionId!==current.sectionId)throw errFuera();
    if(!puedeEditar(ctx,fresh))throw new ErrorApp('Solo el autor de la observación (o un administrador) puede modificarla.','PERMISO');
    const now=new Date();await tx.observation.update({where:{id},data:{tipo:data.tipo,fecha:new Date(data.fecha+'T00:00:00.000Z'),subjectId:data.subjectId,periodId:data.periodId,observacion:data.observacion,modificado:now}});
    await tx.auditLog.create({data:{fecha:now,usuario:ctx.usuario,accion:'EDITAR',modulo:'OBSERVACIONES',idRegistro:id,descripcion:`${data.tipo} · ${current.studentId}`,valorAnterior:{tipo:current.tipo,fecha:fechaTxt(current.fecha),texto:current.observacion.slice(0,120)},valorNuevo:{tipo:data.tipo,fecha:data.fecha,texto:data.observacion.slice(0,120)}}});
  });return {id};
}

export async function cambiarEstadoObservacion(ctx:Ctx,id:string,estado:unknown){
  exigirPermiso(ctx,'observaciones.editar');const next=limpiar(estado);if(next!=='ACTIVA'&&next!=='ANULADA')throw new ErrorApp('Estado no válido.','VALIDACION');
  const current=await observacionAutorizada(ctx,id);if(!puedeEditar(ctx,current))throw new ErrorApp('Solo el autor de la observación (o un administrador) puede cambiar su estado.','PERMISO');
  await prisma.$transaction(async tx=>{const fresh=await tx.observation.findUnique({where:{id}});if(!fresh)throw errFuera();if(!puedeEditar(ctx,fresh))throw new ErrorApp('Solo el autor de la observación (o un administrador) puede cambiar su estado.','PERMISO');const now=new Date();await tx.observation.update({where:{id},data:{estado:next,modificado:now}});await tx.auditLog.create({data:{fecha:now,usuario:ctx.usuario,accion:'ESTADO',modulo:'OBSERVACIONES',idRegistro:id,descripcion:`Observación ${fresh.estado} → ${next}`,valorAnterior:fresh.estado,valorNuevo:next}});});
  return {id,estado:next};
}
