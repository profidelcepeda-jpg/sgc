import { beforeEach,describe,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({section:vi.fn(),taFirst:vi.fn(),tuFirst:vi.fn(),period:vi.fn(),enroll:vi.fn(),subject:vi.fn(),config:vi.fn(),tutor:vi.fn(),attendance:vi.fn(),dailyAttendance:vi.fn(),grade:vi.fn(),competence:vi.fn(),taMany:vi.fn()}));
vi.mock('../../lib/db',()=>({prisma:{section:{findUnique:m.section,findMany:vi.fn()},teachingAssignment:{findFirst:m.taFirst,findMany:m.taMany},tutoringAssignment:{findFirst:m.tuFirst,findMany:vi.fn()},period:{findMany:m.period},enrollment:{findMany:m.enroll},subject:{findMany:m.subject},config:{findMany:m.config},attendance:{findMany:m.attendance},attendanceSession:{findMany:m.dailyAttendance},gradeRecord:{findMany:m.grade},competence:{findMany:m.competence}}}));
import {datosCursoReporte} from './reports.service';
import type {Ctx} from '../auth/auth.service';
import {ErrorApp} from '../../lib/errors';
const ctx=(permisos:Record<string,true>={'reportes.ver':true}):Ctx=>({id:'USR-1',usuario:'docente',nombre:'Docente',correo:null,rol:'DOCENTE',idDocente:'DOC-1',permisos:Object.keys(permisos),set:permisos,debeCambiar:false});
const sec={id:'SEC-1',estado:'ACTIVO',courseId:'CUR-1',seccion:'A',course:{id:'CUR-1',schoolYearId:'2026-2027',grado:'1ro',estado:'ACTIVO'}};
const subject={id:'ASI-1',codigo:'MAT',nombre:'Matemática',nombreReporte:null,abrev:'MAT',area:'Matemática',grados:['1ro'],orden:1,ordenBoletin:1,notaMinima:null,usaRecuperacion:true,usaCompletiva:true,usaExtraordinaria:true,usaEspecial:true};
const periods=[1,2,3,4].map(i=>({id:`PER-${i}`,codigo:`P${i}`,nombre:`P${i}`,tipo:'REGULAR',etapa:null,orden:i,meses:i===1?['ago']:[],estado:'CERRADO'}));
function primeData(){
 m.period.mockResolvedValue(periods);
 m.enroll.mockResolvedValue([{studentId:'EST-1',numLista:1,student:{nombreCompleto:'Estudiante',nombres:'Estudiante',apellidos:'Uno'}}]);
 m.subject.mockResolvedValue([subject]);m.config.mockResolvedValue([]);m.tutor.mockResolvedValue(null);
 m.attendance.mockResolvedValue([{studentId:'EST-1',mes:'ago',porcentaje:90}]);
 m.dailyAttendance.mockResolvedValue([]);
 m.competence.mockResolvedValue([1,2,3,4].map(i=>({id:`C-${i}`,subjectId:'ASI-1',codigo:`C${i}`,nombre:`Competencia ${i}`,abrev:`C${i}`,orden:i,estado:'ACTIVO'})));
 m.taMany.mockResolvedValue([{subjectId:'ASI-1',teacher:{nombreCompleto:'Docente'}}]);
 m.grade.mockResolvedValue(periods.map(p=>({studentId:'EST-1',subjectId:'ASI-1',periodId:p.id,c1:80,c2:80,c3:80,c4:80,r1:null,r2:null,r3:null,r4:null,notaEtapa:null})));
}
describe('servicio de reportes académicos',()=>{
 beforeEach(()=>{vi.resetAllMocks();m.section.mockResolvedValue(sec);m.taFirst.mockResolvedValue(null);m.tuFirst.mockResolvedValue(null);});
 it('no permite consultar por ID una sección ajena aunque tenga reportes.ver',async()=>{
  await expect(datosCursoReporte(ctx(),'2026-2027','SEC-1')).rejects.toThrow(ErrorApp);
  expect(m.period).not.toHaveBeenCalled();
 });
 it('rechaza año que no coincide con el curso antes de cargar notas',async()=>{
  await expect(datosCursoReporte(ctx(),'2025-2026','SEC-1')).rejects.toThrow(ErrorApp);
  expect(m.taFirst).not.toHaveBeenCalled();
 });
 it('permite el informe del grupo autorizado y calcula con el motor central',async()=>{
  m.taFirst.mockResolvedValue({id:'ASG-1'});
  primeData();
  const data=await datosCursoReporte(ctx(),'2026-2027','SEC-1');
  expect(data.estudiantes[0].registros['ASI-1'].calc.cf).toBe(80);
  expect(data.estudiantes[0].situacion).toBe('PROMOVIDO');
  expect(data.estudiantes[0].asistencia.periodos[1]).toBe(90);
 });
 it('permite el reporte al tutor activo de su propia sección',async()=>{
  primeData();m.tuFirst.mockResolvedValueOnce({id:'TUT-1'}).mockResolvedValue({teacher:{nombreCompleto:'Docente tutor'}});
  const data=await datosCursoReporte(ctx(),'2026-2027','SEC-1');
  expect(data.estudiantes).toHaveLength(1);
  expect(m.tuFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({teacherId:'DOC-1',estado:'ACTIVA'})}));
 });
  it('incluye asistencia diaria solo cuando el usuario tiene su permiso funcional',async()=>{
   m.taFirst.mockResolvedValue({id:'ASG-1'});primeData();
   const sinPermiso=await datosCursoReporte(ctx(),'2026-2027','SEC-1');
   expect(sinPermiso.estudiantes[0].asistenciaDiaria).toBeNull();expect(m.dailyAttendance).not.toHaveBeenCalled();
   m.dailyAttendance.mockResolvedValue([{fecha:new Date('2026-08-01T00:00:00.000Z'),marks:[{enrollmentId:'ENR-1',estado:'TARDANZA',enrollment:{studentId:'EST-1'}}]}]);
   const conPermiso=await datosCursoReporte(ctx({'reportes.ver':true,'asistencia.ver':true}),'2026-2027','SEC-1');
   expect(conPermiso.estudiantes[0].asistenciaDiaria?.resumen.TARDANZA).toBe(1);
   expect(conPermiso.estudiantes[0].asistenciaDiaria?.marcas[0]).toMatchObject({fecha:'2026-08-01',estado:'TARDANZA',periodo:'P1'});
  });
 it('requiere el permiso funcional en la API del reporte',async()=>{
  await expect(datosCursoReporte(ctx({}), '2026-2027','SEC-1')).rejects.toThrow('No tiene permiso');
  expect(m.section).not.toHaveBeenCalled();
 });
});
