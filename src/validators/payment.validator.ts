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