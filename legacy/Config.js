/*********************************************************************
 * SGA – SISTEMA DE GESTIÓN ACADÉMICA
 * Config.gs — CONFIGURACIÓN CENTRALIZADA Y ESQUEMA DE LA BASE DE DATOS
 *
 * Aquí viven TODOS los nombres de hojas, columnas, prefijos de ID,
 * roles y permisos. Ninguna otra función escribe nombres de hojas a mano.
 * Para ampliar el sistema: agregue una hoja a ESQUEMA y (si aplica)
 * permisos a PERMISOS_CATALOGO; setupSystem() la crea sin tocar lo existente.
 *********************************************************************/

const SGA = {
  NOMBRE: 'SGA – Sistema de Gestión Académica',
  VERSION: '1.0.0',
  PERIODOS_REGULARES: 4,   // P1..P4 (estructura de columnas C1..C4 / R1..R4)
  COMPETENCIAS: 4,         // C1..C4 por asignatura
  HASH_ITER: 400,          // iteraciones del hash de contraseñas (versión v1)
  MESES: ['ago', 'sep', 'oct', 'nov', 'dic', 'ene', 'feb', 'mar', 'abr', 'may', 'jun'],
  MAX_POR_PAGINA: 200
};

const HOJA = {
  CONFIG: 'CONFIG', USUARIOS: 'USUARIOS', CREDENCIALES: 'CREDENCIALES', SESIONES: 'SESIONES',
  ROLES: 'ROLES', PERMISOS: 'PERMISOS', ROL_PERMISOS: 'ROL_PERMISOS',
  ESTUDIANTES: 'ESTUDIANTES', INSCRIPCIONES: 'INSCRIPCIONES', DOCENTES: 'DOCENTES',
  CURSOS: 'CURSOS', SECCIONES: 'SECCIONES', ASIGNATURAS: 'ASIGNATURAS', COMPETENCIAS: 'COMPETENCIAS',
  ASIGNACIONES: 'ASIGNACIONES', TUTORIAS: 'TUTORIAS', PERIODOS: 'PERIODOS',
  CALIFICACIONES: 'CALIFICACIONES', ASISTENCIA: 'ASISTENCIA', OBSERVACIONES: 'OBSERVACIONES', RESULTADOS: 'RESULTADOS',
  HISTORIAL: 'HISTORIAL', ERRORES: 'ERRORES'
};

/** Encabezados de cada tabla. prefijo = prefijo del ID único (USR-000001). La PRIMERA columna es siempre la clave. */
const ESQUEMA = {
  CONFIG:        { prefijo: '',    cols: ['CLAVE', 'VALOR', 'DESCRIPCION', 'FECHA_MODIFICACION'] },
  ROLES:         { prefijo: '',    cols: ['ID_ROL', 'NOMBRE', 'DESCRIPCION', 'ES_SISTEMA', 'ESTADO', 'FECHA_CREACION', 'FECHA_MODIFICACION'] },
  PERMISOS:      { prefijo: '',    cols: ['ID_PERMISO', 'MODULO', 'DESCRIPCION'] },
  ROL_PERMISOS:  { prefijo: '',    cols: ['ID_ROL', 'ID_PERMISO'] },
  USUARIOS:      { prefijo: 'USR', cols: ['ID_USUARIO', 'NOMBRE', 'APELLIDOS', 'CORREO', 'USUARIO', 'ROL', 'ID_DOCENTE', 'PERMISOS_EXTRA', 'PERMISOS_DENEGADOS', 'ESTADO', 'FECHA_CREACION', 'FECHA_MODIFICACION', 'ULTIMO_ACCESO'] },
  CREDENCIALES:  { prefijo: '',    cols: ['ID_USUARIO', 'HASH', 'SALT', 'DEBE_CAMBIAR', 'INTENTOS_FALLIDOS', 'BLOQUEADO_HASTA', 'FECHA_CAMBIO'] },
  SESIONES:      { prefijo: 'SES', cols: ['ID_SESION', 'ID_USUARIO', 'TOKEN_HASH', 'CREADA', 'EXPIRA', 'ULTIMA_ACTIVIDAD', 'ESTADO'] },
  ESTUDIANTES:   { prefijo: 'EST', cols: ['ID_ESTUDIANTE', 'MATRICULA', 'NOMBRES', 'APELLIDOS', 'NOMBRE_COMPLETO', 'SEXO', 'FECHA_NACIMIENTO', 'ESTADO', 'FECHA_CREACION', 'FECHA_MODIFICACION'] },
  INSCRIPCIONES: { prefijo: 'INS', cols: ['ID_INSCRIPCION', 'ANO_ESCOLAR', 'ID_ESTUDIANTE', 'ID_CURSO', 'ID_SECCION', 'NUM_LISTA', 'ESTADO', 'FECHA_CREACION', 'FECHA_MODIFICACION'] },
  DOCENTES:      { prefijo: 'DOC', cols: ['ID_DOCENTE', 'TITULO', 'NOMBRES', 'APELLIDOS', 'NOMBRE_COMPLETO', 'CORREO', 'TELEFONO', 'ESTADO', 'FECHA_CREACION', 'FECHA_MODIFICACION'] },
  CURSOS:        { prefijo: 'CUR', cols: ['ID_CURSO', 'ANO_ESCOLAR', 'NIVEL', 'GRADO', 'ESTADO', 'FECHA_CREACION', 'FECHA_MODIFICACION'] },
  SECCIONES:     { prefijo: 'SEC', cols: ['ID_SECCION', 'ID_CURSO', 'SECCION', 'ESTADO', 'FECHA_CREACION', 'FECHA_MODIFICACION'] },
  ASIGNATURAS:   { prefijo: 'ASI', cols: ['ID_ASIGNATURA', 'CODIGO', 'NOMBRE', 'NOMBRE_REPORTE', 'ABREV', 'AREA', 'GRADOS', 'ORDEN', 'ORDEN_BOLETIN', 'USA_RECUPERACION', 'USA_COMPLETIVA', 'USA_EXTRAORDINARIA', 'USA_ESPECIAL', 'NOTA_MINIMA', 'ESTADO', 'FECHA_CREACION', 'FECHA_MODIFICACION'] },
  COMPETENCIAS:  { prefijo: 'COM', cols: ['ID_COMPETENCIA', 'ID_ASIGNATURA', 'CODIGO', 'NOMBRE', 'ABREV', 'ORDEN', 'ESTADO'] },
  ASIGNACIONES:  { prefijo: 'ASG', cols: ['ID_ASIGNACION', 'ANO_ESCOLAR', 'ID_DOCENTE', 'ID_ASIGNATURA', 'ID_CURSO', 'ID_SECCION', 'ID_PERIODO', 'ESTADO', 'FECHA_CREACION', 'FECHA_MODIFICACION'] },
  TUTORIAS:      { prefijo: 'TUT', cols: ['ID_TUTORIA', 'ANO_ESCOLAR', 'ID_DOCENTE', 'ID_CURSO', 'ID_SECCION', 'ESTADO', 'FECHA_CREACION', 'FECHA_MODIFICACION'] },
  PERIODOS:      { prefijo: 'PER', cols: ['ID_PERIODO', 'ANO_ESCOLAR', 'CODIGO', 'NOMBRE', 'TIPO', 'ETAPA', 'ORDEN', 'MESES', 'ESTADO', 'FECHA_CREACION', 'FECHA_MODIFICACION'] },
  CALIFICACIONES:{ prefijo: 'CAL', cols: ['ID_CALIFICACION', 'CLAVE_GRUPO', 'ANO_ESCOLAR', 'ID_ESTUDIANTE', 'ID_DOCENTE', 'ID_ASIGNATURA', 'ID_CURSO', 'ID_SECCION', 'ID_PERIODO', 'C1', 'C2', 'C3', 'C4', 'R1', 'R2', 'R3', 'R4', 'NOTA_ETAPA', 'FECHA_CREACION', 'FECHA_MODIFICACION', 'MODIFICADO_POR'] },
  ASISTENCIA:    { prefijo: 'ASH', cols: ['ID_ASISTENCIA', 'CLAVE_GRUPO', 'ANO_ESCOLAR', 'ID_ESTUDIANTE', 'ID_ASIGNATURA', 'ID_SECCION', 'ago', 'sep', 'oct', 'nov', 'dic', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'FECHA_MODIFICACION', 'MODIFICADO_POR'] },
  OBSERVACIONES: { prefijo: 'OBS', cols: ['ID_OBSERVACION', 'ANO_ESCOLAR', 'ID_ESTUDIANTE', 'ID_CURSO', 'ID_SECCION', 'ID_DOCENTE', 'ID_ASIGNATURA', 'ID_PERIODO', 'TIPO', 'FECHA', 'OBSERVACION', 'ESTADO', 'FECHA_CREACION', 'FECHA_MODIFICACION', 'CREADO_POR'] },
  RESULTADOS:    { prefijo: 'RES', cols: ['ID_RESULTADO', 'CLAVE_GRUPO', 'ANO_ESCOLAR', 'ID_ESTUDIANTE', 'ID_ASIGNATURA', 'ID_SECCION', 'PC1', 'PC2', 'PC3', 'PC4', 'CF_REAL', 'CF', 'CEC', 'CCF', 'CEEX', 'CEXF', 'CESP', 'ETAPA_LOGRO', 'NOTA_A', 'NOTA_R', 'ESTADO_RESULTADO', 'FECHA_MODIFICACION'] },
  HISTORIAL:     { prefijo: '',    cols: ['FECHA', 'USUARIO', 'ACCION', 'MODULO', 'ID_REGISTRO', 'DESCRIPCION', 'VALOR_ANTERIOR', 'VALOR_NUEVO'] },
  ERRORES:       { prefijo: '',    cols: ['FECHA', 'USUARIO', 'FUNCION', 'REFERENCIA', 'MENSAJE', 'DETALLE'] }
};

/** Orden de creación de hojas en el libro (las de datos primero, las técnicas al final). */
const ORDEN_HOJAS = ['CONFIG', 'USUARIOS', 'ROLES', 'PERMISOS', 'ROL_PERMISOS', 'DOCENTES', 'CURSOS', 'SECCIONES', 'ESTUDIANTES', 'INSCRIPCIONES',
  'ASIGNATURAS', 'COMPETENCIAS', 'ASIGNACIONES', 'TUTORIAS', 'PERIODOS', 'CALIFICACIONES', 'ASISTENCIA', 'OBSERVACIONES', 'RESULTADOS', 'HISTORIAL', 'SESIONES', 'CREDENCIALES', 'ERRORES'];

const CAMPOS_NOTA_PERIODO = ['C1', 'C2', 'C3', 'C4', 'R1', 'R2', 'R3', 'R4'];

/* ---------------- Configuración inicial (CONFIG) ---------------- */
const CONFIG_DEFECTO = [
  ['NOMBRE_SISTEMA', 'SGA – Sistema de Gestión Académica', 'Nombre que se muestra en pantalla'],
  ['VERSION', '1.0.0', 'Versión instalada'],
  ['ANO_ESCOLAR', '2026-2027', 'Año escolar activo (formato AAAA-AAAA)'],
  ['NOTA_MINIMA', 70, 'Nota mínima de aprobación'],
  ['NOTA_MAXIMA', 100, 'Nota máxima permitida'],
  ['NOTA_ENTERA', 'SI', 'SI = las notas se escriben como enteros; NO = permite decimales'],
  ['PCT_COMPLETIVA_CF', 50, '% de la C.F. en la completiva'],
  ['PCT_COMPLETIVA_CEC', 50, '% de la C.E.C. en la completiva'],
  ['PCT_EXTRA_CF', 30, '% de la C.F. en la extraordinaria'],
  ['PCT_EXTRA_CE', 70, '% de la C.E.EX en la extraordinaria'],
  ['DECIMALES_COMPETENCIA', 1, 'Decimales mostrados (truncados) en el promedio de competencia'],
  ['ACTIVAR_RECUPERACION', 'SI', 'Permite RP por período'],
  ['ACTIVAR_COMPLETIVA', 'SI', 'Permite la etapa completiva'],
  ['ACTIVAR_EXTRAORDINARIA', 'SI', 'Permite la etapa extraordinaria'],
  ['ACTIVAR_ESPECIAL', 'SI', 'Permite la evaluación especial'],
  ['GRADOS', '1ro,2do,3ro,4to,5to,6to', 'Lista ordenada de grados del centro'],
  ['DURACION_SESION_MIN', 480, 'Duración máxima de cada sesión en minutos (después debe iniciar sesión de nuevo)'],
  ['MAX_INTENTOS_LOGIN', 5, 'Intentos fallidos antes de bloquear temporalmente la cuenta (con PIN de 4 dígitos NO lo suba de 5-10: es la defensa contra adivinar el PIN)'],
  ['MINUTOS_BLOQUEO', 10, 'Minutos de bloqueo tras superar los intentos fallidos'],
  ['FILAS_POR_PAGINA', 25, 'Filas por página en las tablas de administración'],
  ['REGIONAL', '06 - La Vega', 'Regional educativa'],
  ['DISTRITO', '06-05 La Vega', 'Distrito educativo'],
  ['CENTRO', 'Liceo Prof. Niove Estela Mariot', 'Nombre del centro educativo'],
  ['CODIGO_CENTRO', '15843', 'Código del centro'],
  ['DIRECCION_CENTRO', '', 'Dirección del centro educativo'],
  ['PROVINCIA', 'La Vega', 'Provincia'],
  ['MUNICIPIO', 'La Vega', 'Municipio'],
  ['TANDA', 'Jornada Escolar Extendida', 'Tanda'],
  ['NIVEL', 'Secundaria', 'Nivel educativo'],
  ['DIRECTOR', 'Silveria Yohanna Rodríguez', 'Director(a) del centro (firma del boletín)'],
  ['REGISTRO_SPREADSHEET_ID', '', 'ID del libro REGISTRO (opcional) para sincronizar estudiantes'],
  ['PERMITIR_DEMO', 'NO', 'SI = permite ejecutar crearDatosDemo() (nunca en producción)']
];
const CLAVES_BOOL = ['NOTA_ENTERA', 'ACTIVAR_RECUPERACION', 'ACTIVAR_COMPLETIVA', 'ACTIVAR_EXTRAORDINARIA', 'ACTIVAR_ESPECIAL'];
const CLAVES_NUM = ['NOTA_MINIMA', 'NOTA_MAXIMA', 'PCT_COMPLETIVA_CF', 'PCT_COMPLETIVA_CEC', 'PCT_EXTRA_CF', 'PCT_EXTRA_CE', 'DECIMALES_COMPETENCIA',
  'DURACION_SESION_MIN', 'MAX_INTENTOS_LOGIN', 'MINUTOS_BLOQUEO', 'FILAS_POR_PAGINA'];

/* ---------------- Roles y permisos base ---------------- */
const ROLES_BASE = [
  ['ADMINISTRADOR', 'Administrador', 'Acceso completo al sistema'],
  ['COORDINADOR', 'Coordinador', 'Consulta información académica de todos los cursos'],
  ['DOCENTE', 'Docente', 'Solo sus cursos y asignaturas asignados'],
  ['CONSULTA', 'Solo consulta', 'Consulta información autorizada sin modificarla']
];
/** [id, módulo, descripción, roles por defecto: C=Coordinador D=Docente S=Solo consulta]  (el ADMINISTRADOR siempre tiene todos) */
const PERMISOS_CATALOGO = [
  ['usuarios.ver', 'usuarios', 'Ver usuarios', ''], ['usuarios.crear', 'usuarios', 'Crear usuarios', ''],
  ['usuarios.editar', 'usuarios', 'Editar usuarios, cambiar roles y restablecer acceso', ''], ['usuarios.eliminar', 'usuarios', 'Activar/desactivar usuarios', ''],
  ['roles.ver', 'roles', 'Ver roles y permisos', ''], ['roles.administrar', 'roles', 'Crear roles y cambiar sus permisos', ''],
  ['estudiantes.ver', 'estudiantes', 'Ver estudiantes', 'CDS'], ['estudiantes.crear', 'estudiantes', 'Registrar estudiantes', ''], ['estudiantes.editar', 'estudiantes', 'Editar, retirar y asignar estudiantes', ''],
  ['docentes.ver', 'docentes', 'Ver docentes', 'CS'], ['docentes.crear', 'docentes', 'Registrar docentes', ''], ['docentes.editar', 'docentes', 'Editar docentes', ''],
  ['cursos.ver', 'cursos', 'Ver cursos y secciones', 'CDS'], ['cursos.ver_todos', 'cursos', 'Ver todos los cursos (sin esta, solo los asignados)', 'CS'],
  ['cursos.crear', 'cursos', 'Crear cursos y secciones', ''], ['cursos.editar', 'cursos', 'Editar cursos y secciones', ''],
  ['asignaturas.ver', 'asignaturas', 'Ver asignaturas y competencias', 'CDS'], ['asignaturas.crear', 'asignaturas', 'Crear asignaturas', ''], ['asignaturas.editar', 'asignaturas', 'Editar asignaturas', ''],
  ['asignaciones.ver', 'asignaciones', 'Ver asignación de docentes', 'C'], ['asignaciones.crear', 'asignaciones', 'Asignar docentes', ''], ['asignaciones.editar', 'asignaciones', 'Editar asignaciones', ''],
  ['tutorias.ver', 'tutorias', 'Ver tutorías', 'CDS'], ['tutorias.crear', 'tutorias', 'Asignar tutorías', ''], ['tutorias.editar', 'tutorias', 'Cambiar tutorías', ''],
  ['periodos.ver', 'periodos', 'Ver períodos académicos', 'CDS'], ['periodos.administrar', 'periodos', 'Crear y editar períodos académicos', ''],
  ['calificaciones.ver', 'calificaciones', 'Consultar calificaciones', 'CDS'], ['calificaciones.registrar', 'calificaciones', 'Registrar calificaciones nuevas', 'D'],
  ['calificaciones.editar', 'calificaciones', 'Modificar calificaciones ya registradas', 'D'], ['calificaciones.cerrar', 'calificaciones', 'Cerrar y reabrir períodos', ''],
  ['calificaciones.administrar', 'calificaciones', 'Registrar/modificar calificaciones de cualquier curso (sin necesitar asignación)', ''],
  ['asistencia.ver', 'asistencia', 'Consultar asistencia', 'CDS'], ['asistencia.registrar', 'asistencia', 'Registrar asistencia', 'D'],
  ['observaciones.ver', 'observaciones', 'Ver observaciones (el docente ve las suyas y las de los cursos que tutorea)', 'CD'], ['observaciones.registrar', 'observaciones', 'Registrar observaciones de estudiantes', 'D'],
  ['observaciones.editar', 'observaciones', 'Editar y anular las observaciones propias', 'D'], ['observaciones.administrar', 'observaciones', 'Ver, editar o anular las observaciones de cualquier docente', ''],
  ['reportes.ver', 'reportes', 'Ver y descargar reportes y boletines', 'CDS'],
  ['historial.ver', 'historial', 'Ver el historial de auditoría', ''],
  ['configuracion.administrar', 'configuracion', 'Administrar la configuración del sistema', '']
];

/** Períodos iniciales del año activo: [código, nombre, tipo, etapa, orden, meses] */
const PERIODOS_BASE = [
  ['P1', '1er Periodo', 'REGULAR', '', 1, 'ago,sep,oct'], ['P2', '2do Periodo', 'REGULAR', '', 2, 'nov,dic,ene'],
  ['P3', '3er Periodo', 'REGULAR', '', 3, 'feb,mar'], ['P4', '4to Periodo', 'REGULAR', '', 4, 'abr,may,jun'],
  ['COMP', 'Completivo', 'ETAPA', 'COMPLETIVA', 5, ''], ['EXTRA', 'Extraordinario', 'ETAPA', 'EXTRAORDINARIA', 6, ''],
  ['ESP', 'Evaluación especial', 'ETAPA', 'ESPECIAL', 7, '']
];
const CAMPO_ETAPA = { COMPLETIVA: 'CEC', EXTRAORDINARIA: 'CEEX', ESPECIAL: 'CESP' };
