import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { ErrorApp } from '../../lib/errors';
import { boletinEstudiante, dashboardReporte, datosCursoReporte, expedienteEstudiante, historialReporte, opcionesReportes } from './reports.service';

const router=Router();
function h(fn:(req:Request)=>Promise<unknown>){return(req:Request,res:Response,next:NextFunction)=>{fn(req).then(data=>res.json(Object.assign({ok:true},data as object)),next);};}
function q(req:Request,k:string){const v=req.query[k];return typeof v==='string'?v:'';}
function grupo(req:Request){const ano=q(req,'ano'),seccion=q(req,'seccion');if(!ano||!seccion)throw new ErrorApp('Indique año escolar y sección.','VALIDACION');return {ano,seccion};}
router.get('/options',requireAuth,h(req=>opcionesReportes(req.ctx!)));
router.get('/course',requireAuth,h(req=>{const g=grupo(req);return datosCursoReporte(req.ctx!,g.ano,g.seccion);}));
router.get('/dashboard',requireAuth,h(req=>{const g=grupo(req);return dashboardReporte(req.ctx!,g.ano,g.seccion,Number(q(req,'periodo'))||1);}));
router.get('/bulletin',requireAuth,h(req=>{const g=grupo(req),id=q(req,'estudiante');if(!id)throw new ErrorApp('Indique estudiante.','VALIDACION');return boletinEstudiante(req.ctx!,g.ano,g.seccion,id);}));
router.get('/student-record',requireAuth,h(req=>{const g=grupo(req),id=q(req,'estudiante');if(!id)throw new ErrorApp('Indique estudiante.','VALIDACION');return expedienteEstudiante(req.ctx!,g.ano,g.seccion,id);}));
router.get('/students/:id/history',requireAuth,h(req=>historialReporte(req.ctx!,String(req.params.id))));
export default router;
