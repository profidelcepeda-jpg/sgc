/*********************************************************************
 * modulos.ts — Catálogo único de módulos y navegación del SGA
 * Cada módulo declara etiqueta, permiso, icono y grupo. El menú y el
 * panel se construyen desde aquí para que no existan accesos repetidos
 * ni listas de módulos desincronizadas.
 *********************************************************************/

import type { IconoNombre } from './componentes/Icono'

export type GrupoId = 'evaluacion' | 'academica' | 'consultas' | 'administracion'

export interface DefinicionModulo {
  id: string
  et: string
  sigla: string
  desc: string
  permiso: string
  icono: IconoNombre
  grupo: GrupoId
}

export interface GrupoNavegacion {
  id: GrupoId
  et: string
  icono: IconoNombre
}

/** Categorías de la navegación principal, en el orden aprobado. */
export const GRUPOS: GrupoNavegacion[] = [
  { id: 'evaluacion', et: 'Evaluación y seguimiento', icono: 'evaluacion' },
  { id: 'academica', et: 'Gestión académica', icono: 'academica' },
  { id: 'consultas', et: 'Consultas y reportes', icono: 'consultas' },
  { id: 'administracion', et: 'Administración del sistema', icono: 'administracion' },
]

/**
 * Módulos en el orden de la estructura funcional. El orden dentro de cada
 * grupo se conserva en el menú y en las tarjetas del panel.
 */
export const MODULOS: DefinicionModulo[] = [
  // Evaluación y seguimiento
  { id: 'calificaciones', et: 'Calificaciones', sigla: 'CA', permiso: 'calificaciones.ver', grupo: 'evaluacion', icono: 'calificaciones',
    desc: 'Registro de notas y resultados académicos calculados por el motor.' },
  { id: 'asistencia', et: 'Asistencia', sigla: 'AS', permiso: 'asistencia.ver', grupo: 'evaluacion', icono: 'asistencia',
    desc: 'Registro diario, historial y resumen de asistencia autorizado.' },
  { id: 'observaciones', et: 'Observaciones', sigla: 'OB', permiso: 'observaciones.ver', grupo: 'evaluacion', icono: 'observaciones',
    desc: 'Registro e historial de observaciones académicas y de conducta.' },

  // Gestión académica
  { id: 'estudiantes', et: 'Estudiantes', sigla: 'ES', permiso: 'estudiantes.ver', grupo: 'academica', icono: 'estudiantes',
    desc: 'Matrículas, datos personales y acceso al expediente académico.' },
  { id: 'docentes', et: 'Docentes', sigla: 'DO', permiso: 'docentes.ver', grupo: 'academica', icono: 'docentes',
    desc: 'Registro de docentes y creación de su acceso.' },
  { id: 'cursos', et: 'Cursos y secciones', sigla: 'CU', permiso: 'cursos.ver', grupo: 'academica', icono: 'cursos',
    desc: 'Grados y secciones del año escolar.' },
  { id: 'asignaturas', et: 'Asignaturas', sigla: 'MA', permiso: 'asignaturas.ver', grupo: 'academica', icono: 'asignaturas',
    desc: 'Materias, grados y reglas de calificación.' },
  { id: 'competencias', et: 'Competencias', sigla: 'CP', permiso: 'asignaturas.ver', grupo: 'academica', icono: 'competencias',
    desc: 'Competencias C1 a C4 por asignatura.' },
  { id: 'periodos', et: 'Períodos', sigla: 'PE', permiso: 'periodos.ver', grupo: 'academica', icono: 'periodos',
    desc: 'Períodos regulares y etapas finales.' },
  { id: 'asignaciones', et: 'Asignaciones', sigla: 'AD', permiso: 'asignaciones.ver', grupo: 'academica', icono: 'asignaciones',
    desc: 'Docente por curso, asignatura y período.' },
  { id: 'tutorias', et: 'Tutorías', sigla: 'TU', permiso: 'tutorias.ver', grupo: 'academica', icono: 'tutorias',
    desc: 'Tutor activo de cada sección.' },

  // Consultas y reportes
  { id: 'consulta', et: 'Consultas', sigla: 'CO', permiso: 'estudiantes.ver', grupo: 'consultas', icono: 'consulta',
    desc: 'Búsqueda de estudiantes y consulta académica dentro del alcance autorizado.' },
  { id: 'reportes', et: 'Reportes', sigla: 'RE', permiso: 'reportes.ver', grupo: 'consultas', icono: 'reportes',
    desc: 'Rendimiento, registros, pendientes y boletines académicos.' },

  // Administración del sistema
  { id: 'usuarios', et: 'Usuarios', sigla: 'US', permiso: 'usuarios.ver', grupo: 'administracion', icono: 'usuarios',
    desc: 'Cuentas, roles, permisos y PIN de acceso.' },
  { id: 'roles', et: 'Roles y permisos', sigla: 'RP', permiso: 'roles.ver', grupo: 'administracion', icono: 'roles',
    desc: 'Administrar roles y permisos funcionales del sistema.' },
  { id: 'configuracion', et: 'Configuración', sigla: 'CF', permiso: 'configuracion.administrar', grupo: 'administracion', icono: 'configuracion',
    desc: 'Parámetros generales, académicos, de reportes y seguridad.' },
]

export const MODULO_POR_ID: Record<string, DefinicionModulo> = MODULOS.reduce(function (mapa, m) {
  mapa[m.id] = m
  return mapa
}, {} as Record<string, DefinicionModulo>)

export function moduloPorId(id: string | null | undefined): DefinicionModulo | undefined {
  return id ? MODULO_POR_ID[id] : undefined
}

export function grupoPorId(id: GrupoId | null | undefined): GrupoNavegacion | undefined {
  return GRUPOS.find(function (g) { return g.id === id })
}

/** Módulos de un grupo que el usuario puede ver según su mapa de permisos. */
export function modulosDelGrupo(grupo: GrupoId, permisos: Record<string, true>): DefinicionModulo[] {
  return MODULOS.filter(function (m) {
    return m.grupo === grupo && permisos[m.permiso] === true
  })
}

/** Grupos con al menos un módulo visible; evita categorías vacías en menú y panel. */
export function gruposDisponibles(permisos: Record<string, true>): Array<GrupoNavegacion & { modulos: DefinicionModulo[] }> {
  return GRUPOS.map(function (g) {
    return Object.assign({}, g, { modulos: modulosDelGrupo(g.id, permisos) })
  }).filter(function (g) { return g.modulos.length > 0 })
}

export const ETIQUETA_ROL: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  COORDINADOR: 'Coordinador',
  DOCENTE: 'Docente',
  CONSULTA: 'Solo consulta',
}
