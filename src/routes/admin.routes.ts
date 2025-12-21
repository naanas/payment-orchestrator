import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { auth, adminOnly } from '../middleware/auth';


const router = Router();

router.post('/login', AdminController.login);
router.get('/dashboard', auth, adminOnly, AdminController.getDashboard);
router.get('/partners', auth, adminOnly, AdminController.getPartners);
router.put('/partners/:id', auth, adminOnly, AdminController.updatePartner);
router.get('/transactions', auth, adminOnly, AdminController.getTransactions);


export default router;