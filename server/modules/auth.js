import express from 'express';
import crypto from 'crypto';
import { hashPassword, comparePassword, generateToken } from '../utils/password.js';
import { isValidRedirectUri } from '../utils/validators.js';

const router = express.Router();

// OAuth: Allowed redirect URIs (whitelist)
const ALLOWED_REDIRECT_URIS = [
  'https://chat.openai.com/aip/g-faca3a52350bea551c80533e84c5eff01cc9dbcd/oauth/callback',
  'https://chat.openai.com',
  'https://chatgpt.com',
];

// Helper to validate redirect URI
const validateRedirectUri = (uri) => {
  if (!uri) return true;
  return ALLOWED_REDIRECT_URIS.some(allowed => 
    uri.startsWith(allowed) || 
    uri.includes('chat.openai.com') || 
    uri.includes('chatgpt.com') || 
    uri.includes('localhost')
  );
};

export const createAuthRoutes = (pool) => {
  // OAuth: Authorization endpoint (GET /oauth/authorize)
  router.get('/oauth/authorize', async (req, res) => {
    const { client_id, response_type, redirect_uri, scope, state } = req.query;

    try {
      // Validate request
      if (!client_id || response_type !== 'code') {
        return res.status(400).json({ error: 'invalid_request' });
      }

      if (!validateRedirectUri(redirect_uri)) {
        return res.status(400).json({ error: 'invalid_redirect_uri' });
      }

      // Check client exists
      const client = await pool.query(
        'SELECT id FROM users WHERE id = $1',
        [client_id]
      );

      if (client.rows.length === 0) {
        return res.status(400).json({ error: 'unknown_client' });
      }

      // Generate authorization code
      const code = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await pool.query(
        `INSERT INTO auth_codes (code, client_id, redirect_uri, scope, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [code, client_id, redirect_uri, scope, expiresAt]
      );

      // Redirect with code
      const params = new URLSearchParams({ code, state });
      res.redirect(`${redirect_uri}?${params}`);
    } catch (error) {
      console.error('OAuth authorize error:', error);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // OAuth: Login endpoint (POST /oauth/login)
  router.post('/oauth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password required' });
      }

      const result = await pool.query(
        'SELECT id, email, password_hash FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const passwordMatch = await comparePassword(password, user.password_hash);

      if (!passwordMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await pool.query(
        `INSERT INTO auth_tokens (user_id, user_email, token, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [user.id, user.email, token, expiresAt]
      );

      res.json({
        success: true,
        token,
        user: { id: user.id, email: user.email }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Login failed' });
    }
  });

  // OAuth: Register endpoint (POST /oauth/register)
  router.post('/oauth/register', async (req, res) => {
    const { email, password, name } = req.body;

    try {
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password required' });
      }

      // Check if user exists
      const existing = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({ message: 'User already exists' });
      }

      const passwordHash = await hashPassword(password);

      const result = await pool.query(
        `INSERT INTO users (email, password_hash, name)
         VALUES ($1, $2, $3)
         RETURNING id, email`,
        [email, passwordHash, name || email.split('@')[0]]
      );

      const user = result.rows[0];
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await pool.query(
        `INSERT INTO auth_tokens (user_id, user_email, token, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [user.id, user.email, token, expiresAt]
      );

      res.json({
        success: true,
        token,
        user: { id: user.id, email: user.email }
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ message: 'Registration failed' });
    }
  });

  // OAuth: Token endpoint (POST /oauth/token)
  router.post('/oauth/token', async (req, res) => {
    const { grant_type, code, client_id, redirect_uri } = req.body;

    try {
      if (grant_type !== 'authorization_code' || !code || !client_id) {
        return res.status(400).json({ error: 'invalid_request' });
      }

      const result = await pool.query(
        `SELECT code, client_id, redirect_uri FROM auth_codes
         WHERE code = $1 AND expires_at > NOW()`,
        [code]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'invalid_code' });
      }

      const authCode = result.rows[0];
      if (authCode.client_id !== client_id || authCode.redirect_uri !== redirect_uri) {
        return res.status(400).json({ error: 'invalid_grant' });
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await pool.query(
        `INSERT INTO auth_tokens (user_id, token, expires_at)
         VALUES ($1, $2, $3)`,
        [client_id, token, expiresAt]
      );

      // Delete used code
      await pool.query('DELETE FROM auth_codes WHERE code = $1', [code]);

      res.json({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 86400
      });
    } catch (error) {
      console.error('Token error:', error);
      res.status(500).json({ error: 'server_error' });
    }
  });

  return router;
};
