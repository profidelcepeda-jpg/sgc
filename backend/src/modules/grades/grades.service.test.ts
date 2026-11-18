import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ section:vi.fn(),subject:vi.fn(),periods:vi.fn(),assignments:vi.fn(),tutoring:vi.fn(),enrollments:vi.fn(),records:vi.fn(),results:vi.fn(),config:vi.fn() }));
vi.mock('../../lib/db',()=>({prisma:{section:{findUnique:m.section},subject:{findUnique:m.subject},period:{findMany:m.periods},teachingAssignment:{findMany:m.assignments},tutoringAssignment:{findFirst:m.tutoring},enrollment:{findMany:m.enrollments},gradeRecord:{findMany:m.records},resultSummary:{findMany:m.results},config:{findMany:m.config}}}));
import { obtenerGridCalificaciones } from './grades.service';
import { ErrorApp } from '../../lib/errors';
import type { Ctx } from '../auth/auth.service';

const ctx=(extra:Partial<Ctx>={}):Ctx=>({id:'USR-1',usuario:'docente',nombre:'Docente',correo:null,rol:'DOCENTE',idDocente:'DOC-1',permisos:['calificaciones.ver'],set:{'calificaciones.ver':true},debeCambiar:false,...extra});
const section={id:'SEC-1',estado:'ACTIVO',courseId:'CUR-1',course:{id:'CUR-1',schoolYearId:'2026-2027',estado:'ACTIVO',grado:'1ro'},seccion:'A'};
const subject={id:'ASI-1',nombre:'Matemática',estado:'ACTIVO',grados:['1ro'],notaMinima:null,usaRecuperacion:true,usaCompletiva:true,usaExtraordinaria:true,usaEspecial:true};
const periods=[1,2,3,4].map(i=>({id:`PER-${i}`,codigo:`P${i}`,tipo:'REGULAR',etapa:null,orden:i,estado:'ABIERTO'}));

describe('Integración y alcance del motor de calificaciones',()=>{
 beforeEach(()=>{vi.resetAllMocks();m.section.mockResolvedValue(section);m.subject.mockResolvedValue(subject);m.periods.mockResolvedValue(periods);m.assignments.mockResolvedValue([]);m.tutoring.mockResolvedValue(null);m.config.mockResolvedValue([]);m.enrollments.mockResolvedValue([]);m.records.mockResolvedValue([]);m.results.mockResolvedValue([]);});
 it('deniega un grupo ajeno aunque el cliente conozca sus identificadores',async()=>{
   await expect(obtenerGridCalificaciones(ctx(),'2026-2027','SEC-1','ASI-1')).rejects.toThrow(ErrorApp);
   expect(m.enrollments).not.toHaveBeenCalled();
 });
 it('permite al docente consultar solo su asignación activa y devuelve cálculo del motor',async()=>{
   m.assignments.mockResolvedValue([{teacherId:'DOC-1',periodId:null,estado:'ACTIVO',courseId:'CUR-1',schoolYearId:'2026-2027',subjectId:'ASI-1'}]);
   m.enrollments.mockResolvedValue([{studentId:'EST-1',numLista:1,student:{nombreCompleto:'Estudiante'}}]);
   const grid=await obtenerGridCalificaciones(ctx(),'2026-2027','SEC-1','ASI-1');
   expect(grid.puedeEditar).toBe(true);
   expect(grid.estudiantes[0].notas.P1C1).toBeNull();
   expect((grid.estudiantes[0].calculo as {estado:string}).estado).toBe('INCOMPLETO');
 });
 it('rechaza un año que no coincide con el año de la sección',async()=>{
   m.section.mockResolvedValue({...section,course:{...section.course,schoolYearId:'2025-2026'}});
   await expect(obtenerGridCalificaciones(ctx(),'2026-2027','SEC-1','ASI-1')).rejects.toThrow(ErrorApp);
   expect(m.assignments).not.toHaveBeenCalled();
 });
 it('rechaza una configuración con número incorrecto de períodos regulares',async()=>{
   m.periods.mockResolvedValue(periods.slice(0,3)); m.assignments.mockResolvedValue([{teacherId:'DOC-1',periodId:null,estado:'ACTIVO'}]);
   await expect(obtenerGridCalificaciones(ctx(),'2026-2027','SEC-1','ASI-1')).rejects.toThrow('exactamente cuatro períodos');
 });
});
