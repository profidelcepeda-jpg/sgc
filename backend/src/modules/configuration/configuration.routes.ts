import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { ConfigurationController } from './configuration.controller';

const router = Router(), controller = new ConfigurationController();
function h(fn: (req: Request) => Promise<unknown> | unknown) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve().then(() => fn(req)).then(data => res.json(Object.assign({ ok: true }, data as object)), next);
}
router.get('/', requireAuth, h(req => controller.obtener(req)));
router.patch('/:grupo', requireAuth, h(req => controller.actualizarGrupo(req)));
router.patch('/school-years/:ano/dates', requireAuth, h(req => controller.fechasAno(req)));
router.put('/observation-types', requireAuth, h(req => controller.tiposObservacion(req)));
export default router;
