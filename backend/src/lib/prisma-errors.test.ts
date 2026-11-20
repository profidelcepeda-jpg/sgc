import { describe, expect, it } from 'vitest';
import { ErrorApp } from './errors';
import { errorDePrisma_ } from './prisma-errors';

/** Simula un PrismaClientKnownRequestError sin depender del cliente generado. */
function prismaError(code: string, meta?: unknown): Error {
  return Object.assign(new Error('fallo de prueba'), { code, meta });
}

describe('errorDePrisma_', () => {
  it('ignora errores que no son de Prisma', () => {
    expect(errorDePrisma_(new Error('boom'))).toBeNull();
    expect(errorDePrisma_(Object.assign(new Error('red'), { code: 'ECONNREFUSED' }))).toBeNull();
    expect(errorDePrisma_(null)).toBeNull();
    expect(errorDePrisma_('texto')).toBeNull();
  });

  it('traduce P2002 de un campo simple a conflicto legible', () => {
    const e = errorDePrisma_(prismaError('P2002', { target: ['usuario'] }));
    expect(e).toBeInstanceOf(ErrorApp);
    expect(e!.codigo).toBe('CONFLICTO');
    expect(e!.message).toContain('usuario');
  });

  it('reconoce combinaciones compuestas con mensaje específico', () => {
    const lista = errorDePrisma_(prismaError('P2002', { target: ['school_year_id', 'section_id', 'num_lista'] }));
    expect(lista!.message).toContain('número de lista');

    const curso = errorDePrisma_(prismaError('P2002', { target: ['school_year_id', 'grado'] }));
    expect(curso!.message).toContain('grado');

    const nota = errorDePrisma_(prismaError('P2002', {
      target: ['school_year_id', 'section_id', 'subject_id', 'student_id', 'period_id'],
    }));
    expect(nota!.message).toContain('nota');
  });

  it('traduce P2025 como registro no encontrado', () => {
    expect(errorDePrisma_(prismaError('P2025'))!.codigo).toBe('NO_ENCONTRADO');
  });

  it('traduce P2003 y P2014 como conflicto de referencia', () => {
    expect(errorDePrisma_(prismaError('P2003'))!.codigo).toBe('CONFLICTO');
    expect(errorDePrisma_(prismaError('P2014'))!.codigo).toBe('CONFLICTO');
  });

  it('traduce P2034 como conflicto reintentable', () => {
    const e = errorDePrisma_(prismaError('P2034'));
    expect(e!.codigo).toBe('CONFLICTO');
    expect(e!.message).toContain('Intente de nuevo');
  });

  it('traduce P2000, P2006 y P2011 como validación', () => {
    expect(errorDePrisma_(prismaError('P2000'))!.codigo).toBe('VALIDACION');
    expect(errorDePrisma_(prismaError('P2006'))!.codigo).toBe('VALIDACION');
    expect(errorDePrisma_(prismaError('P2011'))!.codigo).toBe('VALIDACION');
  });

  it('deja pasar un código P#### desconocido para que se registre como técnico', () => {
    expect(errorDePrisma_(prismaError('P2999'))).toBeNull();
  });
});
