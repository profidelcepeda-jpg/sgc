import { beforeEach,describe,expect,it,vi } from 'vitest';
import { ErrorApp } from '../../lib/errors';

const m=vi.hoisted(()=>({enrollCount:vi.fn(),enrollMany:vi.fn(),enrollFirst:vi.fn(),enrollAggregate:vi.fn(),studentFind:vi.fn(),studentFirst:vi.fn(),sectionMany:vi.fn(),periodMany:vi.fn(),assignmentMany:vi.fn(),transaction:vi.fn(),access:vi.fn(),sections:vi.fn(),years:vi.fn()}));
vi.mock('../../lib/db',()=>({prisma:{enrollment:{count:m.enrollCount,findMany:m.enrollMany,findFirst:m.enrollFirst,aggregate:m.enrollAggregate},student:{findUnique:m.studentFind,findFirst:m.studentFirst},section:{findMany:m.sectionMany},period:{findMany:m.periodMany},teachingAssignment:{findMany:m.assignmentMany},$transaction:m.transaction}}));
vi.mock('../../lib/ids',()=>({siguienteIdTx_:vi.fn(async(_tx:unknown,prefix:string)=>`${prefix}-000001`)}));
vi.mock('../crud/autorizacion',()=>({
  exigirPermiso:vi.fn((ctx:{set:Record<string,boolean>},p:string)=>{if(ctx.set[p]!==true)throw new ErrorApp('No tiene permiso.','PERMISO');}),
  exigirAccesoSeccionAcademica:m.access,seccionesAlcanzables:m.sections,anosAlcanzables:m.years,
}));

import { actualizarEstudiante,asignarEstudiante,buscarEstudiantes,crearEstudiante,importarEstudiantes } from './students.service';
import type { Ctx } from '../auth/auth.service';
const ctx=(set:Record<string,true>={'estudiantes.ver':true,'estudiantes.editar':true}):Ctx=>({id:'USR-1',usuario:'docente',nombre:'Docente',correo:null,rol:'DOCENTE',idDocente:'DOC-1',permisos:Object.keys(set),set,debeCambiar:false});

describe('alcance del módulo Estudiantes',()=>{
 beforeEach(()=>{vi.resetAllMocks();m.sections.mockResolvedValue(['SEC-1']);m.years.mockResolvedValue(['2026-2027']);m.access.mockImplementation(async(_ctx:Ctx,_year:string,id:string)=>{if(id==='SEC-OLD')throw new ErrorApp('Fuera de alcance.','NO_ENCONTRADO');return {id,courseId:id==='SEC-NEW'?'CUR-NEW':'CUR-1'};});});
 it('exige permiso funcional antes de consultar estudiantes',async()=>{
  await expect(buscarEstudiantes(ctx({} as Record<string,true>),{ano:'2026-2027',q:'Ana'})).rejects.toMatchObject({codigo:'PERMISO'});
  expect(m.enrollMany).not.toHaveBeenCalled();
 });
 it('acota resultados a secciones resueltas por el servidor',async()=>{
  m.enrollCount.mockResolvedValue(0);m.enrollMany.mockResolvedValue([]);
  await buscarEstudiantes(ctx(),{ano:'2026-2027',q:'Ana'});
  expect(m.enrollMany.mock.calls[0][0].where.section.id).toEqual({in:['SEC-1']});
  expect(m.enrollMany.mock.calls[0][0].where.schoolYearId).toBe('2026-2027');
 });
 it('no permite trasladar un estudiante de una sección origen fuera del alcance',async()=>{
  m.studentFind.mockResolvedValue({id:'EST-1',estado:'ACTIVO'});m.enrollFirst.mockResolvedValue({id:'INS-1',sectionId:'SEC-OLD'});
  await expect(asignarEstudiante(ctx(),'EST-1','2026-2027','SEC-NEW')).rejects.toMatchObject({codigo:'NO_ENCONTRADO'});
  expect(m.transaction).not.toHaveBeenCalled();
 });
 it('rechaza editar por ID una matrícula fuera del alcance',async()=>{
  m.enrollFirst.mockResolvedValue({id:'INS-1',studentId:'EST-1',schoolYearId:'2026-2027',sectionId:'SEC-OLD',section:{course:{schoolYearId:'2026-2027'},courseId:'CUR-1'},courseId:'CUR-1'});
  await expect(actualizarEstudiante(ctx(),'EST-1','2026-2027',{nombreCompleto:'Ana Estudiante'})).rejects.toMatchObject({codigo:'NO_ENCONTRADO'});
  expect(m.studentFind).not.toHaveBeenCalled();expect(m.transaction).not.toHaveBeenCalled();
 });
 it('no abre transacción de alta sin permiso de creación',async()=>{
  await expect(crearEstudiante(ctx({'estudiantes.ver':true} as Record<string,true>),{nombreCompleto:'Ana Estudiante',ano:'2026-2027',seccion:'SEC-1'})).rejects.toMatchObject({codigo:'PERMISO'});
  expect(m.access).not.toHaveBeenCalled();expect(m.transaction).not.toHaveBeenCalled();
 });
 it('limita la importación Legacy a 300 nombres antes de escribir',async()=>{
  const texto=Array.from({length:301},(_,i)=>`Estudiante ${i}`).join('\n');
  await expect(importarEstudiantes(ctx({'estudiantes.ver':true,'estudiantes.crear':true}), '2026-2027','SEC-1',texto)).rejects.toThrow('300 nombres');
  expect(m.transaction).not.toHaveBeenCalled();
 });
});
