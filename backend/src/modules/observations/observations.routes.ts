import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { ObservacionController } from './observations.controller';

const router=Router(),controller=new ObservacionController();
function h(fn:(req:Request)=>Promise<unknown>){return(req:Request,res:Response,next:NextFunction)=>{fn(req).then(data=>res.json(Object.assign({ok:true},data as object)),next);};}
router.get('/options',requireAuth,h(req=>controller.opciones(req)));
router.get('/sections',requireAuth,h(req=>controller.secciones(req)));
router.get('/',requireAuth,h(req=>controller.listar(req)));
router.get('/:id',requireAuth,h(req=>controller.obtener(req)));
router.post('/',requireAuth,h(req=>controller.crear(req)));
router.patch('/:id',requireAuth,h(req=>controller.actualizar(req)));
router.patch('/:id/status',requireAuth,h(req=>controller.cambiarEstado(req)));
// DELETE es una anulación lógica y reversible; la fila permanece en PostgreSQL.
router.delete('/:id',requireAuth,h(req=>controller.anular(req)));
export default router;
