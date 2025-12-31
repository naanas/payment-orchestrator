import { db } from '../../config/supabase';
import axios from 'axios'; 
import crypto from 'crypto';
import { mapRequest, mapResponse } from '../../utils/apiMapper'; 

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
          if (['PENDING', 'PROCESSING', 'SUCCESS'].includes(existingTrx.status)) {
            console.log(`[INFO] Returning existing transaction for Ref ID: ${customerData.reference_id}`);
            return {
              transaction_id: existingTrx.transaction_id,
              amount: existingTrx.amount, // [FIX] Pastikan amount dikembalikan juga
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

      // -------------------------------------------------------------
      // 1. GET PAYMENT METHOD & PARTNER CONFIG
      // -------------------------------------------------------------
      const { data: method, error } = await db.paymentMethods()
        .select(`*, payment_partners (*)`)
        .eq('code', paymentMethodCode)
        .eq('is_active', true)
        .single();

      if (error || !method) throw new Error('Payment method not found');

      const partner = method.payment_partners;

      // -------------------------------------------------------------
      // 2. CALCULATE FEE
      // -------------------------------------------------------------
      const feeStructure = partner.fee_structure || { percentage: 1.5, fixed: 2000, cap: 10000 };
      const fee = Math.min(
        feeStructure.fixed + (amount * feeStructure.percentage / 100),
        feeStructure.cap || 999999999
      );
      const netAmount = amount - fee;

      // -------------------------------------------------------------
      // 3. GENERATE TRANSACTION ID (Internal)
      // -------------------------------------------------------------
      const transactionId = `TRX${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      
      const PORT = process.env.PORT || 3000;
      const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

      // -------------------------------------------------------------
      // 4. INSERT TRANSACTION (Status: PENDING)
      // -------------------------------------------------------------
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
          status: 'PENDING', 
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error("❌ DATABASE INSERT ERROR:", insertError.message);
        throw new Error(`Database Error: ${insertError.message}`);
      }

      // -------------------------------------------------------------
      // 5. PROCESS PAYMENT (DYNAMIC VS HARDCODED)
      // -------------------------------------------------------------
      let paymentData: any = {};
      let finalStatus = 'PROCESSING';

      // LOGIC DYNAMIC MAPPING
      if (partner.mapping_schema && partner.mapping_schema.request) {
        console.log(`[ORCHESTRATOR] Using Dynamic Mapping for ${partner.name}`);

        const context = {
          transaction_id: transactionId,
          amount: Math.floor(amount), 
          email: customerData.email,
          name: customerData.name,
          phone: customerData.phone,
          description: customerData.description || `Payment for ${transactionId}`,
          credentials: partner.credentials, 
          config: {
            return_url: `${baseUrl}/payment-success`,
            callback_url: `${baseUrl}/api/payments/webhook`
          }
        };

        try {
          const axiosConfig = mapRequest(partner.mapping_schema, context);
          
          console.log(`[ORCHESTRATOR] Hitting Partner API: ${axiosConfig.method} ${axiosConfig.url}`);
          
          const response = await axios(axiosConfig);
          const mappedData = mapResponse(partner.mapping_schema, response.data);
          
          paymentData = {
            ...mappedData,
            raw_response: response.data 
          };

          if (!paymentData.partner_transaction_id) {
            paymentData.partner_transaction_id = `EXT-${transactionId}`;
          }

        } catch (apiError: any) {
          console.error(`[ORCHESTRATOR] Partner API Failed:`, apiError.response?.data || apiError.message);
          
          await db.transactions()
            .update({ status: 'FAILED', payment_data: { error: apiError.message } })
            .eq('id', transaction.id);

          throw new Error(`Partner API Error: ${apiError.message}`);
        }

      } else {
        // LOGIC HARDCODED (FALLBACK)
        console.log(`[ORCHESTRATOR] Using Hardcoded Logic for ${partner.name}`);
        
        if (partner.type === 'EWALLET') {
          paymentData = {
            partner_transaction_id: `EW${Date.now()}`,
            payment_url: `${baseUrl}/api/payments/pay-simulate/${transactionId}`,
            deeplink: `${partner.code.toLowerCase()}://payment/${transactionId}`
          };
        } else if (partner.type === 'BANK_VA') {
          const vaNumber = this.generateVANumber(partner.code);
          paymentData = {
            partner_transaction_id: `VA${Date.now()}`,
            virtual_account: vaNumber,
            instructions: [
              `Transfer ke VA: ${vaNumber}`,
              `Bank: ${this.getBankName(partner.code)}`,
              `A/N: ${customerData.name || 'Customer'}`
            ]
          };
        } else if (partner.type === 'PAYMENT_GATEWAY') {
          paymentData = {
            partner_transaction_id: `PG${Date.now()}`,
            payment_url: `https://payment.example.com/pay/${transactionId}`,
            qr_data: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${transactionId}`
          };
        }
      }

      // -------------------------------------------------------------
      // 6. UPDATE TRANSACTION DATA
      // -------------------------------------------------------------
      await db.transactions()
        .update({
          partner_transaction_id: paymentData.partner_transaction_id,
          payment_url: paymentData.payment_url,
          payment_data: paymentData,
          status: finalStatus
        })
        .eq('id', transaction.id);

      // =========================================================
      // [FIX UTAMA] Kembalikan 'amount' di response akhir
      // =========================================================
      return {
        transaction_id: transactionId,
        amount: amount, // <--- INI YANG HILANG SEBELUMNYA
        payment_url: paymentData.payment_url,
        virtual_account: paymentData.virtual_account,
        qr_data: paymentData.qr_data,
        instructions: paymentData.instructions,
        expires_at: transaction.expires_at,
        status: finalStatus
      };

    } catch (error: any) {
      console.error('Payment error:', error);
      throw error;
    }
  }

  // =================================================================
  // EXISTING METHODS (CHECK STATUS, WEBHOOK, UTILS)
  // =================================================================

  static async checkStatus(transactionId: string) {
    const { data: transaction, error } = await db.transactions()
      .select('*, payment_partners(code, name, type)')
      .eq('transaction_id', transactionId)
      .single();

    if (error || !transaction) throw new Error('Transaction not found');

    return transaction;
  }

  static async updateStatus(transactionId: string, status: string) { 
    try {
      const { data: transaction, error: fetchError } = await db.transactions()
        .select('*')
        .eq('transaction_id', transactionId)
        .single();

      if (fetchError || !transaction) throw new Error('Transaction not found');

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

      this.sendWebhookToClient(transactionId, status);

      return updatedTransaction;

    } catch (error: any) {
      throw new Error(`Failed to update status: ${error.message}`);
    }
  }

  private static async sendWebhookToClient(transactionId: string, status: string) {
    try {
        const ecommerceWebhookUrl = process.env.ECOMMERCE_WEBHOOK_URL || '';
        const secret = process.env.WEBHOOK_SECRET || 'rahasia-super-aman';

        if (!ecommerceWebhookUrl) return;

        console.log(`🚀 Sending webhook to ${ecommerceWebhookUrl} for TRX: ${transactionId}...`);
        
        const payload = {
          transaction_id: transactionId,
          status: status,
          updated_at: new Date().toISOString()
        };

        const signature = crypto
          .createHmac('sha256', secret)
          .update(JSON.stringify(payload))
          .digest('hex');

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