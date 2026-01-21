import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';

export const isValidRedirectUri = (uri) => {
  try {
    const url = new URL(uri);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const verifyWebhookSignature = (payload, signature, secret) => {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('base64');
  return hash === signature;
};

export const parseCSV = (buffer) => {
  return parse(buffer.toString(), {
    columns: true,
    skip_empty_lines: true,
  });
};

export const parseExcel = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(worksheet);
};
