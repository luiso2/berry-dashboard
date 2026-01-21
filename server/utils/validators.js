export const isValidRedirectUri = (uri) => {
  try {
    const url = new URL(uri);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const verifyWebhookSignature = (payload, signature, secret) => {
  const crypto = await import('crypto');
  const hash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('base64');
  return hash === signature;
};

export const parseCSV = (buffer) => {
  const { parse } = await import('csv-parse/sync');
  return parse(buffer.toString(), {
    columns: true,
    skip_empty_lines: true,
  });
};

export const parseExcel = (buffer) => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(worksheet);
};
