import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration');
  console.log('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
  console.log('SUPABASE_KEY:', supabaseKey ? 'Set' : 'Missing');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export const db = {
  paymentPartners: () => supabase.from('payment_partners'),
  paymentMethods: () => supabase.from('payment_methods'),
  transactions: () => supabase.from('transactions'),
  users: () => supabase.from('users'),
  auditLogs: () => supabase.from('audit_logs'),
  webhookLogs: () => supabase.from('webhook_logs'),
  configurations: () => supabase.from('configurations'),
  merchants: () => supabase.from('merchants') 
};