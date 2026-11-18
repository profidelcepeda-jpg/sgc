import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { ErrorApp } from '../../lib/errors';
import { actualizarEstudiante, asignarEstudiante, buscarEstudiantes, cambiarEstadoMatricula, crearEstudiante, importarEstudiantes, perfilEstudiante } from './students.service';

const router=Router();
function h(fn:(req:Request)=>Promise<unknown>){return(req:Request,res:Response,next:NextFunction)=>{fn(req).then(data=>res.json(Object.assign({ok:true},data as object)),next);};}
function q(req:Request,k:string){const v=req.query[k];return typeof v==='string'?v:'';}
function id(req:Request){const v=req.params.id;return Array.isArray(v)?v[0]:String(v||'');}
router.get('/',requireAuth,h(req=>buscarEstudiantes(req.ctx!,{q:q(req,'q'),ano:q(req,'ano'),grado:q(req,'grado'),curso:q(req,'curso'),seccion:q(req,'seccion'),estado:q(req,'estado'),pag:q(req,'pag'),tam:q(req,'tam')})));
router.post('/',requireAuth,h(req=>crearEstudiante(req.ctx!,req.body||{})));
router.post('/import',requireAuth,h(req=>importarEstudiantes(req.ctx!,req.body?.ano,req.body?.seccion,req.body?.texto)));
router.get('/:id',requireAuth,h(req=>{const ano=q(req,'ano');if(!ano)throw new ErrorApp('Seleccione el año escolar.','VALIDACION');return perfilEstudiante(req.ctx!,id(req),ano);}));
router.patch('/:id',requireAuth,h(req=>{const ano=q(req,'ano')||String(req.body?.ano||'');if(!ano)throw new ErrorApp('Seleccione el año escolar.','VALIDACION');return actualizarEstudiante(req.ctx!,id(req),ano,req.body||{});}));
router.patch('/:id/status',requireAuth,h(req=>cambiarEstadoMatricula(req.ctx!,id(req),req.body?.ano,req.body?.estado)));
router.post('/:id/enrollments',requireAuth,h(req=>asignarEstudiante(req.ctx!,id(req),req.body?.ano,req.body?.seccion)));
export default router;
