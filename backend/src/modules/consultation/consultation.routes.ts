import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { ErrorApp } from '../../lib/errors';
import { buscarEstudiantes, estudiantesDeSeccion, expedienteAcademico, historialEstudiante, opcionesConsulta, perfilEstudiante, seccionesConsulta } from './consultation.service';

const router=Router();
function h(fn:(req:Request)=>Promise<unknown>){return(req:Request,res:Response,next:NextFunction)=>{fn(req).then(data=>res.json(Object.assign({ok:true},data as object)),next);};}
function q(req:Request,k:string){const v=req.query[k];return typeof v==='string'?v:'';}
function param(req:Request,k:string){const v=req.params[k];return Array.isArray(v)?v[0]:String(v||'');}
router.get('/options',requireAuth,h(req=>opcionesConsulta(req.ctx!,q(req,'ano'))));
router.get('/students',requireAuth,h(req=>buscarEstudiantes(req.ctx!,{q:q(req,'q'),ano:q(req,'ano'),periodo:q(req,'periodo'),grado:q(req,'grado'),curso:q(req,'curso'),seccion:q(req,'seccion'),asignatura:q(req,'asignatura'),docente:q(req,'docente'),estado:q(req,'estado'),pag:q(req,'pag'),tam:q(req,'tam')})));
router.get('/students/:id/profile',requireAuth,h(req=>{const ano=q(req,'ano');if(!ano)throw new ErrorApp('Seleccione el año escolar.','VALIDACION');return perfilEstudiante(req.ctx!,param(req,'id'),ano);}));
router.get('/students/:id/academic-record',requireAuth,h(req=>{const ano=q(req,'ano');if(!ano)throw new ErrorApp('Seleccione el año escolar.','VALIDACION');return expedienteAcademico(req.ctx!,param(req,'id'),ano);}));
router.get('/students/:id/history',requireAuth,h(req=>historialEstudiante(req.ctx!,param(req,'id'))));
router.get('/sections',requireAuth,h(req=>seccionesConsulta(req.ctx!,q(req,'ano'),q(req,'grado'),q(req,'estado'))));
router.get('/sections/:id/students',requireAuth,h(req=>estudiantesDeSeccion(req.ctx!,param(req,'id'),q(req,'ano'),q(req,'estado'),q(req,'pag'),q(req,'tam'))));
export default router;
