import { getPool } from './database.js';

let dbInitStatus = {
  started: false,
  completed: false,
  error: null,
  modelsFix: null
};

/**
 * Initialize database schema and tables
 * This is called once on server startup
 */
export const initializeDatabase = async () => {
  if (dbInitStatus.started) {
    console.log('Database initialization already in progress or completed');
    return dbInitStatus;
  }

  dbInitStatus.started = true;
  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log('Starting database initialization...');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    // Create auth_tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        user_email VARCHAR(255),
        token VARCHAR(255) UNIQUE NOT NULL,
        scope VARCHAR(255) DEFAULT 'read write',
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);
    `);

    // Create auth_codes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(255) UNIQUE NOT NULL,
        client_id INTEGER,
        redirect_uri TEXT,
        scope VARCHAR(255),
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_auth_codes_code ON auth_codes(code);
    `);

    // Create guests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS guests (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(100),
        category VARCHAR(10) DEFAULT 'C',
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_guests_category ON guests(category);
      CREATE INDEX IF NOT EXISTS idx_guests_status ON guests(status);
    `);

    // Create email_events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_events (
        id SERIAL PRIMARY KEY,
        email_id VARCHAR(255),
        guest_id INTEGER,
        event_type VARCHAR(50) NOT NULL,
        recipient_email VARCHAR(255),
        subject VARCHAR(500),
        timestamp TIMESTAMP,
        raw_payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_email_events_guest_id ON email_events(guest_id);
      CREATE INDEX IF NOT EXISTS idx_email_events_email_id ON email_events(email_id);
      CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type);
    `);

    console.log('Database tables initialized successfully');
    dbInitStatus.completed = true;

  } catch (error) {
    dbInitStatus.error = error.message;
    console.error('Error initializing database:', error);
  } finally {
    client.release();
  }

  return dbInitStatus;
};

export const getDbInitStatus = () => dbInitStatus;
