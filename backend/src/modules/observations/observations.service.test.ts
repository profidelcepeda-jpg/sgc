import { beforeEach,describe,expect,it,vi } from 'vitest';

const m=vi.hoisted(()=>({section:vi.fn(),taFirst:vi.fn(),taMany:vi.fn(),tuFirst:vi.fn(),tuMany:vi.fn(),enrollFirst:vi.fn(),enrollMany:vi.fn(),periodFirst:vi.fn(),periodMany:vi.fn(),subject:vi.fn(),subjectMany:vi.fn(),course:vi.fn(),config:vi.fn(),obsFind:vi.fn(),obsMany:vi.fn(),obsCount:vi.fn(),obsCreate:vi.fn(),obsUpdate:vi.fn(),audit:vi.fn(),transaction:vi.fn(),txEnroll:vi.fn(),txPeriod:vi.fn(),txCreate:vi.fn(),txUpdate:vi.fn(),txAudit:vi.fn()}));
vi.mock('../../lib/db',()=>({prisma:{section:{findUnique:m.section,findMany:vi.fn()},teachingAssignment:{findFirst:m.taFirst,findMany:m.taMany},tutoringAssignment:{findFirst:m.tuFirst,findMany:m.tuMany},enrollment:{findFirst:m.enrollFirst,findMany:m.enrollMany},period:{findFirst:m.periodFirst,findMany:m.periodMany},subject:{findUnique:m.subject,findMany:m.subjectMany},course:{findUnique:m.course},config:{findMany:m.config},observation:{findUnique:m.obsFind,findMany:m.obsMany,count:m.obsCount,create:m.obsCreate,update:m.obsUpdate},auditLog:{create:m.audit},$transaction:m.transaction}}));
vi.mock('../../lib/ids',()=>({siguienteIdTx_:vi.fn(async()=> 'OBS-000001')}));
import {actualizarObservacion,crearObservacion,listarObservaciones,obtenerObservacion} from './observations.service';
import {ErrorApp} from '../../lib/errors';
import type {Ctx} from '../auth/auth.service';

const ctx=(permisos:Record<string,true>={'observaciones.ver':true,'observaciones.registrar':true,'observaciones.editar':true}):Ctx=>({id:'USR-1',usuario:'docente',nombre:'Docente',correo:null,rol:'DOCENTE',idDocente:'DOC-1',permisos:Object.keys(permisos),set:permisos,debeCambiar:false});
const sec={id:'SEC-1',courseId:'CUR-1',estado:'ACTIVO',course:{id:'CUR-1',schoolYearId:'2026-2027',estado:'ACTIVO',grado:'1ro'}};
const record={id:'OBS-1',schoolYearId:'2026-2027',sectionId:'SEC-1',courseId:'CUR-1',studentId:'EST-1',teacherId:'DOC-1',creadoPor:'docente',subjectId:null,periodId:null,tipo:'ACADEMICA',fecha:new Date('2026-10-01T00:00:00Z'),observacion:'Buen progreso',estado:'ACTIVA',creado:new Date(),modificado:new Date(),student:{nombreCompleto:'Estudiante Uno'},subject:null,period:null,teacher:{nombreCompleto:'Docente'},section:sec};
const tx={enrollment:{findFirst:m.txEnroll},period:{findFirst:m.txPeriod},observation:{create:m.txCreate,update:m.txUpdate,findUnique:m.obsFind},auditLog:{create:m.txAudit},$queryRaw:vi.fn()};
function scope(){m.section.mockResolvedValue(sec);m.taFirst.mockResolvedValue({id:'ASG-1'});m.tuFirst.mockResolvedValue(null);}
function row(){m.obsFind.mockResolvedValue(record);m.enrollFirst.mockResolvedValue({id:'INS-1'});m.periodFirst.mockResolvedValue(null);m.taFirst.mockResolvedValue({id:'ASG-1'});m.tuFirst.mockResolvedValue(null);}

describe('autorización y ciclo de vida de observaciones',()=>{
 beforeEach(()=>{vi.resetAllMocks();scope();m.config.mockResolvedValue([]);m.transaction.mockImplementation((fn:(x:typeof tx)=>Promise<unknown>)=>fn(tx));m.txEnroll.mockResolvedValue({id:'INS-1'});m.txPeriod.mockResolvedValue(null);m.txCreate.mockResolvedValue({});m.txUpdate.mockResolvedValue({});m.txAudit.mockResolvedValue({});});
 it('exige el permiso funcional antes de acceder a la sección',async()=>{
  await expect(listarObservaciones(ctx({} as Record<string,true>),{ano:'2026-2027',seccion:'SEC-1'})).rejects.toThrow('No tiene permiso');
  expect(m.section).not.toHaveBeenCalled();
 });
 it('rechaza una sección/año ajenos aun cuando el usuario envía ambos IDs',async()=>{
  m.section.mockResolvedValue({...sec,course:{...sec.course,schoolYearId:'2025-2026'}});
  await expect(listarObservaciones(ctx(),{ano:'2026-2027',seccion:'SEC-1'})).rejects.toThrow(ErrorApp);
  expect(m.obsMany).not.toHaveBeenCalled();
 });
 it('oculta por ID una observación escrita por otro docente',async()=>{
  row();m.obsFind.mockResolvedValue({...record,teacherId:'DOC-2',creadoPor:'otro'});
  await expect(obtenerObservacion(ctx(),'OBS-1')).rejects.toMatchObject({codigo:'NO_ENCONTRADO'});
 });
 it('permite listar todas al tutor activo, dentro de su sección autorizada',async()=>{
  m.taFirst.mockResolvedValue(null);m.tuFirst.mockResolvedValue({id:'TUT-1'});m.obsCount.mockResolvedValue(0);m.obsMany.mockResolvedValue([]);m.enrollMany.mockResolvedValue([]);
  await listarObservaciones(ctx(),{ano:'2026-2027',seccion:'SEC-1'});
  expect(m.obsMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.not.objectContaining({teacherId:'DOC-1'})}));
 });
 it('crea con matrícula activa y registra auditoría en la misma transacción',async()=>{
  scope();m.enrollFirst.mockResolvedValue({id:'INS-1'});m.periodFirst.mockResolvedValue(null);
  const result=await crearObservacion(ctx(),{ano:'2026-2027',seccion:'SEC-1',idEstudiante:'EST-1',tipo:'ACADEMICA',fecha:'2026-10-01',texto:'  Buen\n progreso  '});
  expect(result.id).toBe('OBS-000001');expect(m.txCreate).toHaveBeenCalledWith({data:expect.objectContaining({studentId:'EST-1',sectionId:'SEC-1',observacion:'Buen progreso',estado:'ACTIVA'})});expect(m.txAudit).toHaveBeenCalledTimes(1);
 });
 it('rechaza texto corto, fecha inválida y tipo desconocido',async()=>{
  const base={ano:'2026-2027',seccion:'SEC-1',idEstudiante:'EST-1',fecha:'2026-10-01'};
  await expect(crearObservacion(ctx(),{...base,tipo:'OTRA',texto:'ab'})).rejects.toThrow('demasiado corta');
  await expect(crearObservacion(ctx(),{...base,tipo:'OTRA',fecha:'2026-02-30',texto:'texto válido'})).rejects.toThrow('fecha no es válida');
  await expect(crearObservacion(ctx(),{...base,tipo:'OTRO',texto:'texto válido'})).rejects.toThrow('tipo de observación no es válido');
  expect(m.txCreate).not.toHaveBeenCalled();
 });
 it('usa tipos configurados y conserva al editar observaciones históricas de tipos inactivos',async()=>{
  m.config.mockResolvedValue([{clave:'TIPOS_OBSERVACION',valor:JSON.stringify([{codigo:'SEGUIMIENTO',nombre:'Seguimiento',activo:true},{codigo:'OTRA',nombre:'Otra',activo:false}])}]);
  scope();m.enrollFirst.mockResolvedValue({id:'INS-1'});m.periodFirst.mockResolvedValue(null);
  await crearObservacion(ctx(),{ano:'2026-2027',seccion:'SEC-1',idEstudiante:'EST-1',tipo:'SEGUIMIENTO',fecha:'2026-10-01',texto:'Seguimiento válido'});
  expect(m.txCreate).toHaveBeenCalledWith({data:expect.objectContaining({tipo:'SEGUIMIENTO'})});
  row();m.obsFind.mockResolvedValue({...record,tipo:'OTRA'});
  await actualizarObservacion(ctx(),'OBS-1',{texto:'Texto histórico actualizado'});
  expect(m.txUpdate).toHaveBeenCalledWith({where:{id:'OBS-1'},data:expect.objectContaining({tipo:'OTRA',observacion:'Texto histórico actualizado'})});
 });
 it('impide editar un registro cuyo autor no coincide con el docente',async()=>{
  row();m.obsFind.mockResolvedValue({...record,teacherId:'DOC-2',creadoPor:'otro'});
  await expect(actualizarObservacion(ctx(),'OBS-1',{texto:'Cambio válido'})).rejects.toMatchObject({codigo:'NO_ENCONTRADO'});
  expect(m.obsUpdate).not.toHaveBeenCalled();
 });
 it('no permite cambiar el estudiante de una observación existente',async()=>{
  row();await expect(actualizarObservacion(ctx(),'OBS-1',{idEstudiante:'EST-OTRO'})).rejects.toThrow('No se puede cambiar el estudiante');
 });
});
