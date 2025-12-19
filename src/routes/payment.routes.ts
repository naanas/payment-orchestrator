import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';

const router = Router();

// Public routes
router.get('/methods', PaymentController.getMethods);
router.post('/create', PaymentController.createPayment);
router.get('/status/:transaction_id', PaymentController.checkStatus);

export default router;