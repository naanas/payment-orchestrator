import { Request, Response } from 'express';
import { PaymentOrchestrator } from '../services/orchestrator/PaymentOrchestrator';
import { db } from '../config/supabase';

export class PaymentController {
  static async createPayment(req: Request, res: Response) {
    try {
      const { amount, payment_method, customer_email, customer_name, customer_phone, description } = req.body;

      if (!amount || !payment_method) {
        return res.status(400).json({ error: 'Amount and payment method required' });
      }

      const result = await PaymentOrchestrator.createPayment(
        parseFloat(amount),
        payment_method,
        { email: customer_email, name: customer_name, phone: customer_phone, description }
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Payment error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async checkStatus(req: Request, res: Response) {
    try {
      const { transaction_id } = req.params;
      const result = await PaymentOrchestrator.checkStatus(transaction_id);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }

  static async getMethods(req: Request, res: Response) {
    try {
      const { data: methods, error } = await db.paymentMethods()
        .select(`
          *,
          payment_partners (
            name,
            code,
            fee_structure
          )
        `)
        .eq('is_active', true)
        .order('ordering');

      if (error) throw error;

      res.json({ success: true, data: methods });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // 👇 METHOD BARU: Handle Webhook
  static async handleWebhook(req: Request, res: Response) {
    try {
      const { transaction_id, status } = req.body;

      // Validasi Input
      if (!transaction_id || !status) {
        return res.status(400).json({ 
          success: false, 
          error: 'Transaction ID and status are required' 
        });
      }

      // Validasi Status yang diperbolehkan
      const allowedStatuses = ['SUCCESS', 'FAILED', 'PENDING'];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid status. Allowed: SUCCESS, FAILED, PENDING' 
        });
      }

      // Update via Orchestrator
      const result = await PaymentOrchestrator.updateStatus(transaction_id, status);

      res.json({
        success: true,
        message: 'Payment status updated successfully',
        data: result
      });

    } catch (error: any) {
      console.error('Webhook error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
  // 👇 METHOD BARU: Simulasi Pembayaran Berhasil via Klik Link
  static async simulateSuccess(req: Request, res: Response) {
    try {
      const { transaction_id } = req.params;
      
      // Panggil fungsi update status ke SUCCESS
      await PaymentOrchestrator.updateStatus(transaction_id, 'SUCCESS');
      
      // Tampilkan halaman HTML sederhana biar jelas
      res.send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <div style="color: green; font-size: 50px;">✅</div>
            <h1>Pembayaran Berhasil!</h1>
            <p>Transaksi <strong>${transaction_id}</strong> telah dilunasi.</p>
            <p>Status: <span style="color: green; font-weight: bold;">SUCCESS</span></p>
            <script>
              // Opsional: Tutup tab otomatis setelah 3 detik
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
        </html>
      `);
    } catch (error: any) {
      res.status(500).send(`<h1>Gagal: ${error.message}</h1>`);
    }
  }
}