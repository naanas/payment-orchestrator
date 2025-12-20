import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';

const router = Router();

// Public routes
router.get('/methods', PaymentController.getMethods);
router.post('/create', PaymentController.createPayment);
router.get('/status/:transaction_id', PaymentController.checkStatus);

// Route Webhook (POST)
router.post('/webhook', PaymentController.handleWebhook);

// 👇 ROUTE BARU: Simulasi Bayar via Klik Link (GET)
router.get('/pay-simulate/:transaction_id', PaymentController.simulateSuccess);

export default router;