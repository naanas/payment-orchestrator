import { db } from '../../config/supabase';

export class PaymentOrchestrator {
  static async createPayment(amount: number, paymentMethodCode: string, customerData: any) {
    try {
      // 1. Get payment method
      const { data: method, error } = await db.paymentMethods()
        .select(`
          *,
          payment_partners (*)
        `)
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

      // 4. Create transaction
      const { data: transaction } = await db.transactions()
        .insert({
          transaction_id: transactionId,
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

      if (!transaction) throw new Error('Failed to create transaction');

      // 5. Generate payment data based on partner type
      let paymentData: any = {};
      
      if (method.payment_partners.type === 'EWALLET') {
        paymentData = {
          partner_transaction_id: `EW${Date.now()}`,
          payment_url: `https://${method.payment_partners.code.toLowerCase()}.com/pay/${transactionId}`,
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

      // 6. Update transaction dengan payment data
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

    // Simulate random status update
    const statuses = ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'EXPIRED'];
    const weights = [0.1, 0.1, 0.6, 0.1, 0.1]; // 60% success
    const randomStatus = this.getWeightedRandom(statuses, weights);

    // Only update if different
    if (randomStatus !== transaction.status) {
      await db.transactions()
        .update({ 
          status: randomStatus,
          ...(randomStatus === 'SUCCESS' ? { settled_at: new Date().toISOString() } : {})
        })
        .eq('id', transaction.id);
      
      return { ...transaction, status: randomStatus };
    }

    return transaction;
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

  private static getWeightedRandom(items: string[], weights: number[]): string {
    let i;
    for (i = 1; i < weights.length; i++) {
      weights[i] += weights[i - 1];
    }
    
    const random = Math.random() * weights[weights.length - 1];
    
    for (i = 0; i < weights.length; i++) {
      if (weights[i] > random) {
        break;
      }
    }
    
    return items[i];
  }
}