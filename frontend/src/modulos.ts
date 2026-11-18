/** Catálogo de módulos del mantenimiento (mismo orden del menú del legacy). */
export interface DefinicionModulo {
  id: string
  et: string
  sigla: string
  desc: string
  permiso: string
}

export const MODULOS: DefinicionModulo[] = [
  { id: 'usuarios', et: 'Usuarios', sigla: 'US', permiso: 'usuarios.ver',
    desc: 'Cuentas, roles, permisos y PIN de acceso.' },
  { id: 'docentes', et: 'Docentes', sigla: 'DO', permiso: 'docentes.ver',
    desc: 'Registro de docentes y creación de su acceso.' },
  { id: 'asignaturas', et: 'Asignaturas', sigla: 'AS', permiso: 'asignaturas.ver',
    desc: 'Materias, grados y reglas de calificación.' },
  { id: 'competencias', et: 'Competencias', sigla: 'CP', permiso: 'asignaturas.ver',
    desc: 'Competencias C1 a C4 por asignatura.' },
  { id: 'asignaciones', et: 'Asignaciones', sigla: 'AD', permiso: 'asignaciones.ver',
    desc: 'Docente por curso, asignatura y período.' },
  { id: 'tutorias', et: 'Tutorías', sigla: 'TU', permiso: 'tutorias.ver',
    desc: 'Tutor activo de cada sección.' },
  { id: 'periodos', et: 'Períodos', sigla: 'PE', permiso: 'periodos.ver',
    desc: 'Períodos regulares y etapas finales.' },
  { id: 'cursos', et: 'Cursos y secciones', sigla: 'CU', permiso: 'cursos.ver',
    desc: 'Grados y secciones del año escolar.' },
]

export const ETIQUETA_ROL: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  COORDINADOR: 'Coordinador',
  DOCENTE: 'Docente',
  CONSULTA: 'Solo consulta',
}
