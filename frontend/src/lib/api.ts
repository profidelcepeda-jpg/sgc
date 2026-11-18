/*********************************************************************
 * api.ts — Cliente HTTP del frontend
 * Todas las llamadas usan la cookie httpOnly (credentials: include) y
 * traducen {ok:false, error, codigo} a una ApiError con el código del
 * backend (PERMISO, CAMBIAR_CLAVE, SESION…).
 *********************************************************************/

export class ApiError extends Error {
  estado: number;
  codigo?: string;

  constructor(mensaje: string, estado: number, codigo?: string) {
    super(mensaje);
    this.name = 'ApiError';
    this.estado = estado;
    this.codigo = codigo;
  }
}

interface OpcionesApi {
  method?: string;
  body?: unknown;
}

export async function api<T>(ruta: string, opciones: OpcionesApi = {}): Promise<T> {
  const cabeceras: Record<string, string> = {};
  const init: RequestInit = {
    method: opciones.method || 'GET',
    credentials: 'include',
    headers: cabeceras,
  };
  if (opciones.body !== undefined) {
    cabeceras['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opciones.body);
  }

  let res: Response;
  try {
    res = await fetch(ruta, init);
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Verifique que el backend esté escuchando en el puerto 4000.', 0);
  }

  const texto = await res.text();
  let data: unknown = null;
  if (texto) {
    try { data = JSON.parse(texto); } catch { data = null; }
  }
  const obj = (data !== null && typeof data === 'object') ? data as Record<string, unknown> : {};
  if (!res.ok || obj.ok === false) {
    const mensaje = typeof obj.error === 'string' ? obj.error : 'No se pudo completar la operación.';
    const codigo = typeof obj.codigo === 'string' ? obj.codigo : undefined;
    throw new ApiError(mensaje, res.status, codigo);
  }
  return obj as T;
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Ocurrió un error inesperado.';
}
