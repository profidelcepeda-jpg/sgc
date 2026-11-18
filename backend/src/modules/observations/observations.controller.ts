import { Request } from 'express';
import { ErrorApp } from '../../lib/errors';
import { Ctx } from '../auth/auth.service';
import { actualizarObservacion, cambiarEstadoObservacion, crearObservacion, listarObservaciones, obtenerObservacion, opcionesObservaciones, seccionesObservaciones } from './observations.service';

function str(v:unknown){return typeof v==='string'?v:'';}
function ctx(req:Request):Ctx{return req.ctx!;}
function requerido(v:string,label:string){if(!v.trim())throw new ErrorApp(`Indique ${label}.`,'VALIDACION');return v.trim();}

/** Adaptador HTTP: normaliza parámetros y delega las reglas de negocio al servicio. */
export class ObservacionController {
  listar(req:Request){
    const q=req.query as Record<string,unknown>;
    return listarObservaciones(ctx(req),{ano:requerido(str(q.ano),'año escolar'),seccion:requerido(str(q.seccion),'sección'),estudiante:str(q.estudiante)||undefined,tipo:str(q.tipo)||undefined,q:str(q.q)||undefined,incluirAnuladas:q.incluirAnuladas==='1'||q.incluirAnuladas==='true',pag:Number(q.pag)||1,tam:Number(q.tam)||25});
  }
  secciones(req:Request){return seccionesObservaciones(ctx(req));}
  opciones(req:Request){const q=req.query as Record<string,unknown>;return opcionesObservaciones(ctx(req),requerido(str(q.ano),'año escolar'),requerido(str(q.seccion),'sección'));}
  obtener(req:Request){return obtenerObservacion(ctx(req),String(req.params.id));}
  crear(req:Request){const b=(req.body||{}) as Record<string,unknown>;return crearObservacion(ctx(req),{ano:b.ano,seccion:b.seccion,idEstudiante:b.idEstudiante,tipo:b.tipo,fecha:b.fecha,idAsignatura:b.idAsignatura,idPeriodo:b.idPeriodo,texto:b.texto});}
  actualizar(req:Request){const b=(req.body||{}) as Record<string,unknown>;return actualizarObservacion(ctx(req),String(req.params.id),{idEstudiante:b.idEstudiante,tipo:b.tipo,fecha:b.fecha,idAsignatura:b.idAsignatura,idPeriodo:b.idPeriodo,texto:b.texto});}
  cambiarEstado(req:Request){return cambiarEstadoObservacion(ctx(req),String(req.params.id),(req.body||{}).estado);}
  anular(req:Request){return cambiarEstadoObservacion(ctx(req),String(req.params.id),'ANULADA');}
}
