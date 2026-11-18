/*********************************************************************
 * errors.ts — Error de aplicación (transcripción de ErrorApp de Utils.js)
 * y mapeo de códigos → HTTP para las rutas REST.
 *********************************************************************/

export type CodigoError =
  'VALIDACION' | 'LOGIN' | 'SESION' | 'BLOQUEO' | 'PERMISO' | 'NO_ENCONTRADO' | 'CONFLICTO' | 'CAMBIAR_CLAVE';

export class ErrorApp extends Error {
  codigo: CodigoError;
  constructor(mensaje: string, codigo: CodigoError = 'VALIDACION') {
    super(mensaje);
    this.name = 'ErrorApp';
    this.codigo = codigo;
  }
}

/** exigir_ de Utils.js (con estrechamiento de tipos para TS). */
export function exigir(cond: unknown, mensaje: string, codigo: CodigoError = 'VALIDACION'): asserts cond {
  if (!cond) throw new ErrorApp(mensaje, codigo);
}

/** Mapeo del código de error legado al estado HTTP de la traducción REST. */
export function estadoHttpDeCodigo(c: CodigoError): number {
  switch (c) {
    case 'LOGIN': case 'SESION': return 401;
    case 'BLOQUEO': return 429;
    case 'PERMISO': return 403;
    case 'CAMBIAR_CLAVE': return 403; // apiEjecutar: bloquea todo salvo cambiar clave / logout / bootstrap
    case 'NO_ENCONTRADO': return 404;
    case 'CONFLICTO': return 409;
    default: return 400;
  }
}
