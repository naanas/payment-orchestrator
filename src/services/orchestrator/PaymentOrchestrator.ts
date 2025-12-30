import { db } from '../../config/supabase';
import axios from 'axios'; 
import crypto from 'crypto'; // [BARU] Import Crypto untuk keamanan Webhook

export class PaymentOrchestrator {
  static async createPayment(amount: number, paymentMethodCode: string, customerData: any) {
    try {
      // -------------------------------------------------------------
      // 0. IDEMPOTENCY CHECK (Cek Reference ID)
      // -------------------------------------------------------------
      if (customerData.reference_id) {
        const { data: existingTrx } = await db.transactions()
          .select('*')
          .eq('reference_id', customerData.reference_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (existingTrx) {
          // Jika statusnya masih aktif, kembalikan data lama
          if (['PENDING', 'PROCESSING', 'SUCCESS'].includes(existingTrx.status)) {
            console.log(`[INFO] Returning existing transaction for Ref ID: ${customerData.reference_id}`);
            return {
              transaction_id: existingTrx.transaction_id,
              payment_url: existingTrx.payment_url,
              virtual_account: existingTrx.payment_data?.virtual_account,
              qr_data: existingTrx.payment_data?.qr_data,
              instructions: existingTrx.payment_data?.instructions,
              expires_at: existingTrx.expires_at,
              status: existingTrx.status,
              is_existing: true 
            };
          }
        }
      }

      // 1. Get payment method
      const { data: method, error } = await db.paymentMethods()
        .select(`*, payment_partners (*)`)
        .eq('code', paymentMethodCode)
        .eq('is_active', true)
        .single();

      if (error || !method) throw new Error('Payment method not found');

      // 2. Calculate fee
      const feeStructure = method.payment_partners.fee_structure || { percentage: 1.5, fixed: 2000, cap: 10000 };
      const fee = Math.min(
        feeStructure.fixed + (amount * feeStructure.percentage / 100),
        feeStructure.cap || 999999999
      );
      const netAmount = amount - fee;

      // 3. Generate transaction ID
      const transactionId = `TRX${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      // 4. Create transaction (DENGAN ERROR HANDLING YANG LEBIH BAIK)
      const { data: transaction, error: insertError } = await db.transactions()
        .insert({
          transaction_id: transactionId,
          reference_id: customerData.reference_id || null,
          partner_id: method.partner_id,
          payment_method_id: method.id,
          amount,
          fee,
          net_amount: netAmount,
          customer_email: customerData.email,
          customer_phone: customerData.phone,
          customer_name: customerData.name,
          description: customerData.description,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();

      // [FIX] Cek error spesifik DB (misal: kolom reference_id tidak ada)
      if (insertError) {
        console.error("❌ DATABASE INSERT ERROR:", insertError.message);
        throw new Error(`Database Error: ${insertError.message}`);
      }

      if (!transaction) throw new Error('Failed to create transaction');

      // Define Base URL
      const PORT = process.env.PORT || 3000;
      const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

      // 5. Generate payment data
      let paymentData: any = {};
      
      if (method.payment_partners.type === 'EWALLET') {
        paymentData = {
          partner_transaction_id: `EW${Date.now()}`,
          payment_url: `${baseUrl}/api/payments/pay-simulate/${transactionId}`,
          deeplink: `${method.payment_partners.code.toLowerCase()}://payment/${transactionId}`
        };
      } else if (method.payment_partners.type === 'BANK_VA') {
        const vaNumber = this.generateVANumber(method.payment_partners.code);
        paymentData = {
          partner_transaction_id: `VA${Date.now()}`,
          virtual_account: vaNumber,
          instructions: [
            `Transfer ke VA: ${vaNumber}`,
            `Bank: ${this.getBankName(method.payment_partners.code)}`,
            `A/N: ${customerData.name || 'Customer'}`
          ]
        };
      } else if (method.payment_partners.type === 'PAYMENT_GATEWAY') {
        paymentData = {
          partner_transaction_id: `PG${Date.now()}`,
          payment_url: `https://payment.example.com/pay/${transactionId}`,
          qr_data: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${transactionId}`
        };
      } else {
        paymentData = {
          partner_transaction_id: `TX${Date.now()}`,
          payment_url: `https://payment.example.com/pay/${transactionId}`
        };
      }

      // 6. Update transaction
      await db.transactions()
        .update({
          partner_transaction_id: paymentData.partner_transaction_id,
          payment_url: paymentData.payment_url,
          payment_data: paymentData,
          status: 'PROCESSING'
        })
        .eq('id', transaction.id);

      return {
        transaction_id: transactionId,
        payment_url: paymentData.payment_url,
        virtual_account: paymentData.virtual_account,
        qr_data: paymentData.qr_data,
        instructions: paymentData.instructions,
        expires_at: transaction.expires_at,
        status: 'PROCESSING'
      };

    } catch (error: any) {
      console.error('Payment error:', error);
      throw error;
    }
  }

  static async checkStatus(transactionId: string) {
    const { data: transaction, error } = await db.transactions()
      .select('*, payment_partners(code, name, type)')
      .eq('transaction_id', transactionId)
      .single();

    if (error || !transaction) throw new Error('Transaction not found');

    return transaction;
  }

  // [MODIFIKASI UTAMA DI SINI: WEBHOOK SIGNATURE]
  static async updateStatus(transactionId: string, status: string) { 
    try {
      // 1. Cek transaksi exist
      const { data: transaction, error: fetchError } = await db.transactions()
        .select('*')
        .eq('transaction_id', transactionId)
        .single();

      if (fetchError || !transaction) throw new Error('Transaction not found');

      // 2. Update status & timestamp
      const { data: updatedTransaction, error: updateError } = await db.transactions()
        .update({ 
          status: status,
          updated_at: new Date().toISOString(),
          ...(status === 'SUCCESS' ? { settled_at: new Date().toISOString() } : {})
        })
        .eq('transaction_id', transactionId)
        .select()
        .single();

      if (updateError) throw new Error(updateError.message);

      // 3. KIRIM WEBHOOK DENGAN KEAMANAN (SIGNATURE)
      try {
        const ecommerceWebhookUrl = process.env.ECOMMERCE_WEBHOOK_URL || '';
        const secret = process.env.WEBHOOK_SECRET || 'rahasia-super-aman'; // Wajib sama dengan di Ecommerce API

        console.log(`🚀 Sending webhook to ${ecommerceWebhookUrl} for TRX: ${transactionId}...`);
        
        // Buat Payload
        const payload = {
          transaction_id: transactionId,
          status: status,
          updated_at: new Date().toISOString()
        };

        // [BARU] Buat HMAC Signature
        const signature = crypto
          .createHmac('sha256', secret)
          .update(JSON.stringify(payload))
          .digest('hex');

        // Kirim dengan Header Signature
        await axios.post(ecommerceWebhookUrl, payload, {
          headers: { 
            'x-signature': signature,
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`✅ Webhook sent successfully!`);

      } catch (webhookError: any) {
        console.error(`⚠️ Failed to send webhook: ${webhookError.message}`);
      }

      return updatedTransaction;

    } catch (error: any) {
      throw new Error(`Failed to update status: ${error.message}`);
    }
  }

  private static generateVANumber(partnerCode: string): string {
    const bankCodes: Record<string, string> = {
      'BCA_VA': '39012',
      'BNI_VA': '88123',
      'BRI_VA': '90234',
      'MANDIRI_VA': '45678'
    };
    
    const code = bankCodes[partnerCode] || '99999';
    const random = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
    return `${code}${random}`;
  }

  private static getBankName(partnerCode: string): string {
    const names: Record<string, string> = {
      'BCA_VA': 'BCA',
      'BNI_VA': 'BNI',
      'BRI_VA': 'BRI',
      'MANDIRI_VA': 'Mandiri'
    };
    return names[partnerCode] || 'Bank';
  }
}