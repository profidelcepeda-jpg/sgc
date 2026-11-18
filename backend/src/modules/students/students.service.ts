import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db';
import { ErrorApp } from '../../lib/errors';
import { siguienteIdTx_ } from '../../lib/ids';
import { Ctx } from '../auth/auth.service';
import { exigirAccesoSeccionAcademica, exigirPermiso, seccionesAlcanzables } from '../crud/autorizacion';

const global=(ctx:Ctx)=>ctx.rol==='ADMINISTRADOR'||ctx.set['cursos.ver_todos']===true;
const txt=(v:unknown)=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').trim():'';
function sinAcceso():never{throw new ErrorApp('El estudiante no existe o está fuera de su alcance.','NO_ENCONTRADO');}
const validarAno=(v:string)=>{if(!/^\d{4}-\d{4}$/.test(v))throw new ErrorApp('Año escolar inválido.','VALIDACION');};

export interface FiltrosEstudiantes { q?:unknown; ano?:unknown; periodo?:unknown; grado?:unknown; curso?:unknown; seccion?:unknown; asignatura?:unknown; docente?:unknown; estado?:unknown; pag?:unknown; tam?:unknown }
export interface DatosEstudiante { nombreCompleto?:unknown; nombres?:unknown; apellidos?:unknown; matricula?:unknown; sexo?:unknown; fechaNacimiento?:unknown }

function validarNombre(nombre:string){if(nombre.length<3||nombre.length>120)throw new ErrorApp('Escriba el nombre completo del estudiante (3 a 120 caracteres).','VALIDACION');return nombre;}
function partirNombre(nombre:string){const pos=nombre.indexOf(',');return pos>0?{apellidos:nombre.slice(0,pos).trim()||null,nombres:nombre.slice(pos+1).trim()||null}:{apellidos:null,nombres:null};}
function validarSexo(v:unknown){const sexo=txt(v).toUpperCase();if(sexo&&!['M','F'].includes(sexo))throw new ErrorApp('El sexo debe ser M o F.','VALIDACION');return sexo||null;}
function validarFecha(v:unknown){const s=txt(v);if(!s)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new ErrorApp('La fecha de nacimiento no es válida.','VALIDACION');const date=new Date(`${s}T00:00:00.000Z`);if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==s)throw new ErrorApp('La fecha de nacimiento no es válida.','VALIDACION');return date;}
function validarEstado(v:string){if(v&&!['ACTIVO','RETIRADO','INACTIVO'].includes(v))throw new ErrorApp('Estado de estudiante inválido.','VALIDACION');}
function esDuplicado(e:unknown){return e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002';}

/** Búsqueda paginada central. El alcance de secciones se resuelve siempre desde relaciones del usuario autenticado. */
export async function buscarEstudiantes(ctx:Ctx,f:FiltrosEstudiantes){
  exigirPermiso(ctx,'estudiantes.ver');
  const ano=txt(f.ano);if(!ano)throw new ErrorApp('Seleccione el año escolar.','VALIDACION');validarAno(ano);
  const q=txt(f.q).slice(0,100),sectionId=txt(f.seccion),courseId=txt(f.curso),grado=txt(f.grado),subjectId=txt(f.asignatura),teacherId=txt(f.docente),periodId=txt(f.periodo),estado=txt(f.estado);
  validarEstado(estado);
  if(q.length<2&&!sectionId&&!courseId&&!grado&&!subjectId&&!teacherId&&!periodId)throw new ErrorApp('Escriba al menos dos caracteres o seleccione un curso o filtro académico.','VALIDACION');
  if(sectionId)await exigirAccesoSeccionAcademica(ctx,ano,sectionId);
  if(teacherId&&!global(ctx)&&teacherId!==ctx.idDocente)throw new ErrorApp('No tiene permiso para filtrar por ese docente.','PERMISO');
  const alcance=global(ctx)?undefined:await seccionesAlcanzables(ctx,ano);
  const pagina=Math.max(1,Math.floor(Number(f.pag)||1)),tam=Math.min(50,Math.max(1,Math.floor(Number(f.tam)||20)));
  const ids=alcance?(sectionId?(alcance.includes(sectionId)?[sectionId]:[]):alcance):undefined;
  const sectionWhere:Prisma.SectionWhereInput={estado:'ACTIVO',...(sectionId?{id:sectionId}:{}),...(courseId?{courseId}:{}),course:{schoolYearId:ano,estado:'ACTIVO',...(grado?{grado}:{})},...(ids?{id:{in:ids}}:{}),...(subjectId||teacherId||periodId?{assignments:{some:{schoolYearId:ano,estado:'ACTIVO',...(subjectId?{subjectId}:{}),...(teacherId?{teacherId}:{}),...(periodId?{OR:[{periodId:null},{periodId,period:{schoolYearId:ano}}]}:{})}}}:{})};
  const studentWhere:Prisma.StudentWhereInput={...(estado==='INACTIVO'?{estado:'INACTIVO'}:estado?{estado:'ACTIVO'}:{estado:{not:'INACTIVO'}}),...(q?{OR:[{nombreCompleto:{contains:q,mode:'insensitive'}},{nombres:{contains:q,mode:'insensitive'}},{apellidos:{contains:q,mode:'insensitive'}},{matricula:{contains:q,mode:'insensitive'}}]}:{})};
  const where:Prisma.EnrollmentWhereInput={schoolYearId:ano,section:sectionWhere,student:studentWhere,...(estado==='RETIRADO'?{estado:'RETIRADO'}:estado==='ACTIVO'?{estado:'ACTIVO'}:{})};
  const [total,items]=await Promise.all([prisma.enrollment.count({where}),prisma.enrollment.findMany({where,include:{student:true,section:{include:{course:true}}},orderBy:[{numLista:'asc'},{student:{nombreCompleto:'asc'}}],skip:(pagina-1)*tam,take:tam})]);
  return {items:items.map(e=>({id:e.studentId,nombre:e.student.nombreCompleto,nombres:e.student.nombres,apellidos:e.student.apellidos,matricula:e.student.matricula,estado:e.estado,estadoEstudiante:e.student.estado,ano:e.schoolYearId,curso:e.courseId,seccion:e.sectionId,grado:e.section.course.grado,letra:e.section.seccion,numLista:e.numLista})),total,pag:pagina,tam,paginas:Math.ceil(total/tam)};
}

/** Resuelve inscripción y sección desde PostgreSQL antes de devolver datos personales. */
export async function resolverInscripcionVisible(ctx:Ctx,studentId:string,ano:string){
  exigirPermiso(ctx,'estudiantes.ver');validarAno(ano);
  const e=await prisma.enrollment.findFirst({where:{studentId,schoolYearId:ano},include:{student:true,section:{include:{course:true}}}});
  if(!e||e.section.course.schoolYearId!==ano||e.section.courseId!==e.courseId)sinAcceso();
  await exigirAccesoSeccionAcademica(ctx,ano,e.sectionId);return e;
}

export async function perfilEstudiante(ctx:Ctx,studentId:string,ano:unknown){
  const year=txt(ano);if(!year)throw new ErrorApp('Seleccione el año escolar.','VALIDACION');const e=await resolverInscripcionVisible(ctx,studentId,year);
  return {estudiante:{id:e.studentId,nombre:e.student.nombreCompleto,nombres:e.student.nombres,apellidos:e.student.apellidos,matricula:e.student.matricula,sexo:e.student.sexo,fechaNacimiento:e.student.fechaNacimiento?.toISOString().slice(0,10)||null,estado:e.student.estado},inscripcion:{ano:e.schoolYearId,estado:e.estado,numLista:e.numLista},curso:{id:e.courseId,grado:e.section.course.grado,seccion:e.section.seccion,idSeccion:e.sectionId}};
}

export async function estudiantesDeSeccion(ctx:Ctx,idSeccion:string,ano:unknown,estado?:unknown,pagRaw?:unknown,tamRaw?:unknown){
  exigirPermiso(ctx,'estudiantes.ver');const year=txt(ano);if(!year)throw new ErrorApp('Seleccione el año escolar.','VALIDACION');validarAno(year);
  const sec=await exigirAccesoSeccionAcademica(ctx,year,idSeccion),state=txt(estado);validarEstado(state);
  const pag=Math.max(1,Math.floor(Number(pagRaw)||1)),tam=Math.min(100,Math.max(1,Math.floor(Number(tamRaw)||50)));
  const where:Prisma.EnrollmentWhereInput={schoolYearId:year,sectionId:idSeccion,courseId:sec.courseId,...(state==='ACTIVO'?{estado:'ACTIVO',student:{estado:'ACTIVO'}}:state==='RETIRADO'?{estado:'RETIRADO'}:state==='INACTIVO'?{student:{estado:'INACTIVO'}}:{})};
  const [total,rows]=await Promise.all([prisma.enrollment.count({where}),prisma.enrollment.findMany({where,include:{student:true},orderBy:{numLista:'asc'},skip:(pag-1)*tam,take:tam})]);
  return {items:rows.map(e=>({id:e.studentId,nombre:e.student.nombreCompleto,matricula:e.student.matricula,estado:e.estado,estadoEstudiante:e.student.estado,numLista:e.numLista})),total,pag,paginas:Math.ceil(total/tam)};
}

async function validarMatriculaUnica(tx:Prisma.TransactionClient,matricula:string,excludeId?:string){
  if(!matricula)return;const found=await tx.student.findFirst({where:{matricula:{equals:matricula,mode:'insensitive'},...(excludeId?{id:{not:excludeId}}:{})},select:{id:true}});
  if(found)throw new ErrorApp('Ya existe un estudiante con esa matrícula.','CONFLICTO');
}
async function validarNombreDisponible(tx:Prisma.TransactionClient,nombre:string,excludeId?:string){
  const found=await tx.student.findFirst({where:{nombreCompleto:{equals:nombre,mode:'insensitive'},...(excludeId?{id:{not:excludeId}}:{})},select:{id:true}});
  if(found)throw new ErrorApp('Ya existe un estudiante con ese nombre. Use la matrícula existente para inscribirlo en otro año.','CONFLICTO');
}
function datosValidados(data:DatosEstudiante,previo?:{nombreCompleto:string;nombres:string|null;apellidos:string|null;matricula:string|null;sexo:string|null;fechaNacimiento:Date|null}){
  const nombres=txt(data.nombres??previo?.nombres),apellidos=txt(data.apellidos??previo?.apellidos);
  const separadas=data.nombres!==undefined||data.apellidos!==undefined;
  const nombre=validarNombre(txt(separadas?(apellidos?`${apellidos}, ${nombres}`:nombres):(data.nombreCompleto??previo?.nombreCompleto)));
  const parts=separadas?{nombres:nombres||null,apellidos:apellidos||null}:partirNombre(nombre);
  const matricula=txt(data.matricula??previo?.matricula);if(matricula.length>30)throw new ErrorApp('La matrícula no puede superar 30 caracteres.','VALIDACION');
  const sexo=data.sexo===undefined?previo?.sexo||null:validarSexo(data.sexo),fechaNacimiento=data.fechaNacimiento===undefined?previo?.fechaNacimiento||null:validarFecha(data.fechaNacimiento);
  return {nombreCompleto:nombre,nombres:parts.nombres,apellidos:parts.apellidos,matricula:matricula||null,sexo,fechaNacimiento,modificado:new Date()};
}

/** Alta atómica de la ficha permanente y su primera matrícula anual. */
export async function crearEstudiante(ctx:Ctx,data:DatosEstudiante&{ano?:unknown;seccion?:unknown}){
  exigirPermiso(ctx,'estudiantes.crear');const ano=txt(data.ano),sectionId=txt(data.seccion);if(!ano||!sectionId)throw new ErrorApp('Indique año escolar y sección.','VALIDACION');validarAno(ano);
  const sec=await exigirAccesoSeccionAcademica(ctx,ano,sectionId),clean=datosValidados(data);
  try{return await prisma.$transaction(async tx=>{
    await validarNombreDisponible(tx,clean.nombreCompleto);await validarMatriculaUnica(tx,clean.matricula||'');
    const now=new Date(),studentId=await siguienteIdTx_(tx,'EST'),enrollmentId=await siguienteIdTx_(tx,'INS');
    const max=await tx.enrollment.aggregate({_max:{numLista:true},where:{schoolYearId:ano,sectionId}}),numLista=(max._max.numLista||0)+1;
    await tx.student.create({data:{id:studentId,...clean,estado:'ACTIVO',creado:now}});
    await tx.enrollment.create({data:{id:enrollmentId,schoolYearId:ano,studentId,courseId:sec.courseId,sectionId,numLista,estado:'ACTIVO',creado:now,modificado:now}});
    await tx.auditLog.create({data:{fecha:now,usuario:ctx.usuario,accion:'CREAR',modulo:'ESTUDIANTES',idRegistro:studentId,descripcion:`Estudiante ${clean.nombreCompleto}; matrícula ${ano}, sección ${sectionId}`}});
    return {id:studentId,inscripcion:enrollmentId,numLista};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
  catch(e){if(esDuplicado(e))throw new ErrorApp('Ya existe un estudiante o una matrícula con esos datos.','CONFLICTO');throw e;}
}

/** Edición de datos permanentes solo tras resolver una matrícula visible en el año solicitado. */
export async function actualizarEstudiante(ctx:Ctx,studentId:string,ano:unknown,data:DatosEstudiante){
  exigirPermiso(ctx,'estudiantes.editar');const year=txt(ano);if(!year)throw new ErrorApp('Seleccione el año escolar.','VALIDACION');await resolverInscripcionVisible(ctx,studentId,year);
  const previo=await prisma.student.findUnique({where:{id:studentId}});if(!previo)sinAcceso();const clean=datosValidados(data,previo);
  try{await prisma.$transaction(async tx=>{
    await validarNombreDisponible(tx,clean.nombreCompleto,studentId);await validarMatriculaUnica(tx,clean.matricula||'',studentId);
    await tx.student.update({where:{id:studentId},data:clean});
    await tx.auditLog.create({data:{fecha:new Date(),usuario:ctx.usuario,accion:'EDITAR',modulo:'ESTUDIANTES',idRegistro:studentId,descripcion:'Datos personales del estudiante actualizados',valorAnterior:{nombreCompleto:previo.nombreCompleto,matricula:previo.matricula},valorNuevo:{nombreCompleto:clean.nombreCompleto,matricula:clean.matricula}}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});return {id:studentId};}
  catch(e){if(esDuplicado(e))throw new ErrorApp('Ya existe un estudiante o una matrícula con esos datos.','CONFLICTO');throw e;}
}

/** Retiro/reactivación lógica de la matrícula anual; no borra ni cambia el estado permanente del estudiante. */
export async function cambiarEstadoMatricula(ctx:Ctx,studentId:string,ano:unknown,estadoRaw:unknown){
  exigirPermiso(ctx,'estudiantes.editar');const year=txt(ano),estado=txt(estadoRaw);if(!year)throw new ErrorApp('Seleccione el año escolar.','VALIDACION');validarAno(year);
  if(!['ACTIVO','RETIRADO'].includes(estado))throw new ErrorApp('El estado de matrícula debe ser ACTIVO o RETIRADO.','VALIDACION');
  const e=await resolverInscripcionVisible(ctx,studentId,year);if(estado==='ACTIVO'&&e.student.estado!=='ACTIVO')throw new ErrorApp('No se puede reactivar la matrícula de un estudiante inactivo.','CONFLICTO');
  await prisma.$transaction(async tx=>{const now=new Date();await tx.enrollment.update({where:{id:e.id},data:{estado,modificado:now}});await tx.auditLog.create({data:{fecha:now,usuario:ctx.usuario,accion:'ESTADO',modulo:'ESTUDIANTES',idRegistro:e.id,descripcion:`Matrícula ${year}: ${e.estado} → ${estado}`,valorAnterior:e.estado,valorNuevo:estado}});});
  return {id:studentId,ano:year,estado};
}

/** Nueva matrícula o cambio de sección sin notas/registro dependiente que pierda su contexto. */
export async function asignarEstudiante(ctx:Ctx,studentId:string,anoRaw:unknown,sectionIdRaw:unknown){
  exigirPermiso(ctx,'estudiantes.editar');const ano=txt(anoRaw),sectionId=txt(sectionIdRaw);if(!ano||!sectionId)throw new ErrorApp('Indique año escolar y sección.','VALIDACION');validarAno(ano);
  const sec=await exigirAccesoSeccionAcademica(ctx,ano,sectionId),student=await prisma.student.findUnique({where:{id:studentId}});if(!student)sinAcceso();if(student.estado!=='ACTIVO')throw new ErrorApp('El estudiante está inactivo.','CONFLICTO');
  const previa=await prisma.enrollment.findFirst({where:{studentId,schoolYearId:ano}});
  if(previa)await exigirAccesoSeccionAcademica(ctx,ano,previa.sectionId);
  return prisma.$transaction(async tx=>{
    const existing=await tx.enrollment.findFirst({where:{studentId,schoolYearId:ano}}),now=new Date();
    if(existing?.sectionId!==(previa?.sectionId||undefined))throw new ErrorApp('La matrícula cambió mientras se procesaba la solicitud. Vuelva a intentarlo.','CONFLICTO');
    if(existing?.sectionId===sectionId)throw new ErrorApp('El estudiante ya está inscrito en esa sección.','CONFLICTO');
    const max=await tx.enrollment.aggregate({_max:{numLista:true},where:{schoolYearId:ano,sectionId}}),numLista=(max._max.numLista||0)+1;
    let id:string;
    if(existing){
      const [grades,results,attendance,dailyAttendance,observations]=await Promise.all([
        tx.gradeRecord.count({where:{schoolYearId:ano,studentId,sectionId:existing.sectionId}}),tx.resultSummary.count({where:{schoolYearId:ano,studentId,sectionId:existing.sectionId}}),tx.attendance.count({where:{schoolYearId:ano,studentId,sectionId:existing.sectionId}}),tx.attendanceMark.count({where:{enrollment:{schoolYearId:ano,studentId,sectionId:existing.sectionId}}}),tx.observation.count({where:{schoolYearId:ano,studentId,sectionId:existing.sectionId}}),
      ]);
      if(grades||results||attendance||dailyAttendance||observations)throw new ErrorApp('No se puede trasladar: la matrícula tiene registros académicos vinculados a la sección actual.','CONFLICTO');
      id=existing.id;await tx.enrollment.update({where:{id},data:{courseId:sec.courseId,sectionId,numLista,estado:'ACTIVO',modificado:now}});
    }else{id=await siguienteIdTx_(tx,'INS');await tx.enrollment.create({data:{id,schoolYearId:ano,studentId,courseId:sec.courseId,sectionId,numLista,estado:'ACTIVO',creado:now,modificado:now}});}
    await tx.auditLog.create({data:{fecha:now,usuario:ctx.usuario,accion:existing?'ASIGNAR':'CREAR',modulo:'ESTUDIANTES',idRegistro:studentId,descripcion:`Matrícula ${ano} asignada a sección ${sectionId}`}});
    return {id:studentId,inscripcion:id,ano,seccion:sectionId,numLista};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

/** Importación Legacy por lista pegada. Omite duplicados sin borrar ni sobrescribir matrículas previas. */
export async function importarEstudiantes(ctx:Ctx,anoRaw:unknown,sectionIdRaw:unknown,textoRaw:unknown){
  exigirPermiso(ctx,'estudiantes.crear');const ano=txt(anoRaw),sectionId=txt(sectionIdRaw),texto=typeof textoRaw==='string'?textoRaw:'';
  if(!ano||!sectionId)throw new ErrorApp('Indique año escolar y sección.','VALIDACION');validarAno(ano);await exigirAccesoSeccionAcademica(ctx,ano,sectionId);
  const lines=texto.split(/\r?\n/).map(x=>x.replace(/^["'\s]+|["'\s]+$/g,'').replace(/^\d+\s*[.\-)]\s*/,'').trim()).filter(Boolean);
  if(lines.length===0)throw new ErrorApp('Pegue al menos un nombre.','VALIDACION');if(lines.length>300)throw new ErrorApp('Importe un máximo de 300 nombres por lote.','VALIDACION');
  const candidatos=lines.map(nombre=>({nombre,normal:nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}));
  const omitidos:Array<{nombre:string;motivo:string}>=[],unicos:Array<{nombre:string;normal:string}>=[],vistos=new Set<string>();
  for(const x of candidatos){if(x.nombre.length<3||x.nombre.length>120){omitidos.push({nombre:x.nombre,motivo:'Nombre fuera del rango de 3 a 120 caracteres.'});continue;}if(vistos.has(x.normal)){omitidos.push({nombre:x.nombre,motivo:'Duplicado dentro del archivo pegado.'});continue;}vistos.add(x.normal);unicos.push(x);}
  if(!unicos.length)throw new ErrorApp('No hay nombres válidos para importar.','VALIDACION');
  const sec=await exigirAccesoSeccionAcademica(ctx,ano,sectionId);
  return prisma.$transaction(async tx=>{
    const existingEnrollments=await tx.enrollment.findMany({where:{schoolYearId:ano,sectionId},include:{student:true}}),ya=new Set(existingEnrollments.map(e=>e.student.nombreCompleto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()));
    const matches=await tx.student.findMany({where:{nombreCompleto:{in:unicos.map(x=>x.nombre)}},select:{nombreCompleto:true}}),existentes=new Set(matches.map(e=>e.nombreCompleto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()));
    const nuevos=unicos.filter(x=>{if(ya.has(x.normal)){omitidos.push({nombre:x.nombre,motivo:'Ya está inscrito en esta sección.'});return false;}if(existentes.has(x.normal)){omitidos.push({nombre:x.nombre,motivo:'Ya existe la ficha permanente; use asignar estudiante para matricularlo.'});return false;}return true;});
    const max=await tx.enrollment.aggregate({_max:{numLista:true},where:{schoolYearId:ano,sectionId}});let num=max._max.numLista||0;const now=new Date(),ids:string[]=[];
    for(const x of nuevos){const clean=datosValidados({nombreCompleto:x.nombre}),studentId=await siguienteIdTx_(tx,'EST'),enrollmentId=await siguienteIdTx_(tx,'INS');num++;
      await tx.student.create({data:{id:studentId,...clean,estado:'ACTIVO',creado:now}});
      await tx.enrollment.create({data:{id:enrollmentId,schoolYearId:ano,studentId,courseId:sec.courseId,sectionId,numLista:num,estado:'ACTIVO',creado:now,modificado:now}});
      await tx.auditLog.create({data:{fecha:now,usuario:ctx.usuario,accion:'CREAR',modulo:'ESTUDIANTES',idRegistro:studentId,descripcion:`Importación de estudiante; matrícula ${ano}, sección ${sectionId}`}});ids.push(studentId);
    }
    return {creados:ids.length,ids,omitidos};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
