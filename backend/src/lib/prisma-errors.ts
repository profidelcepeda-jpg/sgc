/*********************************************************************
 * prisma-errors.ts — Traducción de errores conocidos de Prisma a ErrorApp
 * Convierte conflictos de unicidad, referencias y registros ausentes en
 * respuestas 409/404 con mensaje legible, en vez de un 500 genérico.
 * No conoce la base: solo inspecciona el código P#### y su meta.
 *********************************************************************/

import { ErrorApp } from './errors';

const ETIQUETAS: Record<string, string> = {
  usuario: 'usuario',
  correo: 'correo',
  nombre: 'nombre',
  codigo: 'código',
  nombre_completo: 'nombre completo',
  matricula: 'matrícula',
  num_lista: 'número de lista',
  seccion: 'sección',
  grado: 'grado',
  school_year_id: 'año escolar',
  section_id: 'sección',
  subject_id: 'asignatura',
  student_id: 'estudiante',
  period_id: 'período',
  course_id: 'curso',
  teacher_id: 'docente',
  role_id: 'rol',
  permission_id: 'permiso',
};

/** Combinaciones compuestas con un mensaje específico para el usuario. */
const COMBINACIONES: Array<{ campos: string[]; mensaje: string }> = [
  { campos: ['school_year_id', 'section_id', 'num_lista'], mensaje: 'Ese número de lista ya está ocupado en la sección.' },
  { campos: ['school_year_id', 'grado'], mensaje: 'Ya existe un curso para ese grado en el año escolar.' },
  { campos: ['subject_id', 'codigo'], mensaje: 'Ya existe una competencia con ese código en la asignatura.' },
  { campos: ['school_year_id', 'codigo'], mensaje: 'Ya existe un período con ese código en el año escolar.' },
  { campos: ['course_id', 'seccion'], mensaje: 'Ya existe esa sección en el curso.' },
  { campos: ['school_year_id', 'section_id', 'fecha'], mensaje: 'Ya existe una sesión de asistencia para esa sección y fecha.' },
  { campos: ['session_id', 'enrollment_id'], mensaje: 'Ese estudiante ya tiene asistencia registrada en esa sesión.' },
  { campos: ['school_year_id', 'section_id', 'subject_id', 'student_id', 'period_id'], mensaje: 'Ya hay una nota para ese estudiante en ese período.' },
  { campos: ['school_year_id', 'section_id', 'subject_id', 'student_id'], mensaje: 'Ya hay un resultado para ese estudiante en esa asignatura.' },
];

function camposDe_(meta: unknown): string[] {
  const m = meta as { target?: unknown; field_name?: unknown } | null;
  if (Array.isArray(m?.target)) return m.target.map(String).sort();
  if (typeof m?.target === 'string') return [m.target];
  if (typeof m?.field_name === 'string') return [m.field_name];
  return [];
}

function mensajeUnico_(campos: string[]): string {
  const clave = [...campos].sort().join('|');
  const combo = COMBINACIONES.find(c => [...c.campos].sort().join('|') === clave);
  if (combo) return combo.mensaje;

  const utiles = campos.filter(c => c !== 'id');
  if (utiles.length === 1) {
    const et = ETIQUETAS[utiles[0]] || utiles[0].replace(/_/g, ' ');
    return 'Ya existe un registro con ese ' + et + '.';
  }
  if (utiles.length > 1) {
    const et = utiles.map(c => ETIQUETAS[c] || c.replace(/_/g, ' '));
    return 'Ya existe un registro con esa combinación de ' + et.join(', ') + '.';
  }
  return 'Ya existe un registro con esos datos.';
}

/**
 * Devuelve un ErrorApp equivalente si el error es un código conocido de Prisma;
 * null si no lo es, para que el manejador global lo trate como error técnico.
 */
export function errorDePrisma_(e: unknown): ErrorApp | null {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code !== 'string' || !/^P\d{4}$/.test(code)) return null;
  const meta = (e as { meta?: unknown }).meta;

  switch (code) {
    case 'P2002':
      return new ErrorApp(mensajeUnico_(camposDe_(meta)), 'CONFLICTO');
    case 'P2003':
    case 'P2014':
      return new ErrorApp('No se puede completar: el registro está referenciado por otros datos.', 'CONFLICTO');
    case 'P2034':
      return new ErrorApp('La operación coincidió con otra escritura simultánea. Intente de nuevo.', 'CONFLICTO');
    case 'P2025':
      return new ErrorApp('El registro no existe o ya fue eliminado.', 'NO_ENCONTRADO');
    case 'P2000':
      return new ErrorApp('Uno de los valores es demasiado largo para su campo.', 'VALIDACION');
    case 'P2005':
    case 'P2006':
      return new ErrorApp('Uno de los valores no tiene el formato esperado.', 'VALIDACION');
    case 'P2011':
      return new ErrorApp('Falta un dato obligatorio.', 'VALIDACION');
    default:
      return null;
  }
}
