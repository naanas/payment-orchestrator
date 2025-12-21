import Joi from 'joi';

export const paymentRequestSchema = Joi.object({
  amount: Joi.number().positive().required(),
  payment_method: Joi.string().required(),
  customer_email: Joi.string().email().optional(),
  customer_phone: Joi.string().optional(),
  customer_name: Joi.string().optional(),
  description: Joi.string().optional(),
  metadata: Joi.object().optional()
});

export const partnerSchema = Joi.object({
  name: Joi.string().required(),
  code: Joi.string().required(),
  type: Joi.string().valid('EWALLET', 'BANK_VA', 'PAYMENT_GATEWAY', 'QRIS').required(),
  credentials: Joi.object().required(),
  webhook_url: Joi.string().uri().optional(),
  config: Joi.object({
    timeout: Joi.number().default(30000),
    retry_attempts: Joi.number().default(3),
    success_status: Joi.array().items(Joi.string()).default([]),
    pending_status: Joi.array().items(Joi.string()).default([]),
    failed_status: Joi.array().items(Joi.string()).default([])
  }).default({}),
  fee_structure: Joi.object({
    percentage: Joi.number().min(0).default(0),
    fixed: Joi.number().min(0).default(0),
    cap: Joi.number().min(0).optional().allow(null)
  }).default({})
});

export const createPaymentSchema = Joi.object({
  amount: Joi.number().min(1000).required(),
  // 👇 NAH INI DIA BIANG KEROKNYA, TAMBAHIN KODE LAIN DISINI
  payment_method: Joi.string().valid(
    'BCA_VA', 
    'BNI_VA', 
    'BRI_VA',      // <--- Tambahin ini
    'MANDIRI_VA',  // <--- Tambahin ini
    'PERMATA_VA',  // <--- Tambahin ini
    'OVO',         // <--- Tambahin ini
    'DANA',        // <--- Tambahin ini
    'GOPAY',       // <--- Tambahin ini
    'QRIS'         // <--- Tambahin ini
  ).required(),
  
  customer_name: Joi.string().required(),
  customer_email: Joi.string().email().required(),
  customer_phone: Joi.string().optional(),
  reference_id: Joi.string().required(),
  description: Joi.string().optional()
});