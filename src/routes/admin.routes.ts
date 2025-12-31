import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { auth, adminOnly } from '../middleware/auth';

const router = Router();

// [BARU] Taruh DI ATAS middleware auth agar Public (Bisa diakses Checkout FE)
router.get('/config', AdminController.getConfig);

// Route Admin Existing
router.post('/login', AdminController.login);

// Protected Routes
router.get('/dashboard', auth, adminOnly, AdminController.getDashboard);

// === MODULE PARTNERS ===
router.get('/partners', auth, adminOnly, AdminController.getPartners);
router.post('/partners', auth, adminOnly, AdminController.createPartner); // <--- [FIX] Tambahkan ini
router.put('/partners/:id', auth, adminOnly, AdminController.updatePartner);

// === MODULE TRANSACTIONS ===
router.get('/transactions', auth, adminOnly, AdminController.getTransactions);

export default router;