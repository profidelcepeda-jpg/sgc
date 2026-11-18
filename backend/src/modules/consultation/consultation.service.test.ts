import { beforeEach, describe, expect, it, vi } from 'vitest';

const db=vi.hoisted(()=>({
  schoolYear:{findMany:vi.fn()},section:{findMany:vi.fn()},period:{findMany:vi.fn()},
  enrollment:{count:vi.fn(),findMany:vi.fn()},teachingAssignment:{findMany:vi.fn()},
}));
const auth=vi.hoisted(()=>({
  exigirPermiso:vi.fn((ctx:{set:Record<string,boolean>},p:string)=>{if(ctx.set[p]!==true)throw new Error('PERMISO');}),
  exigirAccesoSeccionAcademica:vi.fn(async()=>({courseId:'CUR-1'})),
  seccionesAlcanzables:vi.fn(async()=>['SEC-1']),anosAlcanzables:vi.fn(async()=>['2025-2026']),
}));
vi.mock('../../lib/db',()=>({prisma:db}));
vi.mock('../crud/autorizacion',()=>auth);
vi.mock('../reports/reports.service',()=>({datosCursoReporte:vi.fn(),historialReporte:vi.fn()}));
vi.mock('../observations/observations.service',()=>({observacionesParaExpediente:vi.fn()}));

import { buscarEstudiantes, opcionesConsulta } from './consultation.service';
import type { Ctx } from '../auth/auth.service';

const docente={id:'USR-1',usuario:'docente',rol:'DOCENTE',idDocente:'DOC-1',set:{'estudiantes.ver':true}} as unknown as Ctx;
beforeEach(()=>{vi.clearAllMocks();db.enrollment.count.mockResolvedValue(1);db.enrollment.findMany.mockResolvedValue([]);});

describe('alcance de Consulta',()=>{
  it('rechaza sin permiso funcional antes de consultar registros',async()=>{
    await expect(buscarEstudiantes({...docente,set:{}} as Ctx,{ano:'2025-2026',q:'Ana'})).rejects.toThrow('PERMISO');
    expect(db.enrollment.findMany).not.toHaveBeenCalled();
  });

  it('intersecta la búsqueda con las secciones resueltas por el backend',async()=>{
    await buscarEstudiantes(docente,{ano:'2025-2026',q:'Ana'});
    const where=db.enrollment.findMany.mock.calls[0][0].where;
    expect(where.section.id).toEqual({in:['SEC-1']});
    expect(where.schoolYearId).toBe('2025-2026');
  });

  it('no permite convertir un filtro de docente ajeno en una concesión de acceso',async()=>{
    await expect(buscarEstudiantes(docente,{ano:'2025-2026',q:'Ana',docente:'DOC-OTRO'})).rejects.toThrow('No tiene permiso');
    expect(db.enrollment.findMany).not.toHaveBeenCalled();
  });

  it('limita los metadatos de asignaturas y docentes a relaciones propias',async()=>{
    db.section.findMany.mockResolvedValue([]);db.period.findMany.mockResolvedValue([]);
    await opcionesConsulta(docente,'2025-2026');
    const arg=db.section.findMany.mock.calls[0][0];
    expect(arg.include.assignments.where).toMatchObject({estado:'ACTIVO',teacherId:'DOC-1'});
    expect(arg.include.tutorings.where).toMatchObject({estado:'ACTIVA',teacherId:'DOC-1'});
  });
});
