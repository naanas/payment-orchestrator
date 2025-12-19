export interface PaymentPartner {
  id: string;
  name: string;
  code: string;
  type: string;
  status: string;
  credentials: Record<string, any>;
  config: Record<string, any>;
  fee_structure: {
    percentage: number;
    fixed: number;
    cap: number | null;
  };
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  partner_id: string;
  code: string;
  name: string;
  category: 'EWALLET' | 'VIRTUAL_ACCOUNT' | 'BANK_TRANSFER' | 'QRIS' | 'CREDIT_CARD';
  min_amount: number;
  max_amount: number;
  is_active: boolean;
  icon_url?: string;
  ordering: number;
}

export interface Transaction {
  id: string;
  transaction_id: string;
  amount: number;
  fee: number;
  status: string;
  customer_email?: string;
  customer_name?: string;
  payment_url?: string;
  created_at: string;
  payment_partners?: {
    name: string;
    code: string;
  };
  payment_methods?: {
    name: string;
  };
}

export interface PaymentRequest {
  amount: number;
  payment_method: string;
  customer_email?: string;
  customer_phone?: string;
  customer_name?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResponse {
  transaction_id: string;
  payment_url?: string;
  virtual_account?: string;
  qr_data?: string;
  instructions?: string[];
  expires_at: string;
  status: string;
}