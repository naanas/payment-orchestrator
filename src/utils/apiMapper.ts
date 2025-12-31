import _ from 'lodash'; 

const replaceVariables = (template: any, context: any): any => {
  if (typeof template === 'string') {
    // [FIX] Ganti parameter '_' menjadi 'match' agar tidak menimpa import lodash
    return template.replace(/\{\{([\w\.]+)\}\}/g, (match, path) => {
      // Sekarang '_' merujuk ke lodash lagi
      const value = _.get(context, path, '');
      return String(value);
    });
  } else if (Array.isArray(template)) {
    return template.map(item => replaceVariables(item, context));
  } else if (typeof template === 'object' && template !== null) {
    const result: any = {};
    for (const key in template) {
      result[key] = replaceVariables(template[key], context);
    }
    return result;
  }
  return template;
};

export const mapRequest = (schema: any, context: any) => {
  const reqSchema = schema.request;
  const url = replaceVariables(reqSchema.url, context);
  const method = reqSchema.method || 'POST';
  const headers = replaceVariables(reqSchema.headers || {}, context);
  const data = replaceVariables(reqSchema.body || {}, context);

  return { url, method, headers, data };
};

export const mapResponse = (schema: any, responseBody: any) => {
  const resMapping = schema.response_mapping || {};
  const result: any = {};
  const targetFields = ['payment_url', 'virtual_account', 'qr_data', 'partner_transaction_id'];

  targetFields.forEach(field => {
    const path = resMapping[field];
    if (path) {
      result[field] = _.get(responseBody, path);
    }
  });

  return result;
};