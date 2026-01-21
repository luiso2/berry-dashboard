import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import cookieParser from 'cookie-parser';

// Configuration
import { config } from './config.js';

// ============================================
// EXPRESS APP SETUP
// ============================================
const app = express();
const PORT = config.server.port;

// Mock pool for testing (in-memory store)
const mockPool = {
  query: async (sql, params) => {
    // Simulate database responses
    if (sql.includes('SELECT 1')) {
      return { rows: [{ '?column?': 1 }] };
    }
    if (sql.includes('CREATE TABLE')) {
      return { rows: [] };
    }
    return { rows: [] };
  }
};

app.set('pool', mockPool);

// ============================================
// MIDDLEWARE
// ============================================

// CORS Configuration
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/api/v1/health', async (req, res) => {
  res.json({
    success: true,
    message: 'Server is healthy (TEST MODE)',
    version: config.apiVersion,
    mode: 'testing',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/version', (req, res) => {
  res.json({
    version: config.apiVersion,
    node_env: 'test',
    timestamp: new Date().toISOString()
  });
});

// Mock auth endpoints
app.post('/oauth/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }
  res.json({
    success: true,
    token: 'test_token_' + Math.random().toString(36).substring(7),
    user: { id: 1, email }
  });
});

app.post('/oauth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }
  res.json({
    success: true,
    token: 'test_token_' + Math.random().toString(36).substring(7),
    user: { id: 1, email }
  });
});

// Mock guests endpoints
app.get('/api/v1/guests', (req, res) => {
  res.json({
    success: true,
    guests: [],
    total: 0
  });
});

app.post('/api/v1/guests', (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Name and email required' });
  }
  res.json({
    success: true,
    guest: { id: 1, name, email, status: 'pending' }
  });
});

// ============================================
// ERROR HANDLING
// ============================================
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// ============================================
// SERVER STARTUP
// ============================================
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('✓ WebSocket client connected');
  ws.on('close', () => console.log('✓ WebSocket client disconnected'));
});

server.listen(PORT, () => {
  console.log(`\n✅ TEST SERVER RUNNING`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✓ Port: ${PORT}`);
  console.log(`✓ Version: ${config.apiVersion}`);
  console.log(`✓ Mode: TESTING (Mock responses)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

export { app };
