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

    // Merktop FL client-acquisition: prospects discovered via Google Places
    await client.query(`
      CREATE TABLE IF NOT EXISTS prospects (
        id SERIAL PRIMARY KEY,
        place_id VARCHAR(255) UNIQUE NOT NULL,
        business_name VARCHAR(500) NOT NULL,
        niche VARCHAR(100),
        city VARCHAR(100),
        state VARCHAR(50) DEFAULT 'FL',
        formatted_address TEXT,
        phone VARCHAR(50),
        email VARCHAR(255),
        website VARCHAR(500),
        has_website BOOLEAN DEFAULT FALSE,
        google_types JSONB,
        status VARCHAR(50) DEFAULT 'new',
        do_not_contact BOOLEAN DEFAULT FALSE,
        last_contacted_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_prospects_niche ON prospects(niche);
      CREATE INDEX IF NOT EXISTS idx_prospects_city ON prospects(city);
      CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
      CREATE INDEX IF NOT EXISTS idx_prospects_has_website ON prospects(has_website);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS outreach_campaigns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        niche VARCHAR(100) NOT NULL,
        cities JSONB,
        template_id VARCHAR(100) NOT NULL,
        daily_cap INT DEFAULT 200,
        starts_at TIMESTAMP DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_status ON outreach_campaigns(status);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS outreach_emails (
        id SERIAL PRIMARY KEY,
        campaign_id INT REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
        prospect_id INT REFERENCES prospects(id) ON DELETE CASCADE,
        resend_email_id VARCHAR(255),
        subject VARCHAR(500),
        status VARCHAR(50) DEFAULT 'sent',
        sent_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_outreach_emails_campaign ON outreach_emails(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_outreach_emails_prospect ON outreach_emails(prospect_id);
      CREATE INDEX IF NOT EXISTS idx_outreach_emails_resend ON outreach_emails(resend_email_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_emails_campaign_prospect
        ON outreach_emails(campaign_id, prospect_id);
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
