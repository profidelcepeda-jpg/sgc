/** Catálogo de módulos del mantenimiento (mismo orden del menú del legacy). */
export interface DefinicionModulo {
  id: string
  et: string
  sigla: string
  desc: string
  permiso: string
}

export const MODULOS: DefinicionModulo[] = [
  { id: 'estudiantes', et: 'Estudiantes', sigla: 'ES', permiso: 'estudiantes.ver', desc: 'Matrículas, datos personales y acceso al expediente académico.' },
  { id: 'consulta', et: 'Consulta', sigla: 'CO', permiso: 'estudiantes.ver', desc: 'Búsqueda de estudiantes y consulta académica dentro del alcance autorizado.' },
  { id: 'configuracion', et: 'Configuración', sigla: 'CF', permiso: 'configuracion.administrar', desc: 'Parámetros generales, académicos, de reportes y seguridad.' },
  { id: 'observaciones', et: 'Observaciones', sigla: 'OB', permiso: 'observaciones.ver', desc: 'Registro e historial de observaciones académicas y de conducta.' },
  { id: 'reportes', et: 'Reportes', sigla: 'RE', permiso: 'reportes.ver', desc: 'Rendimiento, registros, pendientes y boletines académicos.' },
  { id: 'asistencia', et: 'Asistencia', sigla: 'AS', permiso: 'asistencia.ver', desc: 'Registro diario, historial y resumen de asistencia autorizado.' },
  { id: 'calificaciones', et: 'Calificaciones', sigla: 'CA', permiso: 'calificaciones.ver', desc: 'Registro de notas y resultados académicos.' },
  { id: 'usuarios', et: 'Usuarios', sigla: 'US', permiso: 'usuarios.ver',
    desc: 'Cuentas, roles, permisos y PIN de acceso.' },
  { id: 'roles', et: 'Roles y permisos', sigla: 'RP', permiso: 'roles.ver',
    desc: 'Administrar roles y permisos funcionales del sistema.' },
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
