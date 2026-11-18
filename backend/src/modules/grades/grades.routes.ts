import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { ErrorApp } from '../../lib/errors';
import { guardarCalificaciones, obtenerGridCalificaciones, opcionesCalificaciones } from './grades.service';

const router=Router();
function h(fn:(req:Request)=>Promise<unknown>){return(req:Request,res:Response,next:NextFunction)=>{fn(req).then(data=>res.json(Object.assign({ok:true},data as object)),next);};}
function q(req:Request,k:string):string{const v=req.query[k];return typeof v==='string'?v:'';}
router.get('/options',requireAuth,h(req=>opcionesCalificaciones(req.ctx!,q(req,'ano'))));
router.get('/grid',requireAuth,h(req=>{
  const ano=q(req,'ano'),seccion=q(req,'seccion'),asignatura=q(req,'asignatura');
  if(!ano||!seccion||!asignatura) throw new ErrorApp('Indique año, sección y asignatura.','VALIDACION');
  return obtenerGridCalificaciones(req.ctx!,ano,seccion,asignatura);
}));
router.post('/batch',requireAuth,h(req=>guardarCalificaciones(req.ctx!,req.body||{})));
export default router;
