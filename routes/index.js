import { Router } from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController';
import AuthController from '../controllers/AuthController';
import FilesController from '../controllers/FilesController';

const router = Router();

// Forward any async-handler rejection to the error middleware, so a thrown
// error becomes a 500 response instead of a request that hangs forever.
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

router.get('/status', wrap(AppController.getStatus));
router.get('/stats', wrap(AppController.getStats));

router.post('/users', wrap(UsersController.postNew));
router.get('/users/me', wrap(UsersController.getMe));

router.get('/connect', wrap(AuthController.getConnect));
router.get('/disconnect', wrap(AuthController.getDisconnect));

router.post('/files', wrap(FilesController.postUpload));
router.get('/files', wrap(FilesController.getIndex));
router.get('/files/:id', wrap(FilesController.getShow));
router.put('/files/:id/publish', wrap(FilesController.putPublish));
router.put('/files/:id/unpublish', wrap(FilesController.putUnpublish));
router.get('/files/:id/data', wrap(FilesController.getFile));

export default router;
