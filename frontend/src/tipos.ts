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
}

export interface Bootstrap {
  ok: boolean;
  usuario: Perfil;
  permisos: string[];
  set: Record<string, true>;
}

export interface SaludDb {
  ok: boolean;
  db: string;
  students: number;
  gradeRecords: number;
  resultSummaries: number;
  config: number;
}
