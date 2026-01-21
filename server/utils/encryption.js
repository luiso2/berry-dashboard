import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('FATAL: ENCRYPTION_KEY must be set and exactly 32 characters');
  console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(16).toString(\'hex\'))"');
  console.error('═══════════════════════════════════════════════════════════════');
  process.exit(1);
}

const IV_LENGTH = 16;

export const encryptApiKey = (text) => {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

export const decryptApiKey = (text) => {
  if (!text) return null;
  const parts = text.split(':');
  if (parts.length !== 2) return null;
  const iv = Buffer.from(parts[0], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
  let decrypted = decipher.update(parts[1], 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

export const maskApiKey = (key) => {
  if (!key || key.length < 8) return key;
  const start = key.substring(0, 4);
  const end = key.substring(key.length - 4);
  return `${start}${'*'.repeat(Math.max(3, key.length - 8))}${end}`;
};
