import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import cookieParser from 'cookie-parser';

// Configuration
import { config } from './config.js';

// Database
import { initializePool, closePool } from './utils/database.js';
import { initializeDatabase } from './utils/dbInit.js';

// Middleware
import { authenticateToken } from './middleware/auth.js';

// Modules
import { createAuthRoutes } from './modules/auth.js';
import { createGuestRoutes } from './modules/guests.js';

// ============================================
// EXPRESS APP SETUP
// ============================================
const app = express();
const PORT = config.server.port;

// Initialize database pool
const pool = initializePool();

// ============================================
// MIDDLEWARE
// ============================================

// CORS Configuration
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/api/v1/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1');
    res.json({
      success: true,
      message: 'Server is healthy',
      version: config.apiVersion,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server health check failed',
      error: error.message
    });
  }
});

app.get('/api/v1/version', (req, res) => {
  res.json({
    version: config.apiVersion,
    node_env: config.server.nodeEnv,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// ROUTE MODULES
// ============================================

// Authentication Routes
const authRoutes = createAuthRoutes(pool);
app.use(authRoutes);

// Guest Routes
const guestRoutes = createGuestRoutes(pool);
app.use('/api/v1/guests', guestRoutes);

// ============================================
// WEBSOCKET SETUP
// ============================================
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (data) => {
    console.log('Received:', data);
    // Broadcast to all clients
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(data);
      }
    });
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
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
    error: config.server.nodeEnv === 'development' ? err.message : undefined
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Not found'
  });
});

// ============================================
// SERVER STARTUP
// ============================================
const startServer = async () => {
  try {
    // Initialize database
    console.log('Initializing database...');
    await initializeDatabase();
    console.log('✓ Database initialized');

    // Start server
    server.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ API Version: ${config.apiVersion}`);
      console.log(`✓ Environment: ${config.server.nodeEnv}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  server.close(async () => {
    await closePool();
    console.log('✓ Server shut down');
    process.exit(0);
  });
});

// Start the server
startServer();

export { app, pool };
