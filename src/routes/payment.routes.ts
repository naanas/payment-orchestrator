import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';
import { apiKeyMiddleware } from '../middleware/apiKey'; // 👈 Import Middleware Baru

const router = Router();

// ================= PUBLIC ROUTES (Bisa Diakses Siapa Saja) =================
// List metode pembayaran biasanya public (atau bisa juga diprotect, terserah)
router.get('/methods', PaymentController.getMethods);

// Webhook dipanggil oleh Pihak Ketiga (Xendit/Midtrans), jangan di-lock pakai Server Key kita
router.post('/webhook', PaymentController.handleWebhook);

// Simulasi bayar diakses user via browser
router.get('/pay-simulate/:transaction_id', PaymentController.simulateSuccess);


// ================= PROTECTED ROUTES (Server-to-Server) =================
// 🔥 Pasang apiKeyMiddleware disini biar E-commerce bisa hit kapan aja 🔥
router.post('/create', apiKeyMiddleware, PaymentController.createPayment);
router.get('/status/:transaction_id', apiKeyMiddleware, PaymentController.checkStatus);

export default router;