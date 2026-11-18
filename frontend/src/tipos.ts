/*********************************************************************
 * tipos.ts — Contratos compartidos con la API del SGA
 * Reflejan exactamente lo que devuelven crudMeta / crudListar y el
 * bootstrap de autenticación.
 *********************************************************************/

export type TipoCampo =
  | 'texto' | 'num' | 'si_no' | 'correo' | 'enum' | 'ref' | 'patron' | 'csv';

export interface Campo {
  k: string;
  et: string;
  tipo: TipoCampo;
  req?: boolean;
  max?: number;
  min?: number;
  opciones?: string[];
  ref?: string;
  patron?: string;
  msg?: string;
  minusculas?: boolean;
  defecto?: unknown;
  soloCrear?: boolean;
  soloLectura?: boolean;
}

export interface OpcionRef {
  id: string;
  texto: string;
}

export interface FiltroMeta {
  k: string;
  et: string;
  ref?: string;
  opciones?: string[];
}

export interface AccionMeta {
  id: string;
  et: string;
  permiso?: string;
  global?: boolean;
}

export interface Meta {
  modulo: string;
  idKey: string;
  titulo: string;
  singular: string;
  columnas: Array<[string, string]>;
  campos: Campo[];
  filtros: FiltroMeta[];
  conAno: boolean;
  anoActual: string;
  estados: string[];
  acciones: AccionMeta[];
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeEstado: boolean;
  ayuda: string;
  opciones: Record<string, OpcionRef[]>;
}

export interface Listado {
  ok: boolean;
  items: Array<Record<string, unknown>>;
  total: number;
  pag: number;
  paginas: number;
}

export interface Perfil {
  id: string;
  usuario: string;
  nombre: string;
  rol: string;
  idDocente: string | null;
  debeCambiar: boolean;
}

export interface CtxSesion extends Perfil {
  permisos: string[];
  set: Record<string, true>;
  config?: { nombreSistema: string; anoEscolar: string };
}

export interface Bootstrap {
  ok: boolean;
  usuario: Perfil;
  permisos: string[];
  set: Record<string, true>;
  config: { nombreSistema: string; anoEscolar: string };
}

export interface SaludDb {
  ok: boolean;
  db: string;
  students: number;
  gradeRecords: number;
  resultSummaries: number;
  config: number;
}

export interface OpcionCalificacion { ano: string; seccion: string; seccionTexto: string; asignaturas: Array<{ id: string; texto: string }> }
export interface NotaEstudiante { id: string; nombre: string; numLista: number; notas: Record<string, number | null>; calculo: Record<string, unknown> }
export interface GridCalificaciones { ano: string; seccion: string; asignatura: string; seccionTexto: string; asignaturaTexto: string; puedeEditar: boolean; minima: number; periodos: Array<{id:string;codigo:string;estado:string}>; etapas?: Record<string,{id:string;codigo:string;estado:string}>; estudiantes: NotaEstudiante[] }

export interface ReportOpcion { ano:string; seccion:string; etiqueta:string }
export interface ReportCalculo {
  periodos:Array<{promedio:number|null;ingresadas:number;pendientesRP:number;estado:string}>;
  efectiva:Array<Array<number|null>>; vigente:Array<Array<number|null>>; pcMostrar:Array<number|null>;
  cf:number|null; cfReal:number|null; estado:string|null; etapa:string|null; A:number|null; R:number|null;
  comp:{base:number|null;mitad:number|null;cec:number|null;ccf:number|null};
  ext:{base:number|null;mitad:number|null;ceex:number|null;cexf:number|null};
  esp:{cf:number|null;cesp:number|null}; situacion:string;
}
export interface DatosCursoReporte {
  ano:string; idSeccion:string; grado:string; seccion:string; tutor:string; min:number;
  formato:{papel:'A4'|'LETTER'|'LEGAL';orientacion:'LANDSCAPE'|'PORTRAIT'};
  centro:Record<string,string>;
  periodos:Array<{id:string;codigo:string;nombre:string;meses:string[];estado:string}>;
  asignaturas:Array<{id:string;codigo:string;nombre:string;nombreReporte:string;abrev:string;area:string;orden:number;ordenBoletin:number;esOptativa:boolean;competencias:Array<{codigo:string;nombre:string;abrev:string|null;orden:number}>;docentes:string[]}>;
  estudiantes:Array<{idEstudiante:string;num:number;nombre:string;nombres:string|null;apellidos:string|null;situacion:string;situacionPortada:string;asistencia:{periodos:Record<number,number|null>;anual:number|null};asistenciaDiaria:{sesiones:number;resumen:{PRESENTE:number;AUSENTE:number;TARDANZA:number;EXCUSADO:number;total:number;considerados:number;porcentaje:number|null};marcas:Array<{fecha:string;estado:string;periodo:string}>;periodos:Array<{codigo:string;PRESENTE:number;AUSENTE:number;TARDANZA:number;EXCUSADO:number;total:number;considerados:number;porcentaje:number|null}>}|null;registros:Record<string,{notas:Record<string,number|null>;calc:ReportCalculo}>}>;
}
export interface OpcionSeccionObservaciones { ano:string; seccion:string; etiqueta:string }
export interface OpcionObservaciones { ano:string; seccion:string; estudiantes:Array<{id:string;num:number;nombre:string;activo:boolean}>; periodos:Array<{id:string;codigo:string;nombre:string}>; asignaturas:Array<{id:string;nombre:string}>; tipos:Array<{codigo:string;nombre:string}>; puedeRegistrar:boolean; puedeVerTodas:boolean }
export interface ObservacionItem { id:string; fecha:string; idEstudiante:string; estudiante:string; tipo:string; idAsignatura:string|null; asignatura:string; idPeriodo:string|null; periodo:string; docente:string; texto:string; estado:'ACTIVA'|'ANULADA'; puedeEditar:boolean }
export interface ListadoObservaciones { items:ObservacionItem[]; total:number; pag:number; paginas:number; estudiantes:Array<{id:string;num:number;nombre:string;activo:boolean}>; puedeRegistrar:boolean }
export interface CampoConfiguracion { clave:string; nombre:string; valor:string; editable:boolean }
export interface ConfiguracionSistema {
  general:CampoConfiguracion[]; seguridad:CampoConfiguracion[]; academica:CampoConfiguracion[]; calificaciones:CampoConfiguracion[];
  reportes:{opciones:CampoConfiguracion[];centro:Record<string,string>}; version:string;
  anos:Array<{id:string;inicio:string;cierre:string}>;
  periodos:Array<{id:string;ano:string;codigo:string;nombre:string;tipo:string;etapa:string|null;orden:number;meses:string[];estado:string}>;
  tiposObservacion:Array<{codigo:string;nombre:string;activo:boolean}>;
}

export interface EstudianteFila {
  id: string; nombre: string; nombres: string | null; apellidos: string | null; matricula: string | null;
  estado: 'ACTIVO' | 'RETIRADO'; estadoEstudiante: string; ano: string; curso: string; seccion: string;
  grado: string; letra: string; numLista: number;
}
export interface PerfilEstudiante {
  estudiante: { id: string; nombre: string; nombres: string | null; apellidos: string | null; matricula: string | null; sexo: string | null; fechaNacimiento: string | null; estado: string };
  inscripcion: { ano: string; estado: string; numLista: number };
  curso: { id: string; grado: string; seccion: string; idSeccion: string };
}
