import bcrypt from 'bcrypt';
import crypto from 'crypto';

export const hashPassword = async (password) => {
  return bcrypt.hash(password, 10);
};

export const legacyHashPassword = (password) => {
  // Legacy hash for migration purposes
  return password; 
};

export const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

export const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};
