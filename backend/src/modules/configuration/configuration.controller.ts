import type { Request } from 'express';
import { ErrorApp } from '../../lib/errors';
import { actualizarConfiguracion, actualizarFechasAno, actualizarTiposObservacion, obtenerConfiguracion } from './configuration.service';
import { invalidarCacheConfig } from '../auth/auth.service';

function requerido(v: unknown, nombre: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new ErrorApp(`Indique ${nombre}.`, 'VALIDACION');
  return v.trim();
}

export class ConfigurationController {
  obtener(req: Request) { return obtenerConfiguracion(req.ctx!); }
  async actualizarGrupo(req: Request) {
    const grupo = requerido(req.params.grupo, 'categoría');
    const result = await actualizarConfiguracion(req.ctx!, grupo, (req.body as { cambios?: unknown } | undefined)?.cambios);
    if (grupo === 'seguridad' && result.cambios) invalidarCacheConfig();
    return result;
  }
  fechasAno(req: Request) { return actualizarFechasAno(req.ctx!, requerido(req.params.ano, 'año escolar'), req.body); }
  tiposObservacion(req: Request) { return actualizarTiposObservacion(req.ctx!, (req.body as { tipos?: unknown } | undefined)?.tipos); }
}
