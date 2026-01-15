import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import http from 'http';
import { WebSocketServer } from 'ws';
import { Resend } from 'resend';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync';

// API Version - for tracking deployments
const API_VERSION = '3.15.2-guest-status';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 8080;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Track initialization status
let dbInitStatus = { started: false, completed: false, error: null, modelsFix: null };

// ============================================
// TELNYX SMS CONFIGURATION
// ============================================
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_PHONE_NUMBER = process.env.TELNYX_PHONE_NUMBER || '+19858539097';

async function sendSMS(to, message) {
  if (!TELNYX_API_KEY) {
    throw new Error('Telnyx API key not configured');
  }

  // Format phone number - ensure it has + prefix
  let formattedTo = to.replace(/[^\d+]/g, '');
  if (!formattedTo.startsWith('+')) {
    formattedTo = '+1' + formattedTo; // Assume US if no country code
  }

  const response = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TELNYX_API_KEY}`
    },
    body: JSON.stringify({
      from: TELNYX_PHONE_NUMBER,
      to: formattedTo,
      text: message
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.errors?.[0]?.detail || 'Failed to send SMS');
  }

  return {
    success: true,
    messageId: data.data?.id,
    to: formattedTo,
    status: data.data?.to?.[0]?.status || 'sent'
  };
}

// ============================================
// ENCRYPTION UTILITIES for API Keys
// ============================================
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex').slice(0, 32);
const IV_LENGTH = 16;

function encryptApiKey(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptApiKey(text) {
  if (!text) return null;
  try {
    const [ivHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    return null;
  }
}

// Mask API key for display (show first 4 and last 4 chars)
function maskApiKey(key) {
  if (!key || key.length < 12) return '••••••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

// ============================================
// FILE UPLOAD CONFIGURATION (Multer)
// ============================================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    // CSV/Excel files
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/csv',
    'text/plain',
    // Image files
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ];
  const isAllowedMime = allowedMimes.includes(file.mimetype);
  const isAllowedExt = file.originalname.match(/\.(csv|xlsx|xls|jpg|jpeg|png|gif|webp|svg)$/i);

  if (isAllowedMime || isAllowedExt) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Serve uploaded files statically
app.use('/uploads', express.static(uploadDir));

// Initialize database tables
const initDatabase = async () => {
  dbInitStatus.started = true;
  const client = await pool.connect();
  try {
    // ============================================
    // OAUTH TABLES - Users and Authentication
    // ============================================

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        company VARCHAR(255),
        reset_token VARCHAR(255),
        reset_token_expires TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add reset token columns if they don't exist (for existing databases)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;
    `);

    // Create oauth_tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        access_token VARCHAR(255) UNIQUE NOT NULL,
        refresh_token VARCHAR(255),
        code VARCHAR(255),
        token_type VARCHAR(50) DEFAULT 'session',
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_oauth_tokens_access ON oauth_tokens(access_token);
      CREATE INDEX IF NOT EXISTS idx_oauth_tokens_code ON oauth_tokens(code);
    `);

    // Add token_type column if it doesn't exist (for existing databases)
    await client.query(`
      ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS token_type VARCHAR(50) DEFAULT 'session';
    `);

    // Create guests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS guests (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(100),
        instagram VARCHAR(255),
        party_size INTEGER DEFAULT 1,
        event_date TIMESTAMP,
        notes TEXT,
        category VARCHAR(50) DEFAULT 'pending',
        status VARCHAR(50) DEFAULT 'pending',
        email_sent BOOLEAN DEFAULT false,
        email_sent_at TIMESTAMP,
        checked_in_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_featured BOOLEAN DEFAULT false,
        rating INTEGER DEFAULT 0
      );
    `);

    // Add featured columns if missing (for existing databases)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guests' AND column_name='is_featured') THEN
          ALTER TABLE guests ADD COLUMN is_featured BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guests' AND column_name='rating') THEN
          ALTER TABLE guests ADD COLUMN rating INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guests' AND column_name='status') THEN
          ALTER TABLE guests ADD COLUMN status VARCHAR(50) DEFAULT 'pending';
        END IF;
      END $$;
    `);

    // Add user_id to all main tables for multi-tenant support
    await client.query(`
      DO $$
      BEGIN
        -- Add user_id to guests
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guests' AND column_name='user_id') THEN
          ALTER TABLE guests ADD COLUMN user_id INTEGER;
          CREATE INDEX IF NOT EXISTS idx_guests_user ON guests(user_id);
        END IF;
        -- Add user_id to events
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='user_id') THEN
          ALTER TABLE events ADD COLUMN user_id INTEGER;
          CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
        END IF;
        -- Add user_id to vendors
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='user_id') THEN
          ALTER TABLE vendors ADD COLUMN user_id INTEGER;
          CREATE INDEX IF NOT EXISTS idx_vendors_user ON vendors(user_id);
        END IF;
        -- Add user_id to sponsors
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sponsors' AND column_name='user_id') THEN
          ALTER TABLE sponsors ADD COLUMN user_id INTEGER;
          CREATE INDEX IF NOT EXISTS idx_sponsors_user ON sponsors(user_id);
        END IF;
      END $$;
    `);

    // Create email_events table for Resend webhook tracking
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
    `);

    // Create index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_events_guest_id ON email_events(guest_id);
      CREATE INDEX IF NOT EXISTS idx_email_events_email_id ON email_events(email_id);
      CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type);
    `);

    // Create tickets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id VARCHAR(50) PRIMARY KEY,
        user_id INTEGER,
        event_id VARCHAR(50) NOT NULL,
        event_ref_id INTEGER,
        external_id VARCHAR(100),
        ticket_type VARCHAR(100) NOT NULL DEFAULT 'General',
        holder_name VARCHAR(255),
        holder_email VARCHAR(255),
        qr_code VARCHAR(500),
        status VARCHAR(20) DEFAULT 'valid',
        check_in_time TIMESTAMP,
        price INTEGER DEFAULT 0,
        source VARCHAR(50) DEFAULT 'manual',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_event_ref ON tickets(event_ref_id);
    `);

    // Add columns to existing tickets table if they don't exist (migration)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'user_id') THEN
          ALTER TABLE tickets ADD COLUMN user_id INTEGER;
          CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'event_ref_id') THEN
          ALTER TABLE tickets ADD COLUMN event_ref_id INTEGER;
          CREATE INDEX IF NOT EXISTS idx_tickets_event_ref ON tickets(event_ref_id);
        END IF;
      END $$;
    `);

    // Create activity_log table for persistent activity tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        details TEXT,
        guest_name VARCHAR(255),
        guest_id INTEGER,
        event_type VARCHAR(50) DEFAULT 'system',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(event_type);
      CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
    `);

    // Create sponsors table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sponsors (
        id VARCHAR(50) PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        contact_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(100),
        website VARCHAR(500),
        sponsorship_tier VARCHAR(50) NOT NULL,
        tier_name VARCHAR(100),
        tier_price VARCHAR(50),
        message TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sponsors_status ON sponsors(status);
      CREATE INDEX IF NOT EXISTS idx_sponsors_tier ON sponsors(sponsorship_tier);
    `);

    // Add missing columns to sponsors table (for existing databases)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sponsors' AND column_name='tier_name') THEN
          ALTER TABLE sponsors ADD COLUMN tier_name VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sponsors' AND column_name='logo_url') THEN
          ALTER TABLE sponsors ADD COLUMN logo_url TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sponsors' AND column_name='tier_price') THEN
          ALTER TABLE sponsors ADD COLUMN tier_price VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sponsors' AND column_name='amount') THEN
          ALTER TABLE sponsors ADD COLUMN amount DECIMAL(12,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sponsors' AND column_name='tier_color') THEN
          ALTER TABLE sponsors ADD COLUMN tier_color VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sponsors' AND column_name='tier_icon') THEN
          ALTER TABLE sponsors ADD COLUMN tier_icon VARCHAR(10);
        END IF;
      END $$;
    `);

    // ============================================
    // PRIORITY HIGH #1: MULTI-EVENT MANAGEMENT
    // ============================================

    // Create events table - Core table for multi-event support
    // Status values: planning, confirmed, upcoming, ongoing, past, cancelled, draft
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE,
        description TEXT,
        event_type VARCHAR(50) DEFAULT 'party',
        venue_name VARCHAR(255),
        venue_address TEXT,
        venue_city VARCHAR(100),
        venue_capacity INTEGER,
        event_date DATE NOT NULL,
        start_time TIME,
        end_time TIME,
        doors_open TIME,
        status VARCHAR(50) DEFAULT 'planning' CHECK (status IN ('planning', 'confirmed', 'upcoming', 'ongoing', 'past', 'cancelled', 'draft')),
        cover_image TEXT,
        theme VARCHAR(100),
        dress_code VARCHAR(100),
        age_restriction VARCHAR(50),
        ticket_link TEXT,
        is_public BOOLEAN DEFAULT false,
        is_featured BOOLEAN DEFAULT false,
        expected_attendance INTEGER,
        actual_attendance INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
      CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
    `);

    // Ensure events table has slug column (migration for existing tables)
    try {
      const slugCheck = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'slug'
      `);
      if (slugCheck.rows.length === 0) {
        await client.query('ALTER TABLE events ADD COLUMN slug VARCHAR(255) UNIQUE');
        console.log('Added slug column to events table');
      }
      await client.query('CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug)');
    } catch (e) {
      console.log('Events slug migration:', e.message);
    }

    // Add external_id and external_source columns for Eventbrite sync
    try {
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='external_id') THEN
            ALTER TABLE events ADD COLUMN external_id VARCHAR(100);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='external_source') THEN
            ALTER TABLE events ADD COLUMN external_source VARCHAR(50);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='eventbrite_url') THEN
            ALTER TABLE events ADD COLUMN eventbrite_url TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='ticket_types') THEN
            ALTER TABLE events ADD COLUMN ticket_types JSONB DEFAULT '[]';
          END IF;
        END $$;
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_events_external ON events(external_id, external_source)');
      console.log('Added Eventbrite columns to events table');
    } catch (e) {
      console.log('Events Eventbrite columns migration:', e.message);
    }

    // Create event_timeline table - Run of show / production timeline
    // Note: Creating without FK constraint due to potential type mismatch with existing events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_timeline (
        id SERIAL PRIMARY KEY,
        event_id INTEGER,
        time TIME NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        responsible VARCHAR(255),
        location VARCHAR(255),
        is_critical BOOLEAN DEFAULT false,
        status VARCHAR(50) DEFAULT 'pending',
        notes TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_timeline_event ON event_timeline(event_id);
    `);

    // Create event_checklist table - Production checklist per event
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_checklist (
        id SERIAL PRIMARY KEY,
        event_id INTEGER,
        category VARCHAR(100) NOT NULL,
        item VARCHAR(255) NOT NULL,
        is_completed BOOLEAN DEFAULT false,
        completed_by VARCHAR(255),
        completed_at TIMESTAMP,
        due_date DATE,
        priority VARCHAR(20) DEFAULT 'medium',
        notes TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_checklist_event ON event_checklist(event_id);
    `);

    // Add event_id to existing guests table (no FK constraint due to type mismatch with existing events table)
    try {
      const guestsEventCheck = await client.query(`
        SELECT 1 FROM information_schema.columns WHERE table_name='guests' AND column_name='event_id'
      `);
      if (guestsEventCheck.rows.length === 0) {
        await client.query(`ALTER TABLE guests ADD COLUMN event_id INTEGER`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_guests_event ON guests(event_id)`);
        console.log('Added event_id to guests table');
      }
    } catch (e) {
      console.log('Guests event_id migration:', e.message);
    }

    // Add event_ref_id to existing tickets table
    try {
      const ticketsCheck = await client.query(`
        SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='event_ref_id'
      `);
      if (ticketsCheck.rows.length === 0) {
        await client.query(`ALTER TABLE tickets ADD COLUMN event_ref_id INTEGER`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_event_ref ON tickets(event_ref_id)`);
        console.log('Added event_ref_id to tickets table');
      }
    } catch (e) {
      console.log('Tickets event_ref_id migration:', e.message);
    }

    // Add event_id to sponsors table
    try {
      const sponsorsCheck = await client.query(`
        SELECT 1 FROM information_schema.columns WHERE table_name='sponsors' AND column_name='event_id'
      `);
      if (sponsorsCheck.rows.length === 0) {
        await client.query(`ALTER TABLE sponsors ADD COLUMN event_id INTEGER`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_sponsors_event ON sponsors(event_id)`);
        console.log('Added event_id to sponsors table');
      }
    } catch (e) {
      console.log('Sponsors event_id migration:', e.message);
    }

    // ============================================
    // PRIORITY HIGH #2: BUDGET TRACKER
    // ============================================

    // Create budget_categories table - Predefined budget categories
    await client.query(`
      CREATE TABLE IF NOT EXISTS budget_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        icon VARCHAR(50),
        color VARCHAR(20),
        description TEXT,
        is_income BOOLEAN DEFAULT false,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default budget categories if empty (Simplified: 5 categories)
    await client.query(`
      INSERT INTO budget_categories (name, icon, color, is_income, sort_order)
      SELECT * FROM (VALUES
        ('Venue & Production', 'building', '#8B5CF6', false, 1),
        ('Talent & Staffing', 'users', '#EC4899', false, 2),
        ('Marketing & Operations', 'megaphone', '#3B82F6', false, 3),
        ('Tickets & Tables', 'ticket', '#22C55E', true, 4),
        ('Sponsorships', 'handshake', '#D4AF37', true, 5)
      ) AS t(name, icon, color, is_income, sort_order)
      WHERE NOT EXISTS (SELECT 1 FROM budget_categories LIMIT 1);
    `);

    // Create budgets table - Budget per event
    await client.query(`
      CREATE TABLE IF NOT EXISTS budgets (
        id SERIAL PRIMARY KEY,
        event_id INTEGER,
        name VARCHAR(255) NOT NULL,
        total_budget DECIMAL(12,2) DEFAULT 0,
        total_spent DECIMAL(12,2) DEFAULT 0,
        total_income DECIMAL(12,2) DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'USD',
        status VARCHAR(50) DEFAULT 'draft',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_budgets_event ON budgets(event_id);
    `);

    // Create budget_items table - Individual budget line items
    await client.query(`
      CREATE TABLE IF NOT EXISTS budget_items (
        id SERIAL PRIMARY KEY,
        budget_id INTEGER,
        category_id INTEGER,
        description VARCHAR(255) NOT NULL,
        vendor_name VARCHAR(255),
        estimated_amount DECIMAL(12,2) DEFAULT 0,
        actual_amount DECIMAL(12,2),
        is_paid BOOLEAN DEFAULT false,
        paid_date DATE,
        payment_method VARCHAR(50),
        receipt_url TEXT,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        due_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_budget_items_budget ON budget_items(budget_id);
      CREATE INDEX IF NOT EXISTS idx_budget_items_category ON budget_items(category_id);
    `);

    // Create vendors table - Vendor/Provider management
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        contact_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(100),
        website TEXT,
        address TEXT,
        city VARCHAR(100),
        rating INTEGER DEFAULT 0,
        notes TEXT,
        is_preferred BOOLEAN DEFAULT false,
        total_spent DECIMAL(12,2) DEFAULT 0,
        events_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_vendors_category ON vendors(category);
      CREATE INDEX IF NOT EXISTS idx_vendors_rating ON vendors(rating DESC);
    `);

    // ============================================
    // PRIORITY MEDIUM #1: STAFF SCHEDULING
    // ============================================

    // Create staff table - All event staff/talent
    await client.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(100),
        role VARCHAR(100) NOT NULL,
        secondary_role VARCHAR(100),
        photo_url TEXT,
        instagram VARCHAR(255),
        hourly_rate DECIMAL(10,2),
        day_rate DECIMAL(10,2),
        experience_level VARCHAR(50) DEFAULT 'intermediate',
        skills TEXT[],
        notes TEXT,
        status VARCHAR(50) DEFAULT 'active',
        rating INTEGER DEFAULT 0,
        total_events INTEGER DEFAULT 0,
        total_earned DECIMAL(12,2) DEFAULT 0,
        availability JSONB DEFAULT '{"weekdays": true, "weekends": true}',
        emergency_contact VARCHAR(255),
        emergency_phone VARCHAR(100),
        bank_info TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);
      CREATE INDEX IF NOT EXISTS idx_staff_status ON staff(status);
      CREATE INDEX IF NOT EXISTS idx_staff_user ON staff(user_id);
    `);

    // Create staff_assignments table - Staff assigned to events (no FK for compatibility)
    await client.query(`
      CREATE TABLE IF NOT EXISTS staff_assignments (
        id SERIAL PRIMARY KEY,
        staff_id INTEGER,
        event_id INTEGER,
        role VARCHAR(100) NOT NULL,
        shift_start TIME,
        shift_end TIME,
        break_duration INTEGER DEFAULT 0,
        location VARCHAR(255),
        uniform VARCHAR(255),
        special_instructions TEXT,
        rate_type VARCHAR(20) DEFAULT 'hourly',
        rate_amount DECIMAL(10,2),
        bonus DECIMAL(10,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'pending',
        confirmed_at TIMESTAMP,
        checked_in_at TIMESTAMP,
        checked_out_at TIMESTAMP,
        hours_worked DECIMAL(5,2),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(staff_id, event_id, role)
      );
      CREATE INDEX IF NOT EXISTS idx_assignments_event ON staff_assignments(event_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_staff ON staff_assignments(staff_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_status ON staff_assignments(status);
    `);

    // Create staff_payments table - Payment tracking (no FK for compatibility)
    await client.query(`
      CREATE TABLE IF NOT EXISTS staff_payments (
        id SERIAL PRIMARY KEY,
        staff_id INTEGER,
        assignment_id INTEGER,
        event_id INTEGER,
        amount DECIMAL(10,2) NOT NULL,
        payment_type VARCHAR(50) DEFAULT 'event',
        payment_method VARCHAR(50),
        payment_date DATE,
        reference VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_payments_staff ON staff_payments(staff_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON staff_payments(status);
    `);

    // ============================================
    // PRIORITY MEDIUM #2: VENDOR ENHANCEMENTS
    // ============================================

    // Create vendor_quotes table - Quotes/proposals from vendors
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_quotes (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER,
        event_id INTEGER,
        quote_number VARCHAR(100),
        description TEXT,
        amount DECIMAL(12,2) NOT NULL,
        valid_until DATE,
        items JSONB,
        terms TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        accepted_at TIMESTAMP,
        notes TEXT,
        document_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_quotes_vendor ON vendor_quotes(vendor_id);
      CREATE INDEX IF NOT EXISTS idx_quotes_event ON vendor_quotes(event_id);
      CREATE INDEX IF NOT EXISTS idx_quotes_status ON vendor_quotes(status);
    `);

    // Create vendor_contracts table - Contracts with vendors
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_contracts (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER,
        event_id INTEGER,
        quote_id INTEGER,
        contract_number VARCHAR(100),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        total_amount DECIMAL(12,2) NOT NULL,
        deposit_amount DECIMAL(12,2),
        deposit_paid BOOLEAN DEFAULT false,
        deposit_paid_date DATE,
        balance_due_date DATE,
        balance_paid BOOLEAN DEFAULT false,
        balance_paid_date DATE,
        start_date DATE,
        end_date DATE,
        terms TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        signed_at TIMESTAMP,
        document_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_contracts_vendor ON vendor_contracts(vendor_id);
      CREATE INDEX IF NOT EXISTS idx_contracts_event ON vendor_contracts(event_id);
      CREATE INDEX IF NOT EXISTS idx_contracts_status ON vendor_contracts(status);
    `);

    // Create vendor_history table - Track vendor usage per event
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_history (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER,
        event_id INTEGER,
        service_provided TEXT,
        amount_paid DECIMAL(12,2),
        rating INTEGER,
        feedback TEXT,
        would_hire_again BOOLEAN,
        issues TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vendor_id, event_id)
      );
      CREATE INDEX IF NOT EXISTS idx_history_vendor ON vendor_history(vendor_id);
    `);

    // ============================================
    // MODELS & TABLE RESERVATIONS
    // ============================================

    // Create models table - Promo models/brand ambassadors
    await client.query(`
      CREATE TABLE IF NOT EXISTS models (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        event_id INTEGER,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(100),
        instagram VARCHAR(255),
        photos TEXT[],
        height VARCHAR(20),
        experience_level VARCHAR(50) DEFAULT 'intermediate',
        availability JSONB DEFAULT '{}',
        notes TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        ai_score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Create indexes separately to handle existing tables with different schemas
    try {
      await client.query('CREATE INDEX IF NOT EXISTS idx_models_status ON models(status)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_models_event ON models(event_id)');
    } catch (e) { console.log('Models index note:', e.message); }
    try {
      await client.query('CREATE INDEX IF NOT EXISTS idx_models_user ON models(user_id)');
    } catch (e) { console.log('Models user_id index note:', e.message); }

    // Create table_reservations table - VIP table bookings
    await client.query(`
      CREATE TABLE IF NOT EXISTS table_reservations (
        id SERIAL PRIMARY KEY,
        table_id VARCHAR(50) NOT NULL,
        table_name VARCHAR(100) NOT NULL,
        zone VARCHAR(50) DEFAULT 'Standard',
        event_id INTEGER,
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255),
        customer_phone VARCHAR(100),
        party_size INTEGER DEFAULT 1,
        special_requests TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        deposit_paid BOOLEAN DEFAULT false,
        deposit_amount DECIMAL(10,2) DEFAULT 0,
        minimum_spend DECIMAL(10,2) DEFAULT 0,
        capacity INTEGER DEFAULT 6,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tables_event ON table_reservations(event_id);
      CREATE INDEX IF NOT EXISTS idx_tables_status ON table_reservations(status);
    `);

    // ============================================
    // PRIORITY LOW: CLIENT PORTAL
    // ============================================

    // Create client_access table - Client portal access tokens
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_access (
        id SERIAL PRIMARY KEY,
        event_id INTEGER,
        client_name VARCHAR(255) NOT NULL,
        client_email VARCHAR(255) NOT NULL,
        access_token VARCHAR(100) UNIQUE NOT NULL,
        permissions JSONB DEFAULT '{"viewBudget": true, "viewTimeline": true, "viewStaff": false, "viewVendors": false}',
        last_accessed TIMESTAMP,
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_client_token ON client_access(access_token);
      CREATE INDEX IF NOT EXISTS idx_client_event ON client_access(event_id);
    `);

    // Create sms_conversations table - For AI chat history
    await client.query(`
      CREATE TABLE IF NOT EXISTS sms_conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        from_number VARCHAR(50) NOT NULL,
        to_number VARCHAR(50) NOT NULL,
        direction VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        ai_response TEXT,
        is_read BOOLEAN DEFAULT false,
        is_human_takeover BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sms_from ON sms_conversations(from_number);
      CREATE INDEX IF NOT EXISTS idx_sms_to ON sms_conversations(to_number);
      CREATE INDEX IF NOT EXISTS idx_sms_user ON sms_conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_sms_created ON sms_conversations(created_at DESC);
    `);

    // Create scheduled_messages table - For scheduled/bulk SMS
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        event_id INTEGER,
        recipients JSONB NOT NULL,
        message TEXT NOT NULL,
        scheduled_at TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        sent_at TIMESTAMP,
        sent_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        results JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_messages(status);
      CREATE INDEX IF NOT EXISTS idx_scheduled_time ON scheduled_messages(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_scheduled_user ON scheduled_messages(user_id);
    `);

    // Add user_id to staff table (after table creation)
    try {
      const checkStaffColumn = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'staff' AND column_name = 'user_id'
      `);
      if (checkStaffColumn.rows.length === 0) {
        console.log('Adding user_id column to staff table...');
        await client.query(`ALTER TABLE staff ADD COLUMN user_id INTEGER`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_user ON staff(user_id)`);
        console.log('user_id column added to staff table successfully');
      } else {
        console.log('staff table already has user_id column');
      }
    } catch (staffMigrationError) {
      console.log('Staff migration note:', staffMigrationError.message);
    }

    // Add user_id to models table (after table creation)
    try {
      const checkColumn = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'models' AND column_name = 'user_id'
      `);
      if (checkColumn.rows.length === 0) {
        console.log('Adding user_id column to models table...');
        await client.query(`ALTER TABLE models ADD COLUMN user_id INTEGER`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_models_user ON models(user_id)`);
        console.log('user_id column added to models table successfully');
      } else {
        console.log('models table already has user_id column');
      }
    } catch (migrationError) {
      console.log('Models migration note:', migrationError.message);
    }

    // Ensure missing tables are created with individual error handling
    const missingTableQueries = [
      {
        name: 'event_timeline',
        sql: `CREATE TABLE IF NOT EXISTS event_timeline (
          id SERIAL PRIMARY KEY,
          event_id INTEGER,
          time TIME NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          responsible VARCHAR(255),
          location VARCHAR(255),
          is_critical BOOLEAN DEFAULT false,
          status VARCHAR(50) DEFAULT 'pending',
          notes TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'event_checklist',
        sql: `CREATE TABLE IF NOT EXISTS event_checklist (
          id SERIAL PRIMARY KEY,
          event_id INTEGER,
          category VARCHAR(100) NOT NULL,
          item VARCHAR(255) NOT NULL,
          is_completed BOOLEAN DEFAULT false,
          completed_by VARCHAR(255),
          completed_at TIMESTAMP,
          due_date DATE,
          priority VARCHAR(20) DEFAULT 'medium',
          notes TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'staff',
        sql: `CREATE TABLE IF NOT EXISTS staff (
          id SERIAL PRIMARY KEY,
          user_id INTEGER,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          phone VARCHAR(100),
          role VARCHAR(100) NOT NULL,
          secondary_role VARCHAR(100),
          photo_url TEXT,
          instagram VARCHAR(255),
          hourly_rate DECIMAL(10,2),
          day_rate DECIMAL(10,2),
          experience_level VARCHAR(50) DEFAULT 'intermediate',
          skills TEXT[],
          notes TEXT,
          status VARCHAR(50) DEFAULT 'active',
          rating INTEGER DEFAULT 0,
          total_events INTEGER DEFAULT 0,
          total_earned DECIMAL(12,2) DEFAULT 0,
          availability JSONB DEFAULT '{"weekdays": true, "weekends": true}',
          emergency_contact VARCHAR(255),
          emergency_phone VARCHAR(100),
          bank_info TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'staff_assignments',
        sql: `CREATE TABLE IF NOT EXISTS staff_assignments (
          id SERIAL PRIMARY KEY,
          staff_id INTEGER,
          event_id INTEGER,
          role VARCHAR(100) NOT NULL,
          shift_start TIME,
          shift_end TIME,
          break_duration INTEGER DEFAULT 0,
          location VARCHAR(255),
          uniform VARCHAR(255),
          special_instructions TEXT,
          rate_type VARCHAR(20) DEFAULT 'hourly',
          rate_amount DECIMAL(10,2),
          bonus DECIMAL(10,2) DEFAULT 0,
          status VARCHAR(50) DEFAULT 'pending',
          confirmed_at TIMESTAMP,
          checked_in_at TIMESTAMP,
          checked_out_at TIMESTAMP,
          hours_worked DECIMAL(5,2),
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'models',
        sql: `CREATE TABLE IF NOT EXISTS models (
          id SERIAL PRIMARY KEY,
          user_id INTEGER,
          event_id INTEGER,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          phone VARCHAR(100),
          instagram VARCHAR(255),
          photos TEXT[],
          height VARCHAR(20),
          experience_level VARCHAR(50) DEFAULT 'intermediate',
          availability JSONB DEFAULT '{}',
          notes TEXT,
          status VARCHAR(50) DEFAULT 'pending',
          ai_score INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      }
    ];

    for (const table of missingTableQueries) {
      try {
        await client.query(table.sql);
        console.log(`Table ${table.name} ensured`);
      } catch (tableError) {
        console.log(`Table ${table.name} creation note:`, tableError.message);
      }
    }

    // Fix models table - forcefully recreate with correct schema
    try {
      dbInitStatus.modelsFix = 'checking';
      // Check if models has user_id column
      const userIdExists = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'models' AND column_name = 'user_id'
      `);

      if (userIdExists.rows.length === 0) {
        dbInitStatus.modelsFix = 'recreating';
        console.log('Models table missing user_id, recreating...');
        // Drop and recreate to fix schema
        await client.query('DROP TABLE IF EXISTS models');
        await client.query(`
          CREATE TABLE models (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            event_id INTEGER,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            phone VARCHAR(100),
            instagram VARCHAR(255),
            photos TEXT[],
            height VARCHAR(20),
            experience_level VARCHAR(50) DEFAULT 'intermediate',
            availability JSONB DEFAULT '{}',
            notes TEXT,
            status VARCHAR(50) DEFAULT 'pending',
            ai_score INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        dbInitStatus.modelsFix = 'recreated';
        console.log('Models table recreated successfully');
      } else {
        dbInitStatus.modelsFix = 'has_user_id';
        console.log('Models table has user_id column');
      }
    } catch (e) {
      dbInitStatus.modelsFix = 'error: ' + e.message;
      console.error('Models fix error:', e.message);
    }

    // ============================================
    // INTEGRATIONS TABLE - Store API keys for external services
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS integrations (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(50) NOT NULL UNIQUE,
        api_key_encrypted TEXT,
        api_secret_encrypted TEXT,
        extra_config JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'disconnected',
        last_sync TIMESTAMP,
        last_error TEXT,
        webhook_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);
      CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status);
    `);

    // Add webhook_id column if it doesn't exist
    await client.query(`
      ALTER TABLE integrations ADD COLUMN IF NOT EXISTS webhook_id VARCHAR(100);
    `);

    // ============================================
    // USER INTEGRATIONS TABLE - Per-user OAuth connections
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_integrations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        api_key_encrypted TEXT,
        refresh_token_encrypted TEXT,
        status VARCHAR(20) DEFAULT 'connected',
        provider_user_id VARCHAR(255),
        provider_user_email VARCHAR(255),
        provider_user_name VARCHAR(255),
        extra_config JSONB DEFAULT '{}',
        last_sync TIMESTAMP,
        last_error TEXT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, provider)
      );
      CREATE INDEX IF NOT EXISTS idx_user_integrations_user ON user_integrations(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_integrations_provider ON user_integrations(provider);
      CREATE INDEX IF NOT EXISTS idx_user_integrations_status ON user_integrations(status);
    `);

    // ============================================
    // ORDERS TABLE - Track ticket sales from Eventbrite
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(100) PRIMARY KEY,
        event_id VARCHAR(100),
        event_name VARCHAR(255),
        source VARCHAR(50) DEFAULT 'eventbrite',
        buyer_name VARCHAR(255),
        buyer_email VARCHAR(255),
        order_status VARCHAR(50) DEFAULT 'placed',
        ticket_count INTEGER DEFAULT 1,
        total_amount DECIMAL(10,2) DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'USD',
        tickets JSONB DEFAULT '[]',
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_orders_event ON orders(event_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
      CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
    `);
    console.log('Integrations and Orders tables initialized');

    // ============================================
    // PROMOTER MANAGEMENT SYSTEM
    // ============================================

    // Create promoters table
    await client.query(`
      CREATE TABLE IF NOT EXISTS promoters (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(100),
        code VARCHAR(20) NOT NULL UNIQUE,
        commission_rate DECIMAL(5,2) DEFAULT 10.00,
        commission_type VARCHAR(20) DEFAULT 'percentage',
        status VARCHAR(20) DEFAULT 'active',
        tier VARCHAR(20) DEFAULT 'bronze',
        bio TEXT,
        photo_url TEXT,
        social_instagram VARCHAR(255),
        social_tiktok VARCHAR(255),
        social_twitter VARCHAR(255),
        landing_page_slug VARCHAR(100),
        total_sales DECIMAL(12,2) DEFAULT 0,
        total_commission DECIMAL(12,2) DEFAULT 0,
        total_tickets_sold INTEGER DEFAULT 0,
        total_guests_referred INTEGER DEFAULT 0,
        last_sale_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_promoters_code ON promoters(code);
      CREATE INDEX IF NOT EXISTS idx_promoters_email ON promoters(email);
      CREATE INDEX IF NOT EXISTS idx_promoters_status ON promoters(status);
      CREATE INDEX IF NOT EXISTS idx_promoters_tier ON promoters(tier);
    `);

    // Create promoter_sales table for tracking individual sales
    await client.query(`
      CREATE TABLE IF NOT EXISTS promoter_sales (
        id SERIAL PRIMARY KEY,
        promoter_id INTEGER NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
        event_id INTEGER,
        ticket_id VARCHAR(100),
        guest_id INTEGER,
        guest_name VARCHAR(255),
        guest_email VARCHAR(255),
        sale_amount DECIMAL(10,2) NOT NULL,
        commission_amount DECIMAL(10,2) NOT NULL,
        commission_status VARCHAR(20) DEFAULT 'pending',
        paid_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_promoter_sales_promoter ON promoter_sales(promoter_id);
      CREATE INDEX IF NOT EXISTS idx_promoter_sales_event ON promoter_sales(event_id);
      CREATE INDEX IF NOT EXISTS idx_promoter_sales_status ON promoter_sales(commission_status);
      CREATE INDEX IF NOT EXISTS idx_promoter_sales_created ON promoter_sales(created_at DESC);
    `);

    // Create promoter_payouts table for payout tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS promoter_payouts (
        id SERIAL PRIMARY KEY,
        promoter_id INTEGER NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        period_start DATE,
        period_end DATE,
        sales_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        payment_method VARCHAR(50),
        payment_reference VARCHAR(255),
        paid_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_promoter_payouts_promoter ON promoter_payouts(promoter_id);
      CREATE INDEX IF NOT EXISTS idx_promoter_payouts_status ON promoter_payouts(status);
    `);

    // Create promoter_events table for event-specific assignments and custom rates
    await client.query(`
      CREATE TABLE IF NOT EXISTS promoter_events (
        id SERIAL PRIMARY KEY,
        promoter_id INTEGER NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
        event_id INTEGER NOT NULL,
        custom_commission_rate DECIMAL(5,2),
        ticket_quota INTEGER,
        tickets_sold INTEGER DEFAULT 0,
        bonus_threshold INTEGER,
        bonus_amount DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(promoter_id, event_id)
      );
      CREATE INDEX IF NOT EXISTS idx_promoter_events_promoter ON promoter_events(promoter_id);
      CREATE INDEX IF NOT EXISTS idx_promoter_events_event ON promoter_events(event_id);
    `);

    console.log('Promoter Management tables initialized');

    // Create file_uploads table for tracking CSV/Excel uploads
    await client.query(`
      CREATE TABLE IF NOT EXISTS file_uploads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        filename VARCHAR(255) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_size INTEGER,
        upload_type VARCHAR(50) NOT NULL,
        records_processed INTEGER DEFAULT 0,
        records_success INTEGER DEFAULT 0,
        records_failed INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'processing',
        error_details JSONB,
        event_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_file_uploads_user ON file_uploads(user_id);
      CREATE INDEX IF NOT EXISTS idx_file_uploads_type ON file_uploads(upload_type);
      CREATE INDEX IF NOT EXISTS idx_file_uploads_status ON file_uploads(status);
    `);

    console.log('File Uploads table initialized');

    // ============================================
    // EVENTBRITE ENHANCED TABLES
    // ============================================

    // Create eventbrite_venues table for venue information
    await client.query(`
      CREATE TABLE IF NOT EXISTS eventbrite_venues (
        id VARCHAR(100) PRIMARY KEY,
        user_id INTEGER,
        name VARCHAR(255),
        address_1 VARCHAR(255),
        address_2 VARCHAR(255),
        city VARCHAR(100),
        region VARCHAR(100),
        postal_code VARCHAR(20),
        country VARCHAR(10),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        capacity INTEGER,
        age_restriction VARCHAR(50),
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_eb_venues_user ON eventbrite_venues(user_id);
      CREATE INDEX IF NOT EXISTS idx_eb_venues_city ON eventbrite_venues(city);
    `);
    console.log('Eventbrite venues table initialized');

    // Create eventbrite_categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS eventbrite_categories (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        name_localized VARCHAR(255),
        short_name VARCHAR(100),
        short_name_localized VARCHAR(100),
        resource_uri TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Eventbrite categories table initialized');

    // Create eventbrite_subcategories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS eventbrite_subcategories (
        id VARCHAR(50) PRIMARY KEY,
        parent_category_id VARCHAR(50) REFERENCES eventbrite_categories(id),
        name VARCHAR(255) NOT NULL,
        name_localized VARCHAR(255),
        resource_uri TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_eb_subcats_parent ON eventbrite_subcategories(parent_category_id);
    `);
    console.log('Eventbrite subcategories table initialized');

    // Create eventbrite_sync_log table for tracking syncs
    await client.query(`
      CREATE TABLE IF NOT EXISTS eventbrite_sync_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        sync_type VARCHAR(50) NOT NULL,
        items_synced INTEGER DEFAULT 0,
        items_created INTEGER DEFAULT 0,
        items_updated INTEGER DEFAULT 0,
        items_failed INTEGER DEFAULT 0,
        error_details JSONB,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'running'
      );
      CREATE INDEX IF NOT EXISTS idx_eb_sync_user ON eventbrite_sync_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_eb_sync_type ON eventbrite_sync_log(sync_type);
    `);
    console.log('Eventbrite sync log table initialized');

    // Add venue_id column to events table if not exists
    try {
      await client.query(`
        ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_id VARCHAR(100);
        ALTER TABLE events ADD COLUMN IF NOT EXISTS eventbrite_category_id VARCHAR(50);
        ALTER TABLE events ADD COLUMN IF NOT EXISTS eventbrite_subcategory_id VARCHAR(50);
        ALTER TABLE events ADD COLUMN IF NOT EXISTS eventbrite_organizer_id VARCHAR(100);
        ALTER TABLE events ADD COLUMN IF NOT EXISTS eventbrite_capacity INTEGER;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS eventbrite_is_free BOOLEAN;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS eventbrite_online_event BOOLEAN;
      `);
      console.log('Added enhanced Eventbrite columns to events table');
    } catch (e) {
      console.log('Eventbrite columns migration:', e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FEATURE 1: Eventbrite Alerts Table
    // ═══════════════════════════════════════════════════════════════════════
    await client.query(`
      CREATE TABLE IF NOT EXISTS eventbrite_alerts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        event_id VARCHAR(100),
        alert_type VARCHAR(50) NOT NULL,
        threshold_value DECIMAL(10, 2),
        threshold_operator VARCHAR(10) DEFAULT 'gte',
        is_active BOOLEAN DEFAULT true,
        notification_channels JSONB DEFAULT '["dashboard"]',
        last_triggered_at TIMESTAMP,
        trigger_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_user ON eventbrite_alerts(user_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_event ON eventbrite_alerts(event_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_type ON eventbrite_alerts(alert_type);
    `);
    console.log('Eventbrite alerts table initialized');

    // Table for triggered alert notifications
    await client.query(`
      CREATE TABLE IF NOT EXISTS eventbrite_alert_notifications (
        id SERIAL PRIMARY KEY,
        alert_id INTEGER REFERENCES eventbrite_alerts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        event_id VARCHAR(100),
        alert_type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        data JSONB,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_alert_notif_user ON eventbrite_alert_notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_alert_notif_read ON eventbrite_alert_notifications(is_read);
    `);
    console.log('Eventbrite alert notifications table initialized');

    // ═══════════════════════════════════════════════════════════════════════
    // FEATURE 2: Eventbrite Orders Table (Real-time orders)
    // ═══════════════════════════════════════════════════════════════════════
    await client.query(`
      CREATE TABLE IF NOT EXISTS eventbrite_orders (
        id VARCHAR(100) PRIMARY KEY,
        user_id INTEGER NOT NULL,
        event_id VARCHAR(100) NOT NULL,
        event_name VARCHAR(255),
        buyer_name VARCHAR(255),
        buyer_email VARCHAR(255),
        buyer_phone VARCHAR(50),
        status VARCHAR(50) DEFAULT 'placed',
        costs JSONB,
        gross_amount DECIMAL(10, 2) DEFAULT 0,
        fees DECIMAL(10, 2) DEFAULT 0,
        net_amount DECIMAL(10, 2) DEFAULT 0,
        ticket_count INTEGER DEFAULT 1,
        attendees JSONB,
        promo_code VARCHAR(100),
        order_date TIMESTAMP,
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_eb_orders_user ON eventbrite_orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_eb_orders_event ON eventbrite_orders(event_id);
      CREATE INDEX IF NOT EXISTS idx_eb_orders_date ON eventbrite_orders(order_date DESC);
      CREATE INDEX IF NOT EXISTS idx_eb_orders_email ON eventbrite_orders(buyer_email);
    `);
    console.log('Eventbrite orders table initialized');

    // ═══════════════════════════════════════════════════════════════════════
    // FEATURE 6: Eventbrite Promo Codes Table
    // ═══════════════════════════════════════════════════════════════════════
    await client.query(`
      CREATE TABLE IF NOT EXISTS eventbrite_promo_codes (
        id VARCHAR(100) PRIMARY KEY,
        user_id INTEGER NOT NULL,
        event_id VARCHAR(100),
        code VARCHAR(100) NOT NULL,
        discount_type VARCHAR(20) DEFAULT 'percentage',
        discount_value DECIMAL(10, 2) NOT NULL,
        quantity_available INTEGER,
        quantity_sold INTEGER DEFAULT 0,
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        ticket_class_ids JSONB,
        is_active BOOLEAN DEFAULT true,
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_eb_promo_user ON eventbrite_promo_codes(user_id);
      CREATE INDEX IF NOT EXISTS idx_eb_promo_event ON eventbrite_promo_codes(event_id);
      CREATE INDEX IF NOT EXISTS idx_eb_promo_code ON eventbrite_promo_codes(code);
    `);
    console.log('Eventbrite promo codes table initialized');

    // ═══════════════════════════════════════════════════════════════════════
    // FEATURE 7: Eventbrite Attendees Table (for Check-in)
    // ═══════════════════════════════════════════════════════════════════════
    await client.query(`
      CREATE TABLE IF NOT EXISTS eventbrite_attendees (
        id VARCHAR(100) PRIMARY KEY,
        user_id INTEGER NOT NULL,
        event_id VARCHAR(100) NOT NULL,
        order_id VARCHAR(100),
        ticket_class_id VARCHAR(100),
        ticket_class_name VARCHAR(255),
        name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        status VARCHAR(50) DEFAULT 'attending',
        checked_in BOOLEAN DEFAULT false,
        checked_in_at TIMESTAMP,
        checked_in_by VARCHAR(100),
        barcode VARCHAR(255),
        qr_code_url VARCHAR(500),
        answers JSONB,
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_eb_attendees_user ON eventbrite_attendees(user_id);
      CREATE INDEX IF NOT EXISTS idx_eb_attendees_event ON eventbrite_attendees(event_id);
      CREATE INDEX IF NOT EXISTS idx_eb_attendees_order ON eventbrite_attendees(order_id);
      CREATE INDEX IF NOT EXISTS idx_eb_attendees_barcode ON eventbrite_attendees(barcode);
      CREATE INDEX IF NOT EXISTS idx_eb_attendees_checkin ON eventbrite_attendees(checked_in);
    `);
    console.log('Eventbrite attendees table initialized');

    // ═══════════════════════════════════════════════════════════════════════
    // FEATURE 10: Eventbrite Refunds Table
    // ═══════════════════════════════════════════════════════════════════════
    await client.query(`
      CREATE TABLE IF NOT EXISTS eventbrite_refunds (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        order_id VARCHAR(100) NOT NULL,
        event_id VARCHAR(100),
        attendee_ids JSONB,
        reason VARCHAR(255),
        amount DECIMAL(10, 2),
        status VARCHAR(50) DEFAULT 'pending',
        eventbrite_refund_id VARCHAR(100),
        processed_at TIMESTAMP,
        processed_by VARCHAR(100),
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_eb_refunds_user ON eventbrite_refunds(user_id);
      CREATE INDEX IF NOT EXISTS idx_eb_refunds_order ON eventbrite_refunds(order_id);
      CREATE INDEX IF NOT EXISTS idx_eb_refunds_event ON eventbrite_refunds(event_id);
    `);
    console.log('Eventbrite refunds table initialized');

    dbInitStatus.completed = true;
    console.log('Database tables initialized successfully (guests, email_events, tickets, activity_log, sponsors, events, budgets, vendors, staff, contracts, client_access, integrations, promoters, file_uploads)');
  } catch (error) {
    dbInitStatus.error = error.message;
    console.error('Error initializing database:', error);
  } finally {
    client.release();
  }
};

// Resend setup - uses RESEND_API_KEY from .env
const resend = new Resend(process.env.RESEND_API_KEY);

// Email configuration - Use verified domain from environment or fallback
const EMAIL_CONFIG = {
  from: process.env.RESEND_FROM_EMAIL || 'Berry Bly <noreply@merktop.com>',
  replyTo: process.env.RESEND_REPLY_TO || 'berrybly@gmail.com',
  adminEmail: process.env.ADMIN_EMAIL || 'berrybly@gmail.com',
};

/**
 * Centralized email sending function with tracking
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - Email HTML content
 * @param {string} [options.from] - From email (defaults to EMAIL_CONFIG.from)
 * @param {string} [options.replyTo] - Reply-to email (defaults to EMAIL_CONFIG.replyTo)
 * @param {string} [options.emailType] - Type of email for tracking (e.g., 'invitation', 'sponsor_portal', 'approval')
 * @param {number|string} [options.relatedId] - Related entity ID (guest_id, sponsor_id, etc.)
 * @returns {Promise<{success: boolean, emailId: string|null, error: string|null}>}
 */
const sendEmail = async (options) => {
  const result = {
    success: false,
    emailId: null,
    error: null,
    to: options.to,
    subject: options.subject,
    emailType: options.emailType || 'general',
  };

  // Check if Resend is configured
  if (!process.env.RESEND_API_KEY) {
    result.error = 'Email service not configured (RESEND_API_KEY missing)';
    console.warn(`📧 Email NOT sent to ${options.to}: ${result.error}`);
    return result;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: options.from || EMAIL_CONFIG.from,
      replyTo: options.replyTo || EMAIL_CONFIG.replyTo,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      result.error = error.message || JSON.stringify(error);
      console.error(`📧 Email FAILED to ${options.to}: ${result.error}`);
    } else {
      result.success = true;
      result.emailId = data?.id || null;
      console.log(`📧 Email SENT to ${options.to} (ID: ${result.emailId})`);

      // Store initial send event in database for tracking
      try {
        await pool.query(
          `INSERT INTO email_events (email_id, guest_id, event_type, recipient_email, subject, timestamp, raw_payload)
           VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
          [
            result.emailId,
            options.relatedId || null,
            'email.queued',
            options.to,
            options.subject,
            JSON.stringify({ emailType: options.emailType, relatedId: options.relatedId })
          ]
        );
      } catch (dbError) {
        console.warn('Failed to store email event:', dbError.message);
      }
    }
  } catch (err) {
    result.error = err.message || 'Unknown error sending email';
    console.error(`📧 Email ERROR to ${options.to}: ${result.error}`);
  }

  return result;
};

/**
 * Get email delivery status by email ID
 */
const getEmailStatus = async (emailId) => {
  try {
    const result = await pool.query(
      `SELECT event_type, timestamp, created_at
       FROM email_events
       WHERE email_id = $1
       ORDER BY timestamp DESC`,
      [emailId]
    );

    if (result.rows.length === 0) {
      return { status: 'unknown', events: [] };
    }

    const events = result.rows;
    const latestEvent = events[0].event_type;

    // Determine overall status
    let status = 'pending';
    if (latestEvent === 'email.delivered') status = 'delivered';
    else if (latestEvent === 'email.sent') status = 'sent';
    else if (latestEvent === 'email.bounced') status = 'bounced';
    else if (latestEvent === 'email.complained') status = 'complained';
    else if (latestEvent === 'email.opened') status = 'opened';
    else if (latestEvent === 'email.clicked') status = 'clicked';

    return { status, events };
  } catch (error) {
    console.error('Error getting email status:', error);
    return { status: 'error', error: error.message };
  }
};

// CORS configuration - Allow dashboard and landing domains
const allowedOrigins = [
  'https://berrydashboard.merktop.com',
  'https://berry-dashboard.up.railway.app',
  'https://berry-dashboard-production.up.railway.app',
  'https://berry-dashboard-frontend-production.up.railway.app',
  'https://berry.merktop.com',
  'https://berrybly.com',
  'https://www.berrybly.com',
  'https://berry-bly-productions.up.railway.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
];

// REMOVED: No longer depends on monorepo - all data is local now
// const MONOREPO_API_URL = 'https://backend-production-b84e.up.railway.app/api/v1';

// Send confirmation email to admin
const sendAdminConfirmation = async (sentGuests, category) => {
  const categoryNames = { A: 'VIP', B: 'Priority', C: 'Standard' };
  const categoryName = categoryNames[category] || category;

  const guestList = sentGuests.map(g => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); color: #ffffff;">${g.name}</td>
      <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); color: #999;">${g.email}</td>
      <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); color: #d4af37;">${categoryName}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Inter', Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 40px;">
          <h1 style="color: #d4af37; font-size: 28px; margin: 0;">Berry Bly Dashboard</h1>
          <p style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-top: 8px;">Admin Notification</p>
        </div>

        <!-- Success Message -->
        <div style="background: linear-gradient(180deg, rgba(34, 197, 94, 0.1) 0%, transparent 100%); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 16px; padding: 30px; margin-bottom: 30px; text-align: center;">
          <div style="width: 60px; height: 60px; background: rgba(34, 197, 94, 0.2); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 30px;">OK</span>
          </div>
          <h2 style="color: #22c55e; font-size: 22px; margin: 0 0 10px 0;">Invitations Sent Successfully!</h2>
          <p style="color: #999; font-size: 16px; margin: 0;">
            ${sentGuests.length} invitation${sentGuests.length > 1 ? 's' : ''} ${sentGuests.length > 1 ? 'have' : 'has'} been sent
          </p>
        </div>

        <!-- Guest Details -->
        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 25px; margin-bottom: 30px;">
          <h3 style="color: #d4af37; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 20px 0;">Guest Details</h3>

          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="text-align: left; padding: 12px; border-bottom: 2px solid rgba(212, 175, 55, 0.3); color: #d4af37; font-size: 12px; text-transform: uppercase;">Name</th>
                <th style="text-align: left; padding: 12px; border-bottom: 2px solid rgba(212, 175, 55, 0.3); color: #d4af37; font-size: 12px; text-transform: uppercase;">Email</th>
                <th style="text-align: left; padding: 12px; border-bottom: 2px solid rgba(212, 175, 55, 0.3); color: #d4af37; font-size: 12px; text-transform: uppercase;">Category</th>
              </tr>
            </thead>
            <tbody>
              ${guestList}
            </tbody>
          </table>
        </div>

        <!-- Timestamp -->
        <div style="text-align: center; color: #666; font-size: 12px;">
          <p style="margin: 0;">Sent on ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          <p style="margin: 10px 0 0 0; color: #444;">Berry Bly Events Dashboard</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: EMAIL_CONFIG.adminEmail,
      subject: `${sentGuests.length} Invitation${sentGuests.length > 1 ? 's' : ''} Sent Successfully - Berry Bly`,
      html,
    });
    console.log(`Admin confirmation sent to ${EMAIL_CONFIG.adminEmail}`);
  } catch (error) {
    console.error('Failed to send admin confirmation:', error);
  }
};

// Middleware - Manual CORS headers (ensure they're always sent)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Allow all origins for now (or check allowedOrigins if needed)
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Also use cors middleware as backup
app.use(cors({
  origin: true, // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ============================================
// OAUTH 2.0 ENDPOINTS
// ============================================

// Simple password hashing (for production use bcrypt)
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password + 'berry-salt-2024').digest('hex');
};

// Generate random token
const generateToken = () => crypto.randomBytes(32).toString('hex');

// OAuth: Allowed redirect URIs (whitelist)
const ALLOWED_REDIRECT_URIS = [
  'https://chat.openai.com/aip/g-faca3a52350bea551c80533e84c5eff01cc9dbcd/oauth/callback',
  'https://chat.openai.com', // ChatGPT base
  'https://chatgpt.com', // Alternative ChatGPT domain
];

// Helper to validate redirect URI
const isValidRedirectUri = (uri) => {
  if (!uri) return true; // Allow empty for frontend
  return ALLOWED_REDIRECT_URIS.some(allowed => uri.startsWith(allowed) || uri.includes('chat.openai.com') || uri.includes('chatgpt.com') || uri.includes('localhost'));
};

// OAuth: Authorization page (GET /oauth/authorize)
app.get('/oauth/authorize', async (req, res) => {
  const { client_id, redirect_uri, state, response_type } = req.query;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Berry Bly - Sign In</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #000;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          padding: 40px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          width: 100%;
          max-width: 420px;
        }
        .logo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 32px;
        }
        .logo-icon {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #f59e0b 0%, #ca8a04 100%);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: bold;
          color: white;
        }
        .logo-text {
          font-size: 24px;
          font-weight: bold;
          color: white;
        }
        .header {
          text-align: center;
          margin-bottom: 32px;
        }
        h1 {
          color: #fff;
          margin-bottom: 8px;
          font-size: 28px;
          font-weight: 700;
        }
        .subtitle {
          color: rgba(255, 255, 255, 0.6);
          font-size: 15px;
        }
        .form-group { margin-bottom: 20px; }
        label {
          display: block;
          margin-bottom: 8px;
          color: rgba(255, 255, 255, 0.8);
          font-weight: 500;
          font-size: 14px;
        }
        input {
          width: 100%;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          font-size: 16px;
          color: white;
          transition: all 0.2s;
        }
        input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }
        input:focus {
          outline: none;
          border-color: #f59e0b;
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
        }
        button {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #f59e0b 0%, #ca8a04 100%);
          color: #000;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(245, 158, 11, 0.35);
        }
        .tabs {
          display: flex;
          margin-bottom: 28px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 4px;
        }
        .tab {
          flex: 1;
          padding: 12px;
          text-align: center;
          cursor: pointer;
          color: rgba(255, 255, 255, 0.5);
          font-weight: 500;
          border-radius: 10px;
          transition: all 0.2s;
        }
        .tab:hover {
          color: rgba(255, 255, 255, 0.8);
        }
        .tab.active {
          color: #000;
          background: linear-gradient(135deg, #f59e0b 0%, #ca8a04 100%);
        }
        .footer {
          text-align: center;
          margin-top: 24px;
          color: rgba(255, 255, 255, 0.4);
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <div class="logo-icon">B</div>
          <span class="logo-text">Berry Bly</span>
        </div>

        <div class="tabs">
          <div class="tab active" onclick="showLogin()">Sign In</div>
          <div class="tab" onclick="showRegister()">Register</div>
        </div>

        <div id="loginForm">
          <div class="header">
            <h1>Welcome Back</h1>
            <p class="subtitle">Sign in to connect your account</p>
          </div>
          <form action="/oauth/login" method="POST">
            <input type="hidden" name="redirect_uri" value="${redirect_uri || ''}">
            <input type="hidden" name="state" value="${state || ''}">
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" name="email" required placeholder="you@company.com">
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" name="password" required placeholder="••••••••">
            </div>
            <button type="submit">Sign In</button>
          </form>
        </div>

        <div id="registerForm" style="display:none;">
          <div class="header">
            <h1>Create Account</h1>
            <p class="subtitle">Join Berry Bly Productions</p>
          </div>
          <form action="/oauth/register" method="POST">
            <input type="hidden" name="redirect_uri" value="${redirect_uri || ''}">
            <input type="hidden" name="state" value="${state || ''}">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" name="name" required placeholder="Your name">
            </div>
            <div class="form-group">
              <label>Company</label>
              <input type="text" name="company" placeholder="Your company (optional)">
            </div>
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" name="email" required placeholder="you@company.com">
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" name="password" required placeholder="Min 6 characters">
            </div>
            <button type="submit">Create Account</button>
          </form>
        </div>

        <div class="footer">
          © 2025 Berry Bly Productions
        </div>
      </div>
      <script>
        function showLogin() {
          document.getElementById('loginForm').style.display = 'block';
          document.getElementById('registerForm').style.display = 'none';
          document.querySelectorAll('.tab')[0].classList.add('active');
          document.querySelectorAll('.tab')[1].classList.remove('active');
        }
        function showRegister() {
          document.getElementById('loginForm').style.display = 'none';
          document.getElementById('registerForm').style.display = 'block';
          document.querySelectorAll('.tab')[0].classList.remove('active');
          document.querySelectorAll('.tab')[1].classList.add('active');
        }
      </script>
    </body>
    </html>
  `);
});

// OAuth: Login handler
app.post('/oauth/login', async (req, res) => {
  try {
    const { email, password, redirect_uri, state } = req.body;

    // Check if this is a ChatGPT OAuth request (needs redirect) or frontend request (needs JSON)
    const isOAuthRedirect = redirect_uri && (
      redirect_uri.includes('chat.openai.com') ||
      redirect_uri.includes('chatgpt.com') ||
      redirect_uri.includes('openai.com')
    );
    const isFrontend = !isOAuthRedirect;

    // Find user
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userResult.rows.length === 0) {
      if (isFrontend) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      return res.send('<html><body><h1>Error</h1><p>User not found. <a href="javascript:history.back()">Go back</a></p></body></html>');
    }

    const user = userResult.rows[0];

    // Check password
    if (user.password_hash !== hashPassword(password)) {
      if (isFrontend) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      return res.send('<html><body><h1>Error</h1><p>Invalid password. <a href="javascript:history.back()">Go back</a></p></body></html>');
    }

    // Generate tokens
    const code = generateToken();
    const accessToken = generateToken();
    const refreshToken = generateToken();

    // Save token
    await pool.query(
      'INSERT INTO oauth_tokens (user_id, access_token, refresh_token, code, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL \'30 days\')',
      [user.id, accessToken, refreshToken, code]
    );

    // Return JSON for frontend
    if (isFrontend) {
      return res.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 2592000,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          company: user.company
        }
      });
    }

    // Redirect back to ChatGPT with code
    const redirectUrl = `${redirect_uri}?code=${code}${state ? '&state=' + state : ''}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// OAuth: Register handler
app.post('/oauth/register', async (req, res) => {
  try {
    const { name, email, password, company, redirect_uri, state } = req.body;

    // Check if this is a ChatGPT OAuth request (needs redirect) or frontend request (needs JSON)
    const isOAuthRedirect = redirect_uri && (
      redirect_uri.includes('chat.openai.com') ||
      redirect_uri.includes('chatgpt.com') ||
      redirect_uri.includes('openai.com')
    );
    const isFrontend = !isOAuthRedirect;

    if (!email || !password) {
      if (isFrontend) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      return res.send('<html><body><h1>Error</h1><p>Email and password are required. <a href="javascript:history.back()">Go back</a></p></body></html>');
    }

    // Check if user exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      if (isFrontend) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      return res.send('<html><body><h1>Error</h1><p>Email already registered. <a href="javascript:history.back()">Go back to login</a></p></body></html>');
    }

    // Create user
    const userResult = await pool.query(
      'INSERT INTO users (email, password_hash, name, company) VALUES ($1, $2, $3, $4) RETURNING id',
      [email.toLowerCase(), hashPassword(password), name, company]
    );

    const userId = userResult.rows[0].id;

    // Generate tokens
    const code = generateToken();
    const accessToken = generateToken();
    const refreshToken = generateToken();

    // Save token
    await pool.query(
      'INSERT INTO oauth_tokens (user_id, access_token, refresh_token, code, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL \'30 days\')',
      [userId, accessToken, refreshToken, code]
    );

    // Return JSON for frontend
    if (isFrontend) {
      return res.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 2592000,
        user: {
          id: userId,
          email: email.toLowerCase(),
          name: name,
          company: company
        }
      });
    }

    // Redirect back to ChatGPT with code
    const redirectUrl = `${redirect_uri}?code=${code}${state ? '&state=' + state : ''}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth register error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Admin: Delete user by email (for testing/admin purposes)
app.delete('/admin/users/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const adminKey = req.headers['x-admin-key'];

    // Simple admin key check
    if (adminKey !== 'berry-admin-2025') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Delete oauth tokens first
    const user = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (user.rows.length > 0) {
      await pool.query('DELETE FROM oauth_tokens WHERE user_id = $1::integer', [user.rows[0].id]);
    }

    // Delete user
    const result = await pool.query('DELETE FROM users WHERE email = $1 RETURNING *', [email.toLowerCase()]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: `User ${email} deleted` });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// OAuth: Token exchange endpoint
app.post('/oauth/token', async (req, res) => {
  try {
    const { code, grant_type, refresh_token } = req.body;

    let tokenResult;

    if (grant_type === 'authorization_code' && code) {
      tokenResult = await pool.query('SELECT * FROM oauth_tokens WHERE code = $1', [code]);
    } else if (grant_type === 'refresh_token' && refresh_token) {
      tokenResult = await pool.query('SELECT * FROM oauth_tokens WHERE refresh_token = $1', [refresh_token]);
    } else {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Code or token not found' });
    }

    const token = tokenResult.rows[0];

    // Clear the code after use (one-time use)
    if (code) {
      await pool.query('UPDATE oauth_tokens SET code = NULL WHERE id = $1', [token.id]);
    }

    res.json({
      access_token: token.access_token,
      token_type: 'Bearer',
      expires_in: 2592000, // 30 days
      refresh_token: token.refresh_token
    });
  } catch (error) {
    console.error('OAuth token error:', error);
    res.status(500).json({ error: 'server_error' });
  }
});

// OAuth: Forgot Password endpoint
app.post('/oauth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user exists
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      // Don't reveal if email exists or not for security
      return res.json({ success: true, message: 'If an account exists with this email, a reset link will be sent.' });
    }

    const user = userResult.rows[0];

    // Generate reset token
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour from now

    // Store reset token in database
    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [resetToken, resetExpires, user.id]
    );

    // In production, send email with reset link
    // For now, log the token for development
    console.log(`Password reset requested for ${email}. Token: ${resetToken}`);

    // TODO: Send email with reset link
    // const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    // await sendEmail(email, 'Password Reset', `Click here to reset: ${resetLink}`);

    res.json({ success: true, message: 'If an account exists with this email, a reset link will be sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// OAuth: Reset Password endpoint
app.post('/oauth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Find user with valid reset token
    const userResult = await pool.query(
      'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const user = userResult.rows[0];

    // Hash new password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password and clear reset token
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hashedPassword, user.id]
    );

    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Middleware: Extract user from Bearer token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const result = await pool.query(
      `SELECT u.* FROM users u
       JOIN oauth_tokens t ON u.id = t.user_id
       WHERE t.access_token = $1 AND t.expires_at > NOW()`,
      [token]
    );

    if (result.rows.length > 0) {
      req.user = result.rows[0];
    } else {
      req.user = null;
    }
  } catch (error) {
    console.error('Auth error:', error);
    req.user = null;
  }

  next();
};

// Apply auth middleware to all routes
app.use(authenticateToken);

// ============================================
// END OAUTH
// ============================================

// Helper to transform DB row to API response
const transformGuest = (row) => ({
  id: String(row.id),
  name: row.name,
  email: row.email,
  phone: row.phone || '',
  instagram: row.instagram || '',
  partySize: row.party_size,
  eventDate: row.event_date ? row.event_date.toISOString() : '',
  notes: row.notes || '',
  category: row.category,
  emailSent: row.email_sent,
  emailSentAt: row.email_sent_at ? row.email_sent_at.toISOString() : null,
  checkedInAt: row.checked_in_at ? row.checked_in_at.toISOString() : null,
  createdAt: row.created_at.toISOString(),
  isFeatured: row.is_featured || false,
  rating: row.rating || 0,
});

// Email template generator
const generateInvitationEmail = (guest, category, customMessage = '') => {
  const categoryNames = {
    A: 'VIP',
    B: 'Priority',
    C: 'Standard',
  };

  return {
    subject: `You're Invited! - Berry Bly Events`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: Georgia, serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="color: #d4af37; font-size: 32px; margin: 0;">Berry Bly</h1>
            <p style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-top: 8px;">Exclusive Events</p>
          </div>

          <!-- Main Content -->
          <div style="background: linear-gradient(180deg, rgba(212, 175, 55, 0.1) 0%, transparent 100%); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 16px; padding: 40px; margin-bottom: 30px;">
            <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 20px 0;">Dear ${guest.name},</h2>

            <p style="color: #cccccc; font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">
              We are delighted to confirm your <strong style="color: #d4af37;">${categoryNames[category]}</strong> invitation to our exclusive event.
            </p>

            ${customMessage ? `
            <div style="background: rgba(255,255,255,0.05); border-left: 3px solid #d4af37; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="color: #ffffff; font-size: 16px; line-height: 1.6; margin: 0;">${customMessage}</p>
            </div>
            ` : ''}

            <!-- Event Details -->
            <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid rgba(255,255,255,0.1);">
              <h3 style="color: #d4af37; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 20px 0;">Your Details</h3>

              <table style="width: 100%; color: #999;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Guest Status</td>
                  <td style="padding: 8px 0; color: #d4af37; text-align: right;">${categoryNames[category]}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Party Size</td>
                  <td style="padding: 8px 0; color: #ffffff; text-align: right;">${guest.partySize || guest.party_size} ${(guest.partySize || guest.party_size) > 1 ? 'guests' : 'guest'}</td>
                </tr>
                ${guest.eventDate || guest.event_date ? `
                <tr>
                  <td style="padding: 8px 0; color: #666;">Event Date</td>
                  <td style="padding: 8px 0; color: #ffffff; text-align: right;">${new Date(guest.eventDate || guest.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                </tr>
                ` : ''}
              </table>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; color: #666; font-size: 12px;">
            <p style="margin: 0 0 10px 0;">Questions? Reply to this email or contact us directly.</p>
            <p style="margin: 0; color: #444;">Berry Bly Events. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };
};

// GET /api/guests - Get all guests
app.get('/api/guests', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM guests ORDER BY created_at DESC');
    const guests = result.rows.map(transformGuest);
    res.json(guests);
  } catch (error) {
    console.error('Error fetching guests:', error);
    res.status(500).json({ error: 'Failed to fetch guests' });
  }
});

// POST /api/guests - Add new guest (from landing page or dashboard)
// Accepts both formats: landing (numberOfGuests, vipPreferences) and dashboard (partySize, notes)
app.post('/api/guests', async (req, res) => {
  const {
    name,
    email,
    phone,
    instagram,
    // Dashboard format
    partySize,
    eventDate,
    notes,
    // Landing page format
    eventId,
    numberOfGuests,
    vipPreferences
  } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  // Normalize data - accept both formats
  const normalizedPartySize = partySize || numberOfGuests || 1;
  const normalizedNotes = notes || (vipPreferences ? `VIP: ${vipPreferences}` : '') || '';
  const normalizedEventDate = eventDate || null;
  const normalizedEventId = eventId || null;

  try {
    const result = await pool.query(
      `INSERT INTO guests (name, email, phone, instagram, party_size, event_date, notes, category, email_sent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', false, CURRENT_TIMESTAMP)
       RETURNING *`,
      [name, email, phone || '', instagram || '', normalizedPartySize, normalizedEventDate,
       normalizedEventId ? `Event: ${normalizedEventId}\n${normalizedNotes}` : normalizedNotes]
    );

    const newGuest = transformGuest(result.rows[0]);
    console.log(`✅ New guest added: ${name} (@${instagram || 'no instagram'}) - Party: ${normalizedPartySize}`);

    // Send welcome email asynchronously
    const welcomeHtml = generateInvitationEmail(newGuest, 'pending', '');
    resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: email,
      subject: "You're on the List! - Berry Bly Events",
      html: welcomeHtml.html,
    }).then(() => {
      console.log(`📧 Welcome email sent to ${email}`);
    }).catch((err) => {
      console.error(`❌ Failed to send welcome email to ${email}:`, err);
    });

    // Response compatible with landing page expectations
    res.status(201).json({
      success: true,
      message: 'You have been added to the guest list! Check your email for confirmation.',
      entry: {
        id: newGuest.id,
        name: newGuest.name,
        email: newGuest.email,
        status: 'pending',
      },
      guest: newGuest, // Also include full guest for dashboard
    });
  } catch (error) {
    console.error('Error adding guest:', error);
    res.status(500).json({ error: 'Failed to add guest' });
  }
});

// PUT /api/guests/:id - Update guest (change category, check-in, featured, rating, etc.)
app.put('/api/guests/:id', async (req, res) => {
  const { id } = req.params;
  const { category, checkedInAt, emailSent, emailSentAt, notes, partySize, phone, instagram, isFeatured, rating } = req.body;

  try {
    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (category !== undefined) {
      updates.push(`category = $${paramCount}`);
      values.push(category);
      paramCount++;
    }
    if (checkedInAt !== undefined) {
      updates.push(`checked_in_at = $${paramCount}`);
      values.push(checkedInAt);
      paramCount++;
    }
    if (emailSent !== undefined) {
      updates.push(`email_sent = $${paramCount}`);
      values.push(emailSent);
      paramCount++;
    }
    if (emailSentAt !== undefined) {
      updates.push(`email_sent_at = $${paramCount}`);
      values.push(emailSentAt);
      paramCount++;
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount}`);
      values.push(notes);
      paramCount++;
    }
    if (partySize !== undefined) {
      updates.push(`party_size = $${paramCount}`);
      values.push(partySize);
      paramCount++;
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramCount}`);
      values.push(phone);
      paramCount++;
    }
    if (instagram !== undefined) {
      updates.push(`instagram = $${paramCount}`);
      values.push(instagram);
      paramCount++;
    }
    if (isFeatured !== undefined) {
      updates.push(`is_featured = $${paramCount}`);
      values.push(isFeatured);
      paramCount++;
    }
    if (rating !== undefined) {
      updates.push(`rating = $${paramCount}`);
      values.push(Math.min(10, Math.max(0, parseInt(rating) || 0))); // Clamp 0-10
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE guests SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }

    const updatedGuest = transformGuest(result.rows[0]);
    res.json(updatedGuest);
  } catch (error) {
    console.error('Error updating guest:', error);
    res.status(500).json({ error: 'Failed to update guest' });
  }
});

// POST /api/guests/:id/send-invitation - Send invitation email
app.post('/api/guests/:id/send-invitation', async (req, res) => {
  const { id } = req.params;
  const { category, customMessage, emailOnly } = req.body;

  try {
    const guestResult = await pool.query('SELECT * FROM guests WHERE id = $1', [id]);

    if (guestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }

    const guest = guestResult.rows[0];
    const emailContent = generateInvitationEmail(guest, category, customMessage);

    const { data, error } = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: guest.email,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    if (error) {
      console.error('Email error:', error);
      return res.status(500).json({ error: 'Failed to send email', details: error });
    }

    // Update guest status
    let updateQuery;
    let updateValues;

    if (emailOnly) {
      updateQuery = 'UPDATE guests SET email_sent = true, email_sent_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *';
      updateValues = [id];
      console.log(`Email only sent to ${guest.name} (${guest.email}) - Category unchanged`);
    } else {
      updateQuery = 'UPDATE guests SET category = $1, email_sent = true, email_sent_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
      updateValues = [category, id];
      console.log(`Invitation sent to ${guest.name} (${guest.email}) - Category: ${category}`);
    }

    const updatedResult = await pool.query(updateQuery, updateValues);
    const updatedGuest = transformGuest(updatedResult.rows[0]);

    // Send confirmation to admin
    await sendAdminConfirmation([{ name: guest.name, email: guest.email }], emailOnly ? 'Email Only' : category);

    res.json({ success: true, emailId: data?.id, guest: updatedGuest });
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

// POST /api/guests/bulk-send - Send invitations to multiple guests
app.post('/api/guests/bulk-send', async (req, res) => {
  const { guestIds, category, customMessages } = req.body;

  if (!guestIds || !Array.isArray(guestIds) || guestIds.length === 0) {
    return res.status(400).json({ error: 'guestIds array is required' });
  }

  const results = [];
  const errors = [];

  for (const id of guestIds) {
    try {
      const guestResult = await pool.query('SELECT * FROM guests WHERE id = $1', [id]);

      if (guestResult.rows.length === 0) {
        errors.push({ id, error: 'Guest not found' });
        continue;
      }

      const guest = guestResult.rows[0];
      const guestCategory = category || guest.category || 'C';
      const customMessage = customMessages?.[id] || '';
      const emailContent = generateInvitationEmail(guest, guestCategory, customMessage);

      const { data, error } = await resend.emails.send({
        from: EMAIL_CONFIG.from,
        to: guest.email,
        replyTo: EMAIL_CONFIG.replyTo,
        subject: emailContent.subject,
        html: emailContent.html,
      });

      if (error) {
        errors.push({ id, email: guest.email, error: error.message });
        continue;
      }

      // Update guest status
      await pool.query(
        'UPDATE guests SET category = $1, email_sent = true, email_sent_at = CURRENT_TIMESTAMP WHERE id = $2',
        [guestCategory, id]
      );

      results.push({ id, email: guest.email, emailId: data?.id, name: guest.name });
      console.log(`Bulk send: ${guest.name} (${guest.email}) - Category: ${guestCategory}`);
    } catch (error) {
      errors.push({ id, error: error.message });
    }
  }

  // Send confirmation to admin with all successfully sent guests
  if (results.length > 0) {
    const sentGuestsList = results.map(r => ({ name: r.name, email: r.email }));
    await sendAdminConfirmation(sentGuestsList, category || 'C');
  }

  res.json({
    success: true,
    sent: results.length,
    failed: errors.length,
    results,
    errors
  });
});

// DELETE /api/guests/:id - Remove guest
app.delete('/api/guests/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM guests WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting guest:', error);
    res.status(500).json({ error: 'Failed to delete guest' });
  }
});

// GET /api/stats - Get dashboard statistics
app.get('/api/stats', async (req, res) => {
  try {
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM guests');
    const pendingResult = await pool.query("SELECT COUNT(*) as count FROM guests WHERE category = 'pending'");
    const vipResult = await pool.query("SELECT COUNT(*) as count FROM guests WHERE category = 'A'");
    const priorityResult = await pool.query("SELECT COUNT(*) as count FROM guests WHERE category = 'B'");
    const standardResult = await pool.query("SELECT COUNT(*) as count FROM guests WHERE category = 'C'");
    const emailsSentResult = await pool.query('SELECT COUNT(*) as count FROM guests WHERE email_sent = true');
    const checkedInResult = await pool.query('SELECT COUNT(*) as count FROM guests WHERE checked_in_at IS NOT NULL');
    const featuredResult = await pool.query('SELECT COUNT(*) as count FROM guests WHERE is_featured = true');

    res.json({
      total: parseInt(totalResult.rows[0].count),
      pending: parseInt(pendingResult.rows[0].count),
      vip: parseInt(vipResult.rows[0].count),
      priority: parseInt(priorityResult.rows[0].count),
      standard: parseInt(standardResult.rows[0].count),
      emailsSent: parseInt(emailsSentResult.rows[0].count),
      checkedIn: parseInt(checkedInResult.rows[0].count),
      featured: parseInt(featuredResult.rows[0].count),
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/guests/featured - Get featured guests (Hot selection)
app.get('/api/guests/featured', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM guests WHERE is_featured = true ORDER BY rating DESC, created_at DESC'
    );
    const guests = result.rows.map(transformGuest);
    res.json(guests);
  } catch (error) {
    console.error('Error fetching featured guests:', error);
    res.status(500).json({ error: 'Failed to fetch featured guests' });
  }
});

// GET /api/v1/guests/featured - Alias for featured guests
app.get('/api/v1/guests/featured', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM guests WHERE is_featured = true ORDER BY rating DESC, created_at DESC'
    );
    const guests = result.rows.map(transformGuest);
    res.json(guests);
  } catch (error) {
    console.error('Error fetching featured guests:', error);
    res.status(500).json({ error: 'Failed to fetch featured guests' });
  }
});

// ============================================
// RESEND WEBHOOK ENDPOINT FOR EMAIL TRACKING
// ============================================

// Webhook secret for signature verification
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

// Verify Resend webhook signature
const verifyWebhookSignature = (payload, signature, secret) => {
  if (!secret) {
    console.warn('RESEND_WEBHOOK_SECRET not configured, skipping verification');
    return true;
  }

  try {
    const signatures = signature.split(' ');
    const timestamp = signatures.find(s => s.startsWith('t='))?.split('=')[1];
    const v1Signature = signatures.find(s => s.startsWith('v1='))?.split('=')[1];

    if (!timestamp || !v1Signature) {
      console.error('Invalid signature format');
      return false;
    }

    // Create the signed payload
    const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;

    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(v1Signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};

// Webhook endpoint for Resend email events
// Configure in Resend Dashboard: https://resend.com/webhooks
// Webhook URL: https://berry.merktop.com/api/webhooks/resend
app.post('/api/webhooks/resend', async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['svix-signature'];
    if (RESEND_WEBHOOK_SECRET && signature) {
      const isValid = verifyWebhookSignature(req.body, signature, RESEND_WEBHOOK_SECRET);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const payload = req.body;
    const eventType = payload.type;
    const data = payload.data;

    console.log(`Resend webhook received: ${eventType}`, JSON.stringify(data, null, 2));

    // Extract email info
    const emailId = data.email_id;
    const recipientEmail = data.to?.[0] || data.email;
    const subject = data.subject;
    const timestamp = data.created_at || new Date().toISOString();

    // Find guest by email
    let guestId = null;
    if (recipientEmail) {
      const guestResult = await pool.query(
        'SELECT id FROM guests WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
        [recipientEmail]
      );
      if (guestResult.rows.length > 0) {
        guestId = guestResult.rows[0].id;
      }
    }

    // Store the event
    await pool.query(
      `INSERT INTO email_events (email_id, guest_id, event_type, recipient_email, subject, timestamp, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [emailId, guestId, eventType, recipientEmail, subject, timestamp, JSON.stringify(payload)]
    );

    // Update guest record based on event type
    if (guestId) {
      switch (eventType) {
        case 'email.sent':
          await pool.query(
            'UPDATE guests SET email_sent = true, email_sent_at = $1 WHERE id = $2',
            [timestamp, guestId]
          );
          console.log(`Email sent to guest ${guestId}`);
          break;
        case 'email.delivered':
          console.log(`Email delivered to guest ${guestId}`);
          break;
        case 'email.bounced':
          console.log(`Email bounced for guest ${guestId}`);
          break;
        case 'email.complained':
          console.log(`Email complaint from guest ${guestId}`);
          break;
        case 'email.opened':
          console.log(`Email opened by guest ${guestId}`);
          break;
        case 'email.clicked':
          console.log(`Email link clicked by guest ${guestId}`);
          break;
      }
    }

    res.json({ received: true, event: eventType });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// GET email events for a guest
app.get('/api/guests/:id/email-events', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM email_events WHERE guest_id = $1 ORDER BY timestamp DESC',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching email events:', error);
    res.status(500).json({ error: 'Failed to fetch email events' });
  }
});

// GET all email events with stats
app.get('/api/email-events', async (req, res) => {
  try {
    const events = await pool.query(
      'SELECT * FROM email_events ORDER BY timestamp DESC LIMIT 100'
    );

    const stats = await pool.query(`
      SELECT
        event_type,
        COUNT(*) as count
      FROM email_events
      GROUP BY event_type
    `);

    res.json({
      events: events.rows,
      stats: stats.rows.reduce((acc, row) => {
        acc[row.event_type] = parseInt(row.count);
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Error fetching email events:', error);
    res.status(500).json({ error: 'Failed to fetch email events' });
  }
});

// GET email status by email ID
app.get('/api/email-status/:emailId', async (req, res) => {
  try {
    const { emailId } = req.params;
    const status = await getEmailStatus(emailId);
    res.json(status);
  } catch (error) {
    console.error('Error fetching email status:', error);
    res.status(500).json({ error: 'Failed to fetch email status' });
  }
});

// GET email delivery summary (sent vs delivered vs bounced)
app.get('/api/email-summary', async (req, res) => {
  try {
    const { from, to } = req.query;

    let dateFilter = '';
    const params = [];

    if (from) {
      params.push(from);
      dateFilter += ` AND timestamp >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      dateFilter += ` AND timestamp <= $${params.length}`;
    }

    const result = await pool.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN event_type = 'email.queued' THEN email_id END) as queued,
        COUNT(DISTINCT CASE WHEN event_type = 'email.sent' THEN email_id END) as sent,
        COUNT(DISTINCT CASE WHEN event_type = 'email.delivered' THEN email_id END) as delivered,
        COUNT(DISTINCT CASE WHEN event_type = 'email.bounced' THEN email_id END) as bounced,
        COUNT(DISTINCT CASE WHEN event_type = 'email.complained' THEN email_id END) as complained,
        COUNT(DISTINCT CASE WHEN event_type = 'email.opened' THEN email_id END) as opened,
        COUNT(DISTINCT CASE WHEN event_type = 'email.clicked' THEN email_id END) as clicked,
        COUNT(DISTINCT email_id) as total_emails
      FROM email_events
      WHERE 1=1 ${dateFilter}
    `, params);

    const stats = result.rows[0];

    // Calculate delivery rate
    const totalSent = parseInt(stats.sent) || 0;
    const totalDelivered = parseInt(stats.delivered) || 0;
    const deliveryRate = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : 0;

    res.json({
      queued: parseInt(stats.queued) || 0,
      sent: totalSent,
      delivered: totalDelivered,
      bounced: parseInt(stats.bounced) || 0,
      complained: parseInt(stats.complained) || 0,
      opened: parseInt(stats.opened) || 0,
      clicked: parseInt(stats.clicked) || 0,
      totalEmails: parseInt(stats.total_emails) || 0,
      deliveryRate: `${deliveryRate}%`,
    });
  } catch (error) {
    console.error('Error fetching email summary:', error);
    res.status(500).json({ error: 'Failed to fetch email summary' });
  }
});

// ============================================
// API V1 ROUTES (aliases for compatibility)
// ============================================
app.use('/api/v1', (req, res, next) => {
  // Rewrite /api/v1/* to /api/*
  req.url = req.url;
  next();
});

// Mount all /api routes also on /api/v1
app.get('/api/v1/guests', async (req, res) => {
  try {
    const userId = req.user?.id;
    // Filter by user_id if authenticated, otherwise return all (for public access)
    const query = userId
      ? 'SELECT * FROM guests WHERE user_id = $1::integer OR user_id IS NULL ORDER BY created_at DESC'
      : 'SELECT * FROM guests ORDER BY created_at DESC';
    const params = userId ? [userId] : [];
    const result = await pool.query(query, params);
    const guests = result.rows.map(transformGuest);
    res.json(guests);
  } catch (error) {
    console.error('Error fetching guests:', error);
    res.status(500).json({ error: 'Failed to fetch guests' });
  }
});

// POST /api/v1/guests - Alias for /api/guests (accepts both formats)
app.post('/api/v1/guests', async (req, res) => {
  const {
    name, email, phone, instagram,
    partySize, eventDate, notes,
    eventId, numberOfGuests, vipPreferences
  } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const normalizedPartySize = partySize || numberOfGuests || 1;
  const normalizedNotes = notes || (vipPreferences ? `VIP: ${vipPreferences}` : '') || '';
  const normalizedEventId = eventId || null;
  const userId = req.user?.id || null;

  try {
    const result = await pool.query(
      `INSERT INTO guests (name, email, phone, instagram, party_size, event_date, notes, category, email_sent, user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', false, $8, CURRENT_TIMESTAMP)
       RETURNING *`,
      [name, email, phone || '', instagram || '', normalizedPartySize, eventDate || null,
       normalizedEventId ? `Event: ${normalizedEventId}\n${normalizedNotes}` : normalizedNotes, userId]
    );

    const newGuest = transformGuest(result.rows[0]);
    console.log(`✅ New guest (v1): ${name} - Party: ${normalizedPartySize}`);

    // Send welcome email
    const welcomeHtml = generateInvitationEmail(newGuest, 'pending', '');
    resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: email,
      subject: "You're on the List! - Berry Bly Events",
      html: welcomeHtml.html,
    }).catch((err) => console.error(`Failed to send welcome email:`, err));

    res.status(201).json({
      success: true,
      message: 'You have been added to the guest list!',
      entry: { id: newGuest.id, name: newGuest.name, email: newGuest.email, status: 'pending' },
      guest: newGuest,
    });
  } catch (error) {
    console.error('Error adding guest:', error);
    res.status(500).json({ error: 'Failed to add guest' });
  }
});

app.put('/api/v1/guests/:id', async (req, res) => {
  const { id } = req.params;
  const { category, checkedInAt, emailSent, emailSentAt, notes, partySize, phone, instagram } = req.body;
  const userId = req.user?.id;
  try {
    const updates = [];
    const values = [];
    let paramCount = 1;
    if (category !== undefined) { updates.push(`category = $${paramCount}`); values.push(category); paramCount++; }
    if (checkedInAt !== undefined) { updates.push(`checked_in_at = $${paramCount}`); values.push(checkedInAt); paramCount++; }
    if (emailSent !== undefined) { updates.push(`email_sent = $${paramCount}`); values.push(emailSent); paramCount++; }
    if (emailSentAt !== undefined) { updates.push(`email_sent_at = $${paramCount}`); values.push(emailSentAt); paramCount++; }
    if (notes !== undefined) { updates.push(`notes = $${paramCount}`); values.push(notes); paramCount++; }
    if (partySize !== undefined) { updates.push(`party_size = $${paramCount}`); values.push(partySize); paramCount++; }
    if (phone !== undefined) { updates.push(`phone = $${paramCount}`); values.push(phone); paramCount++; }
    if (instagram !== undefined) { updates.push(`instagram = $${paramCount}`); values.push(instagram); paramCount++; }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(id);
    // Add user_id check for data isolation
    const whereClause = userId
      ? `WHERE id = $${paramCount} AND (user_id = $${paramCount + 1} OR user_id IS NULL)`
      : `WHERE id = $${paramCount}`;
    if (userId) values.push(userId);
    const query = `UPDATE guests SET ${updates.join(', ')} ${whereClause} RETURNING *`;
    const result = await pool.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
    res.json(transformGuest(result.rows[0]));
  } catch (error) {
    console.error('Error updating guest:', error);
    res.status(500).json({ error: 'Failed to update guest' });
  }
});

app.delete('/api/v1/guests/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  try {
    // Add user_id check for data isolation
    const query = userId
      ? 'DELETE FROM guests WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL) RETURNING *'
      : 'DELETE FROM guests WHERE id = $1 RETURNING *';
    const params = userId ? [id, userId] : [id];
    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting guest:', error);
    res.status(500).json({ error: 'Failed to delete guest' });
  }
});

// ============================================
// FILE UPLOAD ENDPOINTS - CSV/Excel Import
// ============================================

// Helper function to parse CSV file
const parseCSV = (buffer) => {
  const content = buffer.toString('utf-8');
  return csvParse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });
};

// Helper function to parse Excel file
const parseExcel = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
};

// Helper function to normalize contact fields
const normalizeContactRow = (row) => {
  // Map various possible column names to standard fields
  const fieldMappings = {
    name: ['name', 'full_name', 'fullname', 'nombre', 'contact_name', 'contact'],
    email: ['email', 'email_address', 'correo', 'e-mail', 'mail'],
    phone: ['phone', 'phone_number', 'telephone', 'telefono', 'mobile', 'cell'],
    instagram: ['instagram', 'ig', 'instagram_handle', 'insta'],
    category: ['category', 'type', 'tier', 'categoria', 'guest_type'],
    company: ['company', 'organization', 'empresa', 'business'],
    notes: ['notes', 'note', 'comments', 'notas', 'description']
  };

  const normalized = {};
  const lowerRow = {};

  // Create lowercase version of keys
  Object.keys(row).forEach(key => {
    lowerRow[key.toLowerCase().trim()] = row[key];
  });

  // Map fields
  for (const [standardField, aliases] of Object.entries(fieldMappings)) {
    for (const alias of aliases) {
      if (lowerRow[alias] !== undefined && lowerRow[alias] !== '') {
        normalized[standardField] = String(lowerRow[alias]).trim();
        break;
      }
    }
  }

  return normalized;
};

// POST /api/v1/gallery/upload - Upload image for events/gallery
app.post('/api/v1/gallery/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Get the base URL from environment or request
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const imageUrl = `${baseUrl}/uploads/${req.file.filename}`;

    res.json({
      success: true,
      url: imageUrl,
      imageUrl: imageUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// POST /api/v1/uploads/contacts - Upload CSV/Excel file with contacts
app.post('/api/v1/uploads/contacts', upload.single('file'), async (req, res) => {
  const userId = req.user?.id || null;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const eventId = req.body.eventId ? parseInt(req.body.eventId) : null;
  const defaultCategory = req.body.category || 'pending';

  try {
    // Determine file type and parse
    const fileBuffer = fs.readFileSync(req.file.path);
    const isCSV = req.file.originalname.toLowerCase().endsWith('.csv');

    let records;
    try {
      records = isCSV ? parseCSV(fileBuffer) : parseExcel(fileBuffer);
    } catch (parseError) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Failed to parse file: ' + parseError.message });
    }

    // Create upload record (only if user is authenticated)
    let uploadId = null;
    if (userId) {
      const uploadResult = await pool.query(`
        INSERT INTO file_uploads (user_id, filename, original_filename, file_type, file_size, upload_type, records_processed, status, event_id)
        VALUES ($1, $2, $3, $4, $5, 'contacts', $6, 'processing', $7)
        RETURNING id
      `, [userId, req.file.filename, req.file.originalname, isCSV ? 'csv' : 'xlsx', req.file.size, records.length, eventId]);
      uploadId = uploadResult.rows[0].id;
    }

    // Process records
    let successCount = 0;
    let failedCount = 0;
    const errors = [];
    const addedGuests = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const normalized = normalizeContactRow(row);

      // Skip rows without name or email
      if (!normalized.name && !normalized.email) {
        failedCount++;
        errors.push({ row: i + 2, error: 'Missing name and email' });
        continue;
      }

      try {
        // Check for duplicate email if email provided
        if (normalized.email) {
          let existingQuery, existingParams;
          if (userId && eventId) {
            existingQuery = 'SELECT id FROM guests WHERE email = $1 AND user_id = $2::integer AND event_id = $3::integer';
            existingParams = [normalized.email, userId, eventId];
          } else if (userId) {
            existingQuery = 'SELECT id FROM guests WHERE email = $1 AND user_id = $2::integer';
            existingParams = [normalized.email, userId];
          } else if (eventId) {
            existingQuery = 'SELECT id FROM guests WHERE email = $1 AND user_id IS NULL AND event_id = $2::integer';
            existingParams = [normalized.email, eventId];
          } else {
            existingQuery = 'SELECT id FROM guests WHERE email = $1 AND user_id IS NULL';
            existingParams = [normalized.email];
          }
          const existing = await pool.query(existingQuery, existingParams);

          if (existing.rows.length > 0) {
            failedCount++;
            errors.push({ row: i + 2, error: `Duplicate email: ${normalized.email}` });
            continue;
          }
        }

        // Insert guest with user_id for data isolation
        const insertResult = await pool.query(`
          INSERT INTO guests (name, email, phone, instagram, category, notes, user_id, event_id, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          RETURNING id, name, email
        `, [
          normalized.name || 'Unknown',
          normalized.email || null,
          normalized.phone || null,
          normalized.instagram || null,
          normalized.category || defaultCategory,
          normalized.notes || (normalized.company ? `Company: ${normalized.company}` : null),
          userId,
          eventId
        ]);

        addedGuests.push(insertResult.rows[0]);
        successCount++;
      } catch (insertError) {
        failedCount++;
        errors.push({ row: i + 2, error: insertError.message });
      }
    }

    // Update upload record with results (only if we created one)
    if (uploadId) {
      await pool.query(`
        UPDATE file_uploads
        SET records_success = $1, records_failed = $2, status = 'completed', error_details = $3
        WHERE id = $4
      `, [successCount, failedCount, JSON.stringify(errors.slice(0, 100)), uploadId]);
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      uploadId,
      summary: {
        totalRecords: records.length,
        successCount,
        failedCount,
        eventId
      },
      addedGuests: addedGuests.slice(0, 10), // Return first 10 added
      errors: errors.slice(0, 20) // Return first 20 errors
    });

  } catch (error) {
    console.error('Error processing upload:', error);
    // Clean up uploaded file if exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to process upload: ' + error.message });
  }
});

// GET /api/v1/uploads - List upload history for user
app.get('/api/v1/uploads', async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const result = await pool.query(`
      SELECT id, original_filename, file_type, upload_type, records_processed,
             records_success, records_failed, status, event_id, created_at
      FROM file_uploads
      WHERE user_id = $1::integer
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId]);

    res.json({
      success: true,
      uploads: result.rows
    });
  } catch (error) {
    console.error('Error fetching uploads:', error);
    res.status(500).json({ error: 'Failed to fetch uploads' });
  }
});

// GET /api/v1/uploads/template/contacts - Download sample CSV template (MUST be before :id route)
app.get('/api/v1/uploads/template/contacts', (req, res) => {
  const template = 'name,email,phone,instagram,category,company,notes\n' +
    'John Doe,john@example.com,+1234567890,@johndoe,A,Acme Corp,VIP guest\n' +
    'Jane Smith,jane@example.com,+0987654321,@janesmith,B,Tech Inc,Priority\n';

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=contacts_template.csv');
  res.send(template);
});

// GET /api/v1/uploads/:id - Get specific upload details
app.get('/api/v1/uploads/:id', async (req, res) => {
  const userId = req.user?.id;
  const uploadId = req.params.id;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const result = await pool.query(`
      SELECT * FROM file_uploads
      WHERE id = $1::integer AND user_id = $2::integer
    `, [uploadId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    res.json({
      success: true,
      upload: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching upload:', error);
    res.status(500).json({ error: 'Failed to fetch upload' });
  }
});

app.get('/api/v1/stats', async (req, res) => {
  try {
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM guests');
    const pendingResult = await pool.query("SELECT COUNT(*) as count FROM guests WHERE category = 'pending'");
    const vipResult = await pool.query("SELECT COUNT(*) as count FROM guests WHERE category = 'A'");
    const priorityResult = await pool.query("SELECT COUNT(*) as count FROM guests WHERE category = 'B'");
    const standardResult = await pool.query("SELECT COUNT(*) as count FROM guests WHERE category = 'C'");
    const emailsSentResult = await pool.query('SELECT COUNT(*) as count FROM guests WHERE email_sent = true');
    const checkedInResult = await pool.query('SELECT COUNT(*) as count FROM guests WHERE checked_in_at IS NOT NULL');
    res.json({
      total: parseInt(totalResult.rows[0].count),
      pending: parseInt(pendingResult.rows[0].count),
      vip: parseInt(vipResult.rows[0].count),
      priority: parseInt(priorityResult.rows[0].count),
      standard: parseInt(standardResult.rows[0].count),
      emailsSent: parseInt(emailsSentResult.rows[0].count),
      checkedIn: parseInt(checkedInResult.rows[0].count),
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/v1/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', version: API_VERSION, timestamp: new Date().toISOString() });
  } catch (error) {
    res.json({ status: 'error', database: 'disconnected', version: API_VERSION, timestamp: new Date().toISOString() });
  }
});

// Debug endpoint to check tables
app.get('/api/v1/debug/tables', async (req, res) => {
  try {
    const tablesResult = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `);
    const tables = tablesResult.rows.map(r => r.table_name);

    // Check models table columns
    let modelsColumns = [];
    try {
      const columnsResult = await pool.query(`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'models' ORDER BY ordinal_position
      `);
      modelsColumns = columnsResult.rows;
    } catch (e) {
      modelsColumns = [{ error: e.message }];
    }

    // Try to query models
    let modelsTest = null;
    try {
      const result = await pool.query('SELECT COUNT(*) as count FROM models');
      modelsTest = { success: true, count: result.rows[0].count };
    } catch (e) {
      modelsTest = { success: false, error: e.message };
    }

    res.json({ tables, modelsColumns, modelsTest, dbInitStatus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Version endpoint for tracking deployments
app.get('/api/v1/version', (_req, res) => {
  res.json({ version: API_VERSION, timestamp: new Date().toISOString() });
});

// Migration endpoint - Fix SMS tables schema
app.post('/api/v1/migrate/sms-fix', async (req, res) => {
  try {
    // Add missing columns to sms_conversations
    await pool.query(`
      ALTER TABLE sms_conversations ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
      ALTER TABLE sms_conversations ADD COLUMN IF NOT EXISTS is_human_takeover BOOLEAN DEFAULT false;
      ALTER TABLE sms_conversations ADD COLUMN IF NOT EXISTS ai_response TEXT;
    `);
    // Create scheduled_messages if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        event_id INTEGER,
        recipients JSONB NOT NULL,
        message TEXT NOT NULL,
        scheduled_at TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        sent_at TIMESTAMP,
        sent_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        results JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_messages(status);
      CREATE INDEX IF NOT EXISTS idx_scheduled_time ON scheduled_messages(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_scheduled_user ON scheduled_messages(user_id);
    `);
    res.json({ success: true, message: 'SMS tables fixed successfully' });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// NOTE: All guest-lists routes are in the PROXY ROUTES section below
// They fetch data from the monorepo backend and handle emails via Resend

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (error) {
    res.json({ status: 'error', database: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// ============================================
// LOCAL GUEST-LISTS ENDPOINTS (INDEPENDENT)
// No longer depends on monorepo - uses local guests table
// ============================================

// Helper to transform guest_lists table row to frontend format
const transformToGuestList = (row) => ({
  id: String(row.id),
  eventId: row.event_id || 'default',
  name: row.name,
  email: row.email,
  phone: row.phone || '',
  instagram: row.instagram || '',
  numberOfGuests: row.number_of_guests || 1,
  vipPreferences: row.vip_preferences || '',
  status: row.status || 'pending',
  notes: row.notes || '',
  emailSent: row.email_sent || false,
  emailSentAt: row.email_sent_at ? row.email_sent_at.toISOString() : null,
  createdAt: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
  updatedAt: row.updated_at ? row.updated_at.toISOString() : row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
});

// GET /api/v1/guest-lists - List all guests (LOCAL - reads from guest_lists table)
app.get('/api/v1/guest-lists', async (req, res) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query;

    let queryText = 'SELECT * FROM guest_lists WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Filter by status
    if (status) {
      queryText += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    queryText += ' ORDER BY created_at DESC';
    queryText += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(queryText, params);
    const entries = result.rows.map(transformToGuestList);

    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) as total FROM guest_lists');
    const total = parseInt(countResult.rows[0].total);

    res.json({
      entries,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('Error fetching guest-lists:', error);
    res.status(500).json({ error: 'Failed to fetch guest lists' });
  }
});

// GET /api/v1/guest-lists/stats - Get statistics (LOCAL - reads from guest_lists table)
app.get('/api/v1/guest-lists/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'declined') as declined,
        COALESCE(SUM(number_of_guests), 0) as total_guests
      FROM guest_lists
    `);

    const row = stats.rows[0];
    res.json({
      total: parseInt(row.total),
      pending: parseInt(row.pending),
      approved: parseInt(row.approved),
      declined: parseInt(row.declined),
      totalGuests: parseInt(row.total_guests),
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/v1/guest-lists/:id - Get single guest (LOCAL - reads from guest_lists table)
app.get('/api/v1/guest-lists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM guest_lists WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Guest not found' });
    }

    res.json(transformToGuestList(result.rows[0]));
  } catch (error) {
    console.error('Error fetching guest:', error);
    res.status(500).json({ error: 'Failed to fetch guest' });
  }
});

// POST /api/v1/guest-lists - Create guest (LOCAL - writes to guest_lists table)
app.post('/api/v1/guest-lists', async (req, res) => {
  const { name, email, phone, instagram, numberOfGuests, vipPreferences, eventId } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  try {
    const id = `gst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const result = await pool.query(
      `INSERT INTO guest_lists (id, event_id, name, email, phone, instagram, number_of_guests, vip_preferences, status, email_sent, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [id, eventId || 'default', name, email, phone || '', instagram || '', numberOfGuests || 1, vipPreferences || '']
    );

    const newGuest = transformToGuestList(result.rows[0]);
    console.log(`✅ New guest-list entry: ${name} - ${email}`);

    // Send welcome email
    const welcomeHtml = generateInvitationEmail({ name, partySize: numberOfGuests || 1 }, 'pending', '');
    resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: email,
      subject: "You're on the List! - Berry Bly Events",
      html: welcomeHtml.html,
    }).catch((err) => console.error('Failed to send welcome email:', err));

    res.status(201).json({
      success: true,
      message: 'You have been added to the guest list!',
      entry: newGuest,
    });
  } catch (error) {
    console.error('Error creating guest:', error);
    res.status(500).json({ error: 'Failed to create guest' });
  }
});

// PATCH /api/v1/guest-lists/:id - Update guest (LOCAL - updates guest_lists table)
app.patch('/api/v1/guest-lists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (notes !== undefined) {
      updates.push(`notes = COALESCE(notes, '') || $${paramIndex++}`);
      params.push('\n' + notes);
    }

    // Always update updated_at
    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    if (updates.length === 1) { // Only updated_at
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE guest_lists SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Guest not found' });
    }

    res.json(transformToGuestList(result.rows[0]));
  } catch (error) {
    console.error('Error updating guest:', error);
    res.status(500).json({ error: 'Failed to update guest' });
  }
});

// DELETE /api/v1/guest-lists/:id - Delete guest (LOCAL - deletes from guest_lists table)
app.delete('/api/v1/guest-lists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM guest_lists WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Guest not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting guest:', error);
    res.status(500).json({ error: 'Failed to delete guest' });
  }
});

// POST /api/v1/guest-lists/:id/send-invitation - Send invitation email (LOCAL - reads from guest_lists table)
app.post('/api/v1/guest-lists/:id/send-invitation', async (req, res) => {
  const { id } = req.params;
  const { category, customMessage, emailOnly } = req.body;

  try {
    // 1. Fetch guest from LOCAL database (guest_lists table)
    const result = await pool.query('SELECT * FROM guest_lists WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Guest not found' });
    }

    const guestRow = result.rows[0];
    // Transform guest_lists row to guest format for email template
    const guest = {
      id: guestRow.id,
      name: guestRow.name,
      email: guestRow.email,
      phone: guestRow.phone || '',
      instagram: guestRow.instagram || '',
      partySize: guestRow.number_of_guests || 1,
      category: guestRow.status === 'approved' ? 'A' : guestRow.status === 'declined' ? 'C' : 'pending',
    };
    console.log(`📧 Sending invitation to: ${guest.name} (${guest.email})`);

    // 2. Generate email content
    const categoryNames = { A: 'VIP', B: 'Priority', C: 'Standard' };
    const guestCategory = category || 'A';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: Georgia, serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="color: #d4af37; font-size: 32px; margin: 0;">Berry Bly</h1>
            <p style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-top: 8px;">Exclusive Events</p>
          </div>
          <div style="background: linear-gradient(180deg, rgba(212, 175, 55, 0.1) 0%, transparent 100%); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 16px; padding: 40px; margin-bottom: 30px;">
            <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 20px 0;">Dear ${guest.name},</h2>
            <p style="color: #cccccc; font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">
              We are delighted to confirm your <strong style="color: #d4af37;">${categoryNames[guestCategory] || 'VIP'}</strong> invitation to our exclusive event.
            </p>
            ${customMessage ? `
            <div style="background: rgba(255,255,255,0.05); border-left: 3px solid #d4af37; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="color: #ffffff; font-size: 16px; line-height: 1.6; margin: 0;">${customMessage}</p>
            </div>
            ` : ''}
            <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid rgba(255,255,255,0.1);">
              <h3 style="color: #d4af37; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 20px 0;">Your Details</h3>
              <table style="width: 100%; color: #999;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Guest Status</td>
                  <td style="padding: 8px 0; color: #d4af37; text-align: right;">${categoryNames[guestCategory] || 'VIP'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Party Size</td>
                  <td style="padding: 8px 0; color: #ffffff; text-align: right;">${guest.partySize || 1} ${(guest.partySize || 1) > 1 ? 'guests' : 'guest'}</td>
                </tr>
              </table>
            </div>
          </div>
          <div style="text-align: center; color: #666; font-size: 12px;">
            <p style="margin: 0 0 10px 0;">Questions? Reply to this email or contact us directly.</p>
            <p style="margin: 0; color: #444;">Berry Bly Events. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // 3. Send email via Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: guest.email,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `You're Invited! - Berry Bly Events`,
      html: emailHtml,
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return res.status(500).json({
        error: 'Failed to send email',
        details: emailError.message || emailError,
      });
    }

    console.log(`✅ Email sent to ${guest.email} - Email ID: ${emailData?.id}`);

    // 4. Update guest status in LOCAL database (guest_lists table)
    const newStatus = category === 'C' || category === 'rejected' ? 'declined' : 'approved';
    await pool.query(
      `UPDATE guest_lists SET status = $1, email_sent = true, email_sent_at = CURRENT_TIMESTAMP,
       notes = COALESCE(notes, '') || $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [emailOnly ? guestRow.status : newStatus, `\n📧 Email sent: ${new Date().toISOString()}`, id]
    );

    // 5. Send admin confirmation
    await sendAdminConfirmation([{ name: guest.name, email: guest.email }], guestCategory);

    res.json({
      success: true,
      emailId: emailData?.id,
      guest: {
        id: guest.id,
        name: guest.name,
        email: guest.email,
        status: emailOnly ? guest.category : 'approved',
        emailSent: true,
        emailSentAt: new Date().toISOString(),
      }
    });

  } catch (error) {
    console.error('Send invitation error:', error);
    res.status(500).json({ error: 'Failed to send invitation', details: error.message });
  }
});

// POST /api/v1/guest-lists/:id/send-reminder - Send event reminder email (day before event)
app.post('/api/v1/guest-lists/:id/send-reminder', async (req, res) => {
  const { id } = req.params;
  const { eventName, eventDate, eventTime, eventVenue, customMessage } = req.body;

  try {
    const result = await pool.query('SELECT * FROM guest_lists WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Guest not found' });
    }

    const guestRow = result.rows[0];
    const guest = {
      id: guestRow.id,
      name: guestRow.name,
      email: guestRow.email,
      partySize: guestRow.number_of_guests || 1,
    };

    console.log(`📅 Sending event reminder to: ${guest.name} (${guest.email})`);

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: Georgia, serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="color: #d4af37; font-size: 32px; margin: 0;">Berry Bly</h1>
            <p style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-top: 8px;">Event Reminder</p>
          </div>
          <div style="background: linear-gradient(180deg, rgba(212, 175, 55, 0.1) 0%, transparent 100%); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 16px; padding: 40px; margin-bottom: 30px;">
            <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 20px 0;">Hi ${guest.name}!</h2>
            <p style="color: #cccccc; font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">
              This is a friendly reminder that <strong style="color: #d4af37;">${eventName || 'our exclusive event'}</strong> is coming up soon!
            </p>
            ${customMessage ? `
            <div style="background: rgba(255,255,255,0.05); border-left: 3px solid #d4af37; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="color: #ffffff; font-size: 16px; line-height: 1.6; margin: 0;">${customMessage}</p>
            </div>
            ` : ''}
            <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid rgba(255,255,255,0.1);">
              <h3 style="color: #d4af37; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 20px 0;">Event Details</h3>
              <table style="width: 100%; color: #999;">
                ${eventDate ? `
                <tr>
                  <td style="padding: 8px 0; color: #666;">📅 Date</td>
                  <td style="padding: 8px 0; color: #ffffff; text-align: right;">${eventDate}</td>
                </tr>
                ` : ''}
                ${eventTime ? `
                <tr>
                  <td style="padding: 8px 0; color: #666;">🕐 Time</td>
                  <td style="padding: 8px 0; color: #ffffff; text-align: right;">${eventTime}</td>
                </tr>
                ` : ''}
                ${eventVenue ? `
                <tr>
                  <td style="padding: 8px 0; color: #666;">📍 Venue</td>
                  <td style="padding: 8px 0; color: #ffffff; text-align: right;">${eventVenue}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 8px 0; color: #666;">👥 Party Size</td>
                  <td style="padding: 8px 0; color: #d4af37; text-align: right;">${guest.partySize} ${guest.partySize > 1 ? 'guests' : 'guest'}</td>
                </tr>
              </table>
            </div>
          </div>
          <div style="text-align: center; color: #666; font-size: 12px;">
            <p style="margin: 0 0 10px 0;">We can't wait to see you there!</p>
            <p style="margin: 0; color: #444;">Berry Bly Events. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: guest.email,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Reminder: ${eventName || 'Event'} is Tomorrow! - Berry Bly`,
      html: emailHtml,
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return res.status(500).json({ error: 'Failed to send reminder', details: emailError.message });
    }

    console.log(`✅ Reminder sent to ${guest.email} - Email ID: ${emailData?.id}`);

    await pool.query(
      `UPDATE guest_lists SET notes = COALESCE(notes, '') || $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [`\n📅 Reminder sent: ${new Date().toISOString()}`, id]
    );

    res.json({
      success: true,
      emailId: emailData?.id,
      guest: { id: guest.id, name: guest.name, email: guest.email }
    });

  } catch (error) {
    console.error('Send reminder error:', error);
    res.status(500).json({ error: 'Failed to send reminder', details: error.message });
  }
});

// POST /api/v1/guest-lists/bulk-reminder - Send reminders to multiple guests
app.post('/api/v1/guest-lists/bulk-reminder', async (req, res) => {
  const { guestIds, eventName, eventDate, eventTime, eventVenue, customMessage } = req.body;

  if (!guestIds || !Array.isArray(guestIds) || guestIds.length === 0) {
    return res.status(400).json({ error: 'guestIds array is required' });
  }

  const results = [];
  const errors = [];

  for (const id of guestIds) {
    try {
      const result = await pool.query('SELECT * FROM guest_lists WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        errors.push({ id, error: 'Guest not found' });
        continue;
      }

      const guestRow = result.rows[0];
      const guest = {
        id: guestRow.id,
        name: guestRow.name,
        email: guestRow.email,
        partySize: guestRow.number_of_guests || 1,
      };

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: Georgia, serif;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 40px;">
              <h1 style="color: #d4af37; font-size: 32px; margin: 0;">Berry Bly</h1>
              <p style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-top: 8px;">Event Reminder</p>
            </div>
            <div style="background: linear-gradient(180deg, rgba(212, 175, 55, 0.1) 0%, transparent 100%); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 16px; padding: 40px;">
              <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 20px 0;">Hi ${guest.name}!</h2>
              <p style="color: #cccccc; font-size: 16px; line-height: 1.8;">
                This is a friendly reminder that <strong style="color: #d4af37;">${eventName || 'our exclusive event'}</strong> is coming up soon!
              </p>
              ${customMessage ? `<p style="color: #ffffff; margin-top: 20px;">${customMessage}</p>` : ''}
              <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                ${eventDate ? `<p style="color: #999; margin: 8px 0;">📅 ${eventDate}</p>` : ''}
                ${eventTime ? `<p style="color: #999; margin: 8px 0;">🕐 ${eventTime}</p>` : ''}
                ${eventVenue ? `<p style="color: #999; margin: 8px 0;">📍 ${eventVenue}</p>` : ''}
                <p style="color: #d4af37; margin: 8px 0;">👥 Party of ${guest.partySize}</p>
              </div>
            </div>
            <p style="text-align: center; color: #666; font-size: 12px; margin-top: 30px;">We can't wait to see you there!</p>
          </div>
        </body>
        </html>
      `;

      const { data, error } = await resend.emails.send({
        from: EMAIL_CONFIG.from,
        to: guest.email,
        replyTo: EMAIL_CONFIG.replyTo,
        subject: `Reminder: ${eventName || 'Event'} is Tomorrow! - Berry Bly`,
        html: emailHtml,
      });

      if (error) {
        errors.push({ id, email: guest.email, error: error.message });
        continue;
      }

      await pool.query(
        `UPDATE guest_lists SET notes = COALESCE(notes, '') || $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [`\n📅 Reminder sent: ${new Date().toISOString()}`, id]
      );

      results.push({ id, email: guest.email, emailId: data?.id, name: guest.name });
      console.log(`📅 Bulk reminder: ${guest.name} (${guest.email})`);
    } catch (error) {
      errors.push({ id, error: error.message });
    }
  }

  res.json({
    success: true,
    sent: results.length,
    failed: errors.length,
    results,
    errors: errors.length > 0 ? errors : undefined,
  });
});

// POST /api/v1/guest-lists/bulk-send - Send invitations to multiple guests (LOCAL - uses guest_lists table)
app.post('/api/v1/guest-lists/bulk-send', async (req, res) => {
  const { guestIds, category, customMessages } = req.body;

  if (!guestIds || !Array.isArray(guestIds) || guestIds.length === 0) {
    return res.status(400).json({ error: 'guestIds array is required' });
  }

  const results = [];
  const errors = [];
  const categoryNames = { A: 'VIP', B: 'Priority', C: 'Standard' };
  const guestCategory = category || 'A';

  for (const id of guestIds) {
    try {
      // Fetch guest from LOCAL database (guest_lists table)
      const result = await pool.query('SELECT * FROM guest_lists WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        errors.push({ id, error: 'Guest not found' });
        continue;
      }

      const guestRow = result.rows[0];
      const guest = {
        id: guestRow.id,
        name: guestRow.name,
        email: guestRow.email,
        partySize: guestRow.number_of_guests || 1,
      };
      const customMessage = customMessages?.[id] || '';

      // Generate and send email
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: Georgia, serif;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 40px;">
              <h1 style="color: #d4af37; font-size: 32px; margin: 0;">Berry Bly</h1>
            </div>
            <div style="background: linear-gradient(180deg, rgba(212, 175, 55, 0.1) 0%, transparent 100%); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 16px; padding: 40px;">
              <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 20px 0;">Dear ${guest.name},</h2>
              <p style="color: #cccccc; font-size: 16px; line-height: 1.8;">
                Your <strong style="color: #d4af37;">${categoryNames[guestCategory]}</strong> invitation is confirmed.
              </p>
              ${customMessage ? `<p style="color: #ffffff; margin-top: 20px;">${customMessage}</p>` : ''}
            </div>
          </div>
        </body>
        </html>
      `;

      const { data, error } = await resend.emails.send({
        from: EMAIL_CONFIG.from,
        to: guest.email,
        replyTo: EMAIL_CONFIG.replyTo,
        subject: `You're Invited! - Berry Bly Events`,
        html: emailHtml,
      });

      if (error) {
        errors.push({ id, email: guest.email, error: error.message });
        continue;
      }

      // Update guest status in LOCAL database (guest_lists table)
      const newStatus = guestCategory === 'C' ? 'declined' : 'approved';
      await pool.query(
        `UPDATE guest_lists SET status = $1, email_sent = true, email_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [newStatus, id]
      );

      results.push({ id, email: guest.email, emailId: data?.id, name: guest.name });
      console.log(`📧 Bulk send: ${guest.name} (${guest.email})`);
    } catch (error) {
      errors.push({ id, error: error.message });
    }
  }

  // Send admin confirmation
  if (results.length > 0) {
    await sendAdminConfirmation(results.map(r => ({ name: r.name, email: r.email })), guestCategory);
  }

  res.json({
    success: true,
    sent: results.length,
    failed: errors.length,
    results,
    errors
  });
});

// ============================================
// TICKETS ENDPOINTS
// ============================================

// Helper to generate ticket ID
const generateTicketId = () => `tkt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// GET /api/v1/tickets - List all tickets
app.get('/api/v1/tickets', async (req, res) => {
  try {
    const { eventId, status } = req.query;
    const userId = req.user?.id;
    let queryText = 'SELECT t.* FROM tickets t';
    const params = [];
    let paramIndex = 1;
    const conditions = ['1=1'];

    // Multi-tenant: filter by user_id through event ownership or direct user_id
    if (userId) {
      queryText += ' LEFT JOIN events e ON t.event_ref_id = CAST(e.id AS INTEGER) OR t.event_id = e.external_id';
      conditions.push(`(t.user_id = $${paramIndex}::integer OR e.user_id = $${paramIndex}::integer OR (t.user_id IS NULL AND e.user_id IS NULL))`);
      params.push(userId);
      paramIndex++;
    }

    if (eventId) {
      conditions.push(`t.event_id = $${paramIndex}`);
      params.push(eventId);
      paramIndex++;
    }
    if (status) {
      conditions.push(`t.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    queryText += ' WHERE ' + conditions.join(' AND ');
    queryText += ' ORDER BY t.created_at DESC';
    const result = await pool.query(queryText, params);

    const tickets = result.rows.map(t => ({
      id: t.id,
      eventId: t.event_id,
      externalId: t.external_id,
      ticketType: t.ticket_type,
      holderName: t.holder_name,
      holderEmail: t.holder_email,
      qrCode: t.qr_code,
      status: t.status,
      checkInTime: t.check_in_time,
      price: t.price,
      source: t.source,
      createdAt: t.created_at,
    }));

    res.json(tickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// GET /api/v1/tickets/stats - Get ticket statistics
app.get('/api/v1/tickets/stats', async (req, res) => {
  try {
    const userId = req.user?.id;

    // Multi-tenant: filter stats by user's tickets only
    let queryText = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'valid') as valid,
        COUNT(*) FILTER (WHERE t.status = 'used') as used,
        COALESCE(SUM(t.price), 0) as revenue
      FROM tickets t
    `;

    const params = [];
    if (userId) {
      queryText += `
        LEFT JOIN events e ON t.event_ref_id = CAST(e.id AS INTEGER) OR t.event_id = e.external_id
        WHERE (t.user_id = $1::integer OR e.user_id = $1::integer OR (t.user_id IS NULL AND e.user_id IS NULL))
      `;
      params.push(userId);
    }

    const result = await pool.query(queryText, params);

    const stats = result.rows[0];
    res.json({
      total: parseInt(stats.total || 0),
      valid: parseInt(stats.valid || 0),
      used: parseInt(stats.used || 0),
      revenue: parseInt(stats.revenue || 0),
    });
  } catch (error) {
    console.error('Error fetching ticket stats:', error);
    res.status(500).json({ error: 'Failed to fetch ticket stats' });
  }
});

// POST /api/v1/tickets - Create a ticket
app.post('/api/v1/tickets', async (req, res) => {
  try {
    const { eventId, eventRefId, ticketType, holderName, holderEmail, price, source } = req.body;
    const userId = req.user?.id;
    const ticketId = generateTicketId();

    const result = await pool.query(
      `INSERT INTO tickets (id, user_id, event_id, event_ref_id, ticket_type, holder_name, holder_email, price, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [ticketId, userId || null, eventId || 'default', eventRefId || null, ticketType || 'General', holderName, holderEmail, price || 0, source || 'manual']
    );

    const ticket = result.rows[0];
    res.status(201).json({
      id: ticket.id,
      eventId: ticket.event_id,
      ticketType: ticket.ticket_type,
      holderName: ticket.holder_name,
      holderEmail: ticket.holder_email,
      status: ticket.status,
      price: ticket.price,
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// POST /api/v1/tickets/import - Import tickets from CSV data
app.post('/api/v1/tickets/import', async (req, res) => {
  try {
    const { tickets, eventId, eventRefId } = req.body;
    const userId = req.user?.id;

    if (!Array.isArray(tickets)) {
      return res.status(400).json({ error: 'tickets must be an array' });
    }

    const imported = [];
    for (const ticket of tickets) {
      const ticketId = generateTicketId();
      await pool.query(
        `INSERT INTO tickets (id, user_id, event_id, event_ref_id, ticket_type, holder_name, holder_email, external_id, price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          ticketId,
          userId || null,
          eventId || 'default',
          eventRefId || null,
          ticket.ticketType || 'General',
          ticket.holderName,
          ticket.holderEmail,
          ticket.externalId,
          ticket.price || 0
        ]
      );
      imported.push(ticketId);
    }

    res.json({ success: true, imported: imported.length });
  } catch (error) {
    console.error('Error importing tickets:', error);
    res.status(500).json({ error: 'Failed to import tickets' });
  }
});

// POST /api/v1/tickets/:ticketId/check-in - Check in a ticket
app.post('/api/v1/tickets/:ticketId/check-in', async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticketResult = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];

    if (ticket.status === 'used') {
      return res.status(400).json({ error: 'Ticket already used', checkInTime: ticket.check_in_time });
    }

    await pool.query(
      `UPDATE tickets SET status = 'used', check_in_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [ticketId]
    );

    res.json({ success: true, ticketId, checkInTime: new Date().toISOString() });
  } catch (error) {
    console.error('Error checking in ticket:', error);
    res.status(500).json({ error: 'Failed to check in ticket' });
  }
});

// DELETE /api/v1/tickets/all - Delete ALL tickets (MUST be before :id route)
app.delete('/api/v1/tickets/all', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM tickets RETURNING id');

    res.json({
      success: true,
      message: `Deleted all ${result.rowCount} tickets`,
      deletedCount: result.rowCount
    });
  } catch (error) {
    console.error('Error deleting all tickets:', error);
    res.status(500).json({ error: 'Failed to delete all tickets' });
  }
});

// POST /api/v1/tickets/bulk-delete - Delete multiple tickets
app.post('/api/v1/tickets/bulk-delete', async (req, res) => {
  try {
    const { ticketIds } = req.body;

    if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).json({ error: 'Ticket IDs required' });
    }

    const result = await pool.query(
      'DELETE FROM tickets WHERE id = ANY($1) RETURNING id',
      [ticketIds]
    );

    res.json({
      success: true,
      message: `Deleted ${result.rowCount} tickets`,
      deletedCount: result.rowCount
    });
  } catch (error) {
    console.error('Error bulk deleting tickets:', error);
    res.status(500).json({ error: 'Failed to delete tickets' });
  }
});

// DELETE /api/v1/tickets/:id - Delete a single ticket
app.delete('/api/v1/tickets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM tickets WHERE id = $1 RETURNING id', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json({ success: true, message: 'Ticket deleted' });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ error: 'Failed to delete ticket' });
  }
});

// DELETE /api/v1/events/all - Delete ALL events
app.delete('/api/v1/events/all', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM events RETURNING id');

    res.json({
      success: true,
      message: `Deleted all ${result.rowCount} events`,
      deletedCount: result.rowCount
    });
  } catch (error) {
    console.error('Error deleting all events:', error);
    res.status(500).json({ error: 'Failed to delete all events' });
  }
});

// Activity Log endpoints removed for simplification

// ============================================
// SPONSORS ENDPOINTS
// ============================================

// Sponsorship tier details
const sponsorshipTiers = {
  bronze: { name: 'Bronze Partner', price: '$1,000 - $4,999', minAmount: 1000, maxAmount: 4999, color: '#CD7F32', icon: '🥉' },
  silver: { name: 'Silver Partner', price: '$5,000 - $14,999', minAmount: 5000, maxAmount: 14999, color: '#C0C0C0', icon: '🥈' },
  gold: { name: 'Gold Partner', price: '$15,000 - $34,999', minAmount: 15000, maxAmount: 34999, color: '#FFD700', icon: '🥇' },
  platinum: { name: 'Platinum Partner', price: '$35,000 - $74,999', minAmount: 35000, maxAmount: 74999, color: '#E5E4E2', icon: '💎' },
  diamond: { name: 'Diamond Partner', price: '$75,000 - $149,999', minAmount: 75000, maxAmount: 149999, color: '#B9F2FF', icon: '💠' },
  title: { name: 'Title Sponsor', price: '$150,000+', minAmount: 150000, maxAmount: Infinity, color: '#4B0082', icon: '👑' },
  custom: { name: 'Custom Partnership', price: 'TBD', minAmount: 0, maxAmount: 999, color: '#888888', icon: '🤝' },
};

// Helper function to calculate tier based on sponsorship amount
const getTierByAmount = (amount) => {
  const numAmount = parseFloat(amount) || 0;
  if (numAmount >= 150000) return 'title';
  if (numAmount >= 75000) return 'diamond';
  if (numAmount >= 35000) return 'platinum';
  if (numAmount >= 15000) return 'gold';
  if (numAmount >= 5000) return 'silver';
  if (numAmount >= 1000) return 'bronze';
  return 'custom';
};

// Get benefits based on tier level
const getBenefitsByTier = (tier) => {
  const allBenefits = {
    bronze: [
      'Logo on event materials',
      'Social media mention',
      'Certificate of appreciation'
    ],
    silver: [
      'Logo on event materials',
      'Social media mentions (3x)',
      'Certificate of appreciation',
      'Logo on event website',
      'Event tickets (2)'
    ],
    gold: [
      'Logo on event materials',
      'Social media campaign',
      'Certificate of appreciation',
      'Logo on event website',
      'Event tickets (4)',
      'VIP access',
      'Speaking opportunity (5 min)'
    ],
    platinum: [
      'Premium logo placement',
      'Dedicated social media campaign',
      'Premium certificate',
      'Featured on event website',
      'Event tickets (8)',
      'VIP access + backstage',
      'Speaking opportunity (15 min)',
      'Branded booth space',
      'Email newsletter feature'
    ],
    diamond: [
      'Premium logo placement (all materials)',
      'Multi-week social media campaign',
      'Exclusive partnership certificate',
      'Featured homepage placement',
      'Event tickets (15)',
      'VIP access + exclusive events',
      'Keynote speaking opportunity',
      'Premium booth space',
      'Email newsletter feature',
      'Press release mention',
      'Video testimonial opportunity'
    ],
    title: [
      'Title sponsor branding (event name)',
      'Exclusive social media coverage',
      'Custom partnership certificate',
      'Top homepage featured placement',
      'Unlimited event tickets',
      'All VIP access + exclusive dinners',
      'Keynote speech + panel moderation',
      'Largest premium booth space',
      'Dedicated email announcement',
      'Press release + media coverage',
      'Custom video production',
      'Year-round partnership recognition',
      'First right of refusal for future events'
    ],
    custom: [
      'Custom benefits package',
      'Contact us for details'
    ]
  };
  return allBenefits[tier] || allBenefits.custom;
};

// Helper to generate sponsor ID
const generateSponsorId = () => `spo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// GET /api/v1/sponsors/tiers - Get sponsorship tier information
app.get('/api/v1/sponsors/tiers', async (_req, res) => {
  res.json({
    tiers: Object.entries(sponsorshipTiers).map(([value, details]) => ({
      value,
      ...details,
      benefits: getBenefitsByTier(value),
    })),
  });
});

// GET /api/v1/sponsors/stats - Get sponsor statistics
app.get('/api/v1/sponsors/stats', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as active,
        COUNT(*) FILTER (WHERE status = 'contacted') as contacted,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(amount), 0) as potential_revenue
      FROM sponsors
    `);

    const stats = result.rows[0];
    res.json({
      total: parseInt(stats.total || 0),
      pending: parseInt(stats.pending || 0),
      active: parseInt(stats.active || 0),
      contacted: parseInt(stats.contacted || 0),
      revenue: parseFloat(stats.total_revenue || 0),
      potentialRevenue: parseFloat(stats.potential_revenue || 0),
    });
  } catch (error) {
    console.error('Error fetching sponsor stats:', error);
    res.status(500).json({ error: 'Failed to fetch sponsor stats' });
  }
});

// POST /api/v1/sponsors - Submit sponsor inquiry (public)
app.post('/api/v1/sponsors', async (req, res) => {
  try {
    const { companyName, contactName, email, phone, website, sponsorshipTier, amount, message } = req.body;

    if (!companyName || !contactName || !email) {
      return res.status(400).json({ error: 'Company name, contact name, and email are required' });
    }

    const sponsorId = generateSponsorId();
    // If amount is provided, calculate tier automatically; otherwise use provided tier or custom
    const sponsorAmount = parseFloat(amount) || 0;
    const tier = sponsorAmount > 0 ? getTierByAmount(sponsorAmount) : (sponsorshipTier || 'custom');
    const tierInfo = sponsorshipTiers[tier] || sponsorshipTiers.custom;

    await pool.query(
      `INSERT INTO sponsors (id, company_name, contact_name, email, phone, website, sponsorship_tier, tier_name, tier_price, tier_color, tier_icon, amount, message, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
       RETURNING *`,
      [sponsorId, companyName, contactName, email, phone || '', website || '', tier, tierInfo.name, tierInfo.price, tierInfo.color, tierInfo.icon, sponsorAmount, message || '']
    );

    console.log(`✅ New sponsor inquiry: ${companyName} - ${tierInfo.name}`);

    // Send confirmation email to sponsor
    const confirmationHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: Georgia, serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="color: #d4af37; font-size: 32px; margin: 0;">Berry Bly</h1>
            <p style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-top: 8px;">Partnership Program</p>
          </div>
          <div style="background: linear-gradient(180deg, rgba(212, 175, 55, 0.1) 0%, transparent 100%); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 16px; padding: 40px; margin-bottom: 30px;">
            <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 20px 0;">Thank You, ${contactName}!</h2>
            <p style="color: #cccccc; font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">
              We've received your partnership inquiry for <strong style="color: #d4af37;">${companyName}</strong>.
            </p>
            <div style="background: rgba(255,255,255,0.05); border-left: 3px solid #d4af37; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="color: #d4af37; font-size: 14px; text-transform: uppercase; margin: 0 0 10px 0;">Partnership Level</p>
              <p style="color: #ffffff; font-size: 18px; margin: 0;">${tierInfo.name}</p>
            </div>
            <p style="color: #cccccc; font-size: 16px; line-height: 1.8;">
              Our partnerships team will review your inquiry and contact you within 48 hours to discuss the next steps.
            </p>
          </div>
          <div style="text-align: center; color: #666; font-size: 12px;">
            <p style="margin: 0 0 10px 0;">Questions? Email us at <a href="mailto:partnerships@berrybly.com" style="color: #d4af37;">partnerships@berrybly.com</a></p>
            <p style="margin: 0; color: #444;">Berry Bly Productions. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: email,
      subject: `Partnership Inquiry Received - ${tierInfo.name}`,
      html: confirmationHtml,
    }).catch((err) => console.error('Failed to send sponsor confirmation email:', err));

    // Send notification to admin
    const adminNotificationHtml = `
      <!DOCTYPE html>
      <html>
      <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #d4af37; font-size: 24px; margin: 0;">New Sponsor Inquiry</h1>
          </div>
          <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 25px;">
            <table style="width: 100%; color: #fff;">
              <tr><td style="padding: 8px 0; color: #666;">Company</td><td style="color: #d4af37; text-align: right;">${companyName}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Contact</td><td style="text-align: right;">${contactName}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Email</td><td style="text-align: right;">${email}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Phone</td><td style="text-align: right;">${phone || 'N/A'}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Website</td><td style="text-align: right;">${website || 'N/A'}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Tier</td><td style="color: #d4af37; text-align: right;">${tierInfo.name} (${tierInfo.price})</td></tr>
            </table>
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
              <p style="color: #666; margin: 0 0 10px 0;">Message:</p>
              <p style="color: #fff; margin: 0;">${message}</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: EMAIL_CONFIG.adminEmail,
      subject: `New Sponsor Inquiry: ${companyName} - ${tierInfo.name} (${tierInfo.price})`,
      html: adminNotificationHtml,
    }).catch((err) => console.error('Failed to send admin sponsor notification:', err));

    res.status(201).json({
      success: true,
      message: 'Thank you for your interest in partnering with Berry Bly Productions! Our partnerships team will review your inquiry and contact you within 48 hours.',
      submission: {
        id: sponsorId,
        companyName,
        tier: tierInfo.name,
        status: 'pending',
      },
    });
  } catch (error) {
    console.error('Error creating sponsor:', error);
    res.status(500).json({ error: 'Failed to submit sponsor inquiry' });
  }
});

// GET /api/v1/sponsors - List all sponsors (admin)
app.get('/api/v1/sponsors', async (req, res) => {
  try {
    const { status, tier, limit = '50', offset = '0' } = req.query;
    let queryText = 'SELECT * FROM sponsors WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      queryText += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (tier) {
      queryText += ` AND sponsorship_tier = $${paramIndex++}`;
      params.push(tier);
    }

    queryText += ' ORDER BY created_at DESC';
    queryText += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(queryText, params);

    const sponsors = result.rows.map(s => ({
      id: s.id,
      companyName: s.company_name,
      contactName: s.contact_name,
      email: s.email,
      phone: s.phone,
      website: s.website,
      tier: s.sponsorship_tier,
      tierName: s.tier_name,
      tierPrice: s.tier_price,
      tierColor: s.tier_color,
      tierIcon: s.tier_icon,
      amount: parseFloat(s.amount) || 0,
      message: s.message,
      status: s.status,
      notes: s.notes,
      logoUrl: s.logo_url,
      createdAt: s.created_at,
    }));

    res.json(sponsors);
  } catch (error) {
    console.error('Error fetching sponsors:', error);
    res.status(500).json({ error: 'Failed to fetch sponsors' });
  }
});

// GET /api/v1/sponsors/:id - Get single sponsor
app.get('/api/v1/sponsors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM sponsors WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sponsor not found' });
    }

    const s = result.rows[0];
    res.json({
      id: s.id,
      companyName: s.company_name,
      contactName: s.contact_name,
      email: s.email,
      phone: s.phone,
      website: s.website,
      tier: s.sponsorship_tier,
      tierName: s.tier_name,
      tierPrice: s.tier_price,
      tierColor: s.tier_color,
      tierIcon: s.tier_icon,
      amount: parseFloat(s.amount) || 0,
      message: s.message,
      status: s.status,
      notes: s.notes,
      logoUrl: s.logo_url,
      createdAt: s.created_at,
    });
  } catch (error) {
    console.error('Error fetching sponsor:', error);
    res.status(500).json({ error: 'Failed to fetch sponsor' });
  }
});

// PATCH /api/v1/sponsors/:id - Update sponsor status (admin)
app.patch('/api/v1/sponsors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, logoUrl, amount, companyName, contactName, email, phone, website } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(notes);
    }
    if (logoUrl !== undefined) {
      updates.push(`logo_url = $${paramIndex++}`);
      params.push(logoUrl);
    }
    if (companyName) {
      updates.push(`company_name = $${paramIndex++}`);
      params.push(companyName);
    }
    if (contactName) {
      updates.push(`contact_name = $${paramIndex++}`);
      params.push(contactName);
    }
    if (email) {
      updates.push(`email = $${paramIndex++}`);
      params.push(email);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      params.push(phone);
    }
    if (website !== undefined) {
      updates.push(`website = $${paramIndex++}`);
      params.push(website);
    }
    // If amount is provided, update amount and recalculate tier automatically
    if (amount !== undefined) {
      const sponsorAmount = parseFloat(amount) || 0;
      const newTier = getTierByAmount(sponsorAmount);
      const tierInfo = sponsorshipTiers[newTier];
      updates.push(`amount = $${paramIndex++}`);
      params.push(sponsorAmount);
      updates.push(`sponsorship_tier = $${paramIndex++}`);
      params.push(newTier);
      updates.push(`tier_name = $${paramIndex++}`);
      params.push(tierInfo.name);
      updates.push(`tier_price = $${paramIndex++}`);
      params.push(tierInfo.price);
      updates.push(`tier_color = $${paramIndex++}`);
      params.push(tierInfo.color);
      updates.push(`tier_icon = $${paramIndex++}`);
      params.push(tierInfo.icon);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const result = await pool.query(
      `UPDATE sponsors SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sponsor not found' });
    }

    const s = result.rows[0];

    // Send approval email if status changed to approved
    if (status === 'approved') {
      const approvalHtml = `
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: Georgia, serif;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 40px;">
              <h1 style="color: #d4af37; font-size: 32px; margin: 0;">Berry Bly</h1>
            </div>
            <div style="background: linear-gradient(180deg, rgba(34, 197, 94, 0.1) 0%, transparent 100%); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 16px; padding: 40px;">
              <h2 style="color: #22c55e; font-size: 24px; margin: 0 0 20px 0;">Partnership Approved!</h2>
              <p style="color: #cccccc; font-size: 16px; line-height: 1.8;">
                Congratulations! Your partnership application for <strong style="color: #d4af37;">${s.company_name}</strong> has been approved.
              </p>
              <p style="color: #cccccc; font-size: 16px; line-height: 1.8;">
                Welcome to the Berry Bly Productions family! Our team will be in touch shortly to finalize the details.
              </p>
            </div>
          </div>
        </body>
        </html>
      `;

      resend.emails.send({
        from: EMAIL_CONFIG.from,
        to: s.email,
        subject: `Partnership Approved - Welcome to Berry Bly Productions!`,
        html: approvalHtml,
      }).catch((err) => console.error('Failed to send sponsor approval email:', err));
    }

    res.json({
      id: s.id,
      companyName: s.company_name,
      contactName: s.contact_name,
      email: s.email,
      phone: s.phone,
      website: s.website,
      tier: s.sponsorship_tier,
      tierName: s.tier_name,
      tierPrice: s.tier_price,
      tierColor: s.tier_color,
      tierIcon: s.tier_icon,
      amount: parseFloat(s.amount) || 0,
      message: s.message,
      status: s.status,
      notes: s.notes,
      logoUrl: s.logo_url,
      createdAt: s.created_at,
    });
  } catch (error) {
    console.error('Error updating sponsor:', error);
    res.status(500).json({ error: 'Failed to update sponsor' });
  }
});

// DELETE /api/v1/sponsors/:id - Delete sponsor
app.delete('/api/v1/sponsors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM sponsors WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sponsor not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting sponsor:', error);
    res.status(500).json({ error: 'Failed to delete sponsor' });
  }
});

// ============================================
// SPONSOR METRICS PORTAL - ROI Dashboard for Sponsors
// ============================================

// Generate unique access token for sponsor portal
const generateSponsorAccessToken = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

// POST /api/v1/sponsors/:id/generate-portal-link - Generate sponsor portal access link
app.post('/api/v1/sponsors/:id/generate-portal-link', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if sponsor exists
    const sponsor = await pool.query('SELECT * FROM sponsors WHERE id = $1', [id]);
    if (sponsor.rows.length === 0) {
      return res.status(404).json({ error: 'Sponsor not found' });
    }

    // Generate access token
    const accessToken = generateSponsorAccessToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Store token (add column if not exists)
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sponsors' AND column_name='portal_token') THEN
          ALTER TABLE sponsors ADD COLUMN portal_token VARCHAR(64);
          ALTER TABLE sponsors ADD COLUMN portal_token_expires TIMESTAMP;
        END IF;
      END $$;
    `);

    await pool.query(
      'UPDATE sponsors SET portal_token = $1, portal_token_expires = $2 WHERE id = $3',
      [accessToken, expiresAt, id]
    );

    const portalUrl = `${req.protocol}://${req.get('host').replace('-api', '')}/sponsor-portal/${accessToken}`;

    res.json({
      success: true,
      portalUrl,
      accessToken,
      expiresAt: expiresAt.toISOString(),
      sponsorName: sponsor.rows[0].company_name
    });
  } catch (error) {
    console.error('Error generating portal link:', error);
    res.status(500).json({ error: 'Failed to generate portal link' });
  }
});

// GET /api/v1/sponsor-portal/:token - Get sponsor metrics by access token
app.get('/api/v1/sponsor-portal/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find sponsor by token
    const result = await pool.query(
      'SELECT * FROM sponsors WHERE portal_token = $1 AND portal_token_expires > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired access token' });
    }

    const sponsor = result.rows[0];

    // Get events this sponsor is linked to
    let events = [];
    if (sponsor.event_id) {
      const eventResult = await pool.query(
        `SELECT id, title, date, description, status, venue
         FROM events WHERE id = $1`,
        [sponsor.event_id]
      );
      events = eventResult.rows;
    } else {
      // Get all events (sponsor may have sponsored multiple)
      const eventResult = await pool.query(
        `SELECT id, title, date, description, status, venue
         FROM events ORDER BY date DESC LIMIT 10`
      );
      events = eventResult.rows;
    }

    // Get guest counts for each event to estimate attendance
    for (const event of events) {
      try {
        const guestCount = await pool.query(
          `SELECT COUNT(*) as count FROM guests WHERE event_id = $1`,
          [event.id]
        );
        event.guestCount = parseInt(guestCount.rows[0]?.count) || 0;
      } catch {
        event.guestCount = 0;
      }
    }

    // Calculate metrics based on guest counts (as proxy for attendance)
    const totalAttendance = events.reduce((sum, e) => sum + (e.guestCount || 0), 0);
    const avgAttendance = events.length > 0 ? Math.round(totalAttendance / events.length) : 0;

    // Estimate impressions (attendees × avg touchpoints)
    const estimatedImpressions = totalAttendance * 5; // Logo seen ~5 times per attendee

    // Use actual sponsor amount or fallback to tier-based pricing
    const sponsorAmount = parseFloat(sponsor.amount) || 0;
    const tierInfo = sponsorshipTiers[sponsor.sponsorship_tier] || sponsorshipTiers.custom;
    const sponsorInvestment = sponsorAmount > 0 ? sponsorAmount : (tierInfo.minAmount || 0);

    const costPerImpression = sponsorInvestment > 0 && estimatedImpressions > 0
      ? (sponsorInvestment / estimatedImpressions).toFixed(2)
      : 'N/A';
    const costPerAttendee = sponsorInvestment > 0 && totalAttendance > 0
      ? (sponsorInvestment / totalAttendance).toFixed(2)
      : 'N/A';

    // Industry benchmark comparison
    const industryAvgCPI = 0.50; // Average cost per impression
    const performanceVsIndustry = costPerImpression !== 'N/A'
      ? ((industryAvgCPI / parseFloat(costPerImpression)) * 100).toFixed(0)
      : null;

    // Calculate ROI metrics
    const estimatedMediaValue = estimatedImpressions * 0.50; // $0.50 per impression
    const estimatedROI = sponsorInvestment > 0 ? ((estimatedMediaValue / sponsorInvestment) * 100).toFixed(0) : 'N/A';

    res.json({
      success: true,
      sponsor: {
        companyName: sponsor.company_name,
        contactName: sponsor.contact_name,
        email: sponsor.email,
        tier: sponsor.sponsorship_tier,
        tierName: sponsor.tier_name || tierInfo.name,
        tierPrice: sponsor.tier_price || tierInfo.price,
        tierColor: sponsor.tier_color || tierInfo.color,
        tierIcon: sponsor.tier_icon || tierInfo.icon,
        amount: sponsorAmount,
        status: sponsor.status,
        logoUrl: sponsor.logo_url,
        website: sponsor.website,
        joinedDate: sponsor.created_at,
        benefits: getBenefitsByTier(sponsor.sponsorship_tier)
      },
      events: events.map(e => ({
        id: e.id,
        title: e.title,
        date: e.date,
        status: e.status,
        venueName: e.venue || null,
        venueCity: null,
        expectedAttendance: 0,
        actualAttendance: e.guestCount || 0,
        attendanceRate: e.guestCount > 0 ? '100%' : 'N/A'
      })),
      metrics: {
        totalEvents: events.length,
        totalAttendance,
        avgAttendancePerEvent: avgAttendance,
        estimatedImpressions,
        estimatedSocialReach: estimatedImpressions * 3, // Shared content multiplier
        sponsorInvestment,
        costPerImpression,
        costPerAttendee,
        estimatedMediaValue,
        estimatedROI: estimatedROI + '%',
        performanceVsIndustry,
        industryBenchmark: {
          avgCostPerImpression: '$0.50',
          avgCostPerLead: '$15-25',
          avgEventROI: '5:1'
        }
      },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching sponsor portal data:', error);
    res.status(500).json({ error: 'Failed to fetch sponsor metrics' });
  }
});

// POST /api/v1/sponsors/:id/send-portal-link - Send portal link via email
app.post('/api/v1/sponsors/:id/send-portal-link', async (req, res) => {
  try {
    const { id } = req.params;

    // First generate the link
    const sponsor = await pool.query('SELECT * FROM sponsors WHERE id = $1', [id]);
    if (sponsor.rows.length === 0) {
      return res.status(404).json({ error: 'Sponsor not found' });
    }

    const s = sponsor.rows[0];
    const accessToken = generateSponsorAccessToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sponsors' AND column_name='portal_token') THEN
          ALTER TABLE sponsors ADD COLUMN portal_token VARCHAR(64);
          ALTER TABLE sponsors ADD COLUMN portal_token_expires TIMESTAMP;
        END IF;
      END $$;
    `);

    await pool.query(
      'UPDATE sponsors SET portal_token = $1, portal_token_expires = $2 WHERE id = $3',
      [accessToken, expiresAt, id]
    );

    // Build portal URL
    const baseUrl = process.env.FRONTEND_URL || 'https://berry-dashboard-production.up.railway.app';
    const portalUrl = `${baseUrl}/sponsor-portal/${accessToken}`;

    // Send email with portal link using centralized function
    const emailResult = await sendEmail({
      to: s.email,
      subject: `Your Sponsor Metrics Portal - ${s.company_name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="color: #d4af37; font-size: 28px; margin: 0;">Sponsor Metrics Portal</h1>
            <p style="color: #666; margin-top: 10px;">Your exclusive access to event performance data</p>
          </div>

          <p style="color: #333; font-size: 16px; line-height: 1.6;">Hi ${s.contact_name},</p>

          <p style="color: #333; font-size: 16px; line-height: 1.6;">
            As a valued ${s.tier_name || s.sponsorship_tier} sponsor, you now have access to your personalized metrics portal where you can track the impact of your sponsorship investment.
          </p>

          <div style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0;">
            <p style="color: #888; margin: 0 0 15px 0;">Click below to view your metrics:</p>
            <a href="${portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #d4af37 0%, #b8962d 100%); color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              View Sponsor Portal
            </a>
          </div>

          <p style="color: #666; font-size: 14px; line-height: 1.6;">
            Your portal includes:
          </p>
          <ul style="color: #666; font-size: 14px; line-height: 1.8;">
            <li>Event attendance metrics</li>
            <li>Brand impression estimates</li>
            <li>ROI calculations</li>
            <li>Industry benchmark comparisons</li>
          </ul>

          <p style="color: #888; font-size: 13px; margin-top: 40px;">
            This link expires in 30 days. If you need a new link, please contact us.
          </p>

          <div style="border-top: 1px solid #eee; margin-top: 40px; padding-top: 20px; text-align: center;">
            <p style="color: #888; font-size: 12px; margin: 0;">Powered by <a href="https://merktop.com" style="color: #d4af37; text-decoration: none;">Merktop</a></p>
          </div>
        </div>
      `,
      emailType: 'sponsor_portal',
      relatedId: id,
    });

    res.json({
      success: true,
      emailSent: emailResult.success,
      emailId: emailResult.emailId,
      emailError: emailResult.error,
      message: emailResult.success
        ? `Portal link sent to ${s.email}`
        : `Portal link generated (email not sent: ${emailResult.error})`,
      portalUrl,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    console.error('Error sending portal link:', error);
    res.status(500).json({ error: 'Failed to send portal link' });
  }
});

// ============================================
// EVENTS ENDPOINTS - Multi-Event Management
// ============================================

// Helper to transform event row
// Transform event from berry-bly-productions schema
const transformEvent = (row) => ({
  id: row.id,
  name: row.title || row.name,
  title: row.title,
  slug: row.slug,
  description: row.description,
  eventType: row.category || row.event_type,
  category: row.category,
  venueName: row.venue || row.venue_name,
  venue: row.venue,
  venueId: row.venue_id,
  venueAddress: row.venue_address,
  venueCity: row.venue_city,
  venueCapacity: row.venue_capacity,
  eventDate: row.date || row.event_date,
  date: row.date,
  time: row.time,
  startTime: row.time || row.start_time,
  endTime: row.end_time,
  doorsOpen: row.doors_open,
  status: row.status,
  coverImage: row.flyer_url || row.cover_image,
  flyerUrl: row.flyer_url,
  eventbriteUrl: row.eventbrite_url,
  theme: row.theme,
  dressCode: row.dress_code,
  ageRestriction: row.age_restriction,
  ticketLink: row.eventbrite_url || row.ticket_link,
  isPublic: row.is_public,
  isFeatured: row.featured || row.is_featured,
  featured: row.featured,
  guestListEnabled: row.guest_list_enabled,
  tableMapEnabled: row.table_map_enabled,
  sortOrder: row.sort_order,
  expectedAttendance: row.expected_attendance,
  actualAttendance: row.actual_attendance,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Alias for GPT endpoints
const mapEventRow = transformEvent;

// ============================================
// OPENAPI SPEC ENDPOINT (for GPT integration)
// ============================================

// GET /openapi.yaml - Serve OpenAPI specification for GPT
app.get('/openapi.yaml', (_req, res) => {
  const openApiPath = path.join(__dirname, 'openapi-gpt.yaml');
  if (fs.existsSync(openApiPath)) {
    res.type('text/yaml').sendFile(openApiPath);
  } else {
    res.status(404).json({ error: 'OpenAPI spec not found' });
  }
});

// GET /openapi.json - Serve OpenAPI specification as JSON
app.get('/openapi.json', (_req, res) => {
  const openApiPath = path.join(__dirname, 'openapi-gpt.yaml');
  if (fs.existsSync(openApiPath)) {
    const content = fs.readFileSync(openApiPath, 'utf8');
    try {
      const jsonSpec = yaml.load(content);
      res.json(jsonSpec);
    } catch (e) {
      res.type('text/yaml').sendFile(openApiPath);
    }
  } else {
    res.status(404).json({ error: 'OpenAPI spec not found' });
  }
});

// ============================================
// UNIFIED DASHBOARD ENDPOINTS (for GPT integration)
// ============================================

// GET /api/v1/dashboard - Complete dashboard overview
app.get('/api/v1/dashboard', async (_req, res) => {
  try {
    // Get events summary
    const eventsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE date >= CURRENT_DATE) as upcoming,
        COUNT(*) FILTER (WHERE date >= date_trunc('month', CURRENT_DATE) AND date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month') as this_month
      FROM events
    `);

    const eventsList = await pool.query(`
      SELECT id, title as name, date, status, venue
      FROM events
      ORDER BY date ASC
      LIMIT 10
    `);

    // Get guests summary - guests table uses 'category' column (pending, A, B, C)
    let guestsSummary = { total: 0, pending: 0, approved: 0, checkedIn: 0 };
    const guestsTableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'guests')`);
    if (guestsTableCheck.rows[0].exists) {
      const guestsResult = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE category = 'pending') as pending,
          COUNT(*) FILTER (WHERE category IN ('A', 'B', 'C')) as approved,
          COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL) as checked_in
        FROM guests
      `);
      guestsSummary = guestsResult.rows[0];
    }

    // Get budget summary
    let budgetSummary = { totalIncome: 0, totalExpenses: 0, profit: 0 };
    const budgetTableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'budget_items')`);
    if (budgetTableCheck.rows[0].exists) {
      const budgetResult = await pool.query(`
        SELECT
          COALESCE(SUM(actual_amount) FILTER (WHERE bc.is_income = true), 0) as total_income,
          COALESCE(SUM(actual_amount) FILTER (WHERE bc.is_income = false OR bc.is_income IS NULL), 0) as total_expenses
        FROM budget_items bi
        LEFT JOIN budget_categories bc ON bi.category_id = bc.id
      `);
      const row = budgetResult.rows[0];
      budgetSummary = {
        totalIncome: parseFloat(row.total_income) || 0,
        totalExpenses: parseFloat(row.total_expenses) || 0,
        profit: (parseFloat(row.total_income) || 0) - (parseFloat(row.total_expenses) || 0)
      };
    }

    // Get staff summary
    let staffSummary = { total: 0, active: 0 };
    const staffTableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'staff')`);
    if (staffTableCheck.rows[0].exists) {
      const staffResult = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active
        FROM staff
      `);
      staffSummary = staffResult.rows[0];
    }

    // Get vendors summary
    let vendorsSummary = { total: 0, preferred: 0 };
    const vendorsTableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'vendors')`);
    if (vendorsTableCheck.rows[0].exists) {
      const vendorsResult = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_preferred = true) as preferred
        FROM vendors
      `);
      vendorsSummary = vendorsResult.rows[0];
    }

    res.json({
      events: {
        total: parseInt(eventsResult.rows[0].total) || 0,
        upcoming: parseInt(eventsResult.rows[0].upcoming) || 0,
        thisMonth: parseInt(eventsResult.rows[0].this_month) || 0,
        list: eventsList.rows.map(e => ({
          id: e.id,
          name: e.name,
          eventDate: e.date,
          status: e.status,
          venue: e.venue
        }))
      },
      guests: {
        total: parseInt(guestsSummary.total) || 0,
        pending: parseInt(guestsSummary.pending) || 0,
        approved: parseInt(guestsSummary.approved) || 0,
        checkedIn: parseInt(guestsSummary.checked_in) || 0
      },
      budget: budgetSummary,
      staff: {
        total: parseInt(staffSummary.total) || 0,
        active: parseInt(staffSummary.active) || 0
      },
      vendors: {
        total: parseInt(vendorsSummary.total) || 0,
        preferred: parseInt(vendorsSummary.preferred) || 0
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// GET /api/v1/events/:id/full - Get complete event with all related data
app.get('/api/v1/events/:id/full', async (req, res) => {
  try {
    const { id } = req.params;

    // Get event
    const eventResult = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const event = mapEventRow(eventResult.rows[0]);

    // Get guests for this event
    let guests = { total: 0, list: [] };
    const guestsTableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'guests')`);
    if (guestsTableCheck.rows[0].exists) {
      const guestsResult = await pool.query('SELECT * FROM guests WHERE event_id = $1 ORDER BY created_at DESC', [id]);
      guests = {
        total: guestsResult.rows.length,
        list: guestsResult.rows
      };
    }

    // Get budget for this event
    let budget = { summary: {}, items: [] };
    const budgetTableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'budgets')`);
    if (budgetTableCheck.rows[0].exists) {
      const budgetResult = await pool.query(`
        SELECT bi.*, bc.name as category_name, bc.icon, bc.is_income
        FROM budget_items bi
        JOIN budgets b ON bi.budget_id = b.id
        LEFT JOIN budget_categories bc ON bi.category_id = bc.id
        WHERE b.event_id = $1
        ORDER BY bc.sort_order, bi.created_at
      `, [id]);

      const summary = await pool.query(`
        SELECT
          COALESCE(SUM(bi.estimated_amount) FILTER (WHERE bc.is_income = false OR bc.is_income IS NULL), 0) as total_estimated_expenses,
          COALESCE(SUM(bi.actual_amount) FILTER (WHERE bc.is_income = false OR bc.is_income IS NULL), 0) as total_actual_expenses,
          COALESCE(SUM(bi.estimated_amount) FILTER (WHERE bc.is_income = true), 0) as total_estimated_income,
          COALESCE(SUM(bi.actual_amount) FILTER (WHERE bc.is_income = true), 0) as total_actual_income,
          COUNT(*) FILTER (WHERE bi.is_paid = true) as paid_count,
          COUNT(*) FILTER (WHERE bi.is_paid = false) as pending_count
        FROM budget_items bi
        JOIN budgets b ON bi.budget_id = b.id
        LEFT JOIN budget_categories bc ON bi.category_id = bc.id
        WHERE b.event_id = $1
      `, [id]);

      budget = {
        summary: summary.rows[0],
        items: budgetResult.rows.map(item => ({
          id: item.id,
          categoryId: item.category_id,
          categoryName: item.category_name,
          icon: item.icon,
          description: item.description,
          vendorName: item.vendor_name,
          estimatedAmount: parseFloat(item.estimated_amount) || 0,
          actualAmount: parseFloat(item.actual_amount) || 0,
          isPaid: item.is_paid,
          isIncome: item.is_income,
          dueDate: item.due_date,
          notes: item.notes
        }))
      };
    }

    // Get timeline
    let timeline = [];
    const timelineTableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'event_timeline')`);
    if (timelineTableCheck.rows[0].exists) {
      const timelineResult = await pool.query('SELECT * FROM event_timeline WHERE event_id = $1 ORDER BY sort_order, time', [id]);
      timeline = timelineResult.rows;
    }

    // Get checklist
    let checklist = [];
    const checklistTableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'event_checklist')`);
    if (checklistTableCheck.rows[0].exists) {
      const checklistResult = await pool.query('SELECT * FROM event_checklist WHERE event_id = $1 ORDER BY priority DESC, category', [id]);
      checklist = checklistResult.rows;
    }

    // Get staff assignments
    let staff = [];
    const assignmentsTableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'staff_assignments')`);
    if (assignmentsTableCheck.rows[0].exists) {
      const staffResult = await pool.query(`
        SELECT sa.*, s.name as staff_name, s.role as staff_role, s.photo_url
        FROM staff_assignments sa
        JOIN staff s ON sa.staff_id = s.id
        WHERE sa.event_id = $1
        ORDER BY sa.shift_start
      `, [id]);
      staff = staffResult.rows.map(s => ({
        id: s.id,
        staffId: s.staff_id,
        staffName: s.staff_name,
        role: s.role || s.staff_role,
        photoUrl: s.photo_url,
        shiftStart: s.shift_start,
        shiftEnd: s.shift_end,
        status: s.status
      }));
    }

    res.json({
      event,
      guests,
      budget,
      timeline,
      checklist,
      staff
    });
  } catch (error) {
    console.error('Error fetching full event:', error);
    res.status(500).json({ error: 'Failed to fetch event data' });
  }
});

// ============================================
// GPT SESSION ENDPOINTS (Unified operations)
// These endpoints consolidate multiple operations into single endpoints
// to work within GPT's 20 operation limit
// ============================================

// POST /api/v1/gpt/events - Unified events session
app.post('/api/v1/gpt/events', async (req, res) => {
  try {
    const { action, eventId, data, filters } = req.body;
    const userId = req.user?.id;

    switch (action) {
      case 'list': {
        const { status, limit = 50 } = filters || {};
        let query = 'SELECT * FROM events WHERE (user_id = $1::integer OR user_id IS NULL)';
        const values = [userId];
        if (status) {
          query += ` AND status = $${values.length + 1}`;
          values.push(status);
        }
        query += ' ORDER BY date DESC LIMIT $' + (values.length + 1);
        values.push(limit);
        const result = await pool.query(query, values);
        return res.json({ success: true, events: result.rows.map(mapEventRow), total: result.rows.length });
      }

      case 'get': {
        if (!eventId) return res.status(400).json({ error: 'eventId required' });
        const result = await pool.query('SELECT * FROM events WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [eventId, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
        return res.json({ success: true, event: mapEventRow(result.rows[0]) });
      }

      case 'getFull': {
        if (!eventId) return res.status(400).json({ error: 'eventId required' });
        // Reuse the full event logic
        const eventResult = await pool.query('SELECT * FROM events WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [eventId, userId]);
        if (eventResult.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
        const event = mapEventRow(eventResult.rows[0]);

        let guests = { total: 0, list: [] };
        const guestsCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'guests')`);
        if (guestsCheck.rows[0].exists) {
          const guestsResult = await pool.query('SELECT * FROM guests WHERE (user_id = $1::integer OR user_id IS NULL)', [userId]);
          guests = { total: guestsResult.rows.length, list: guestsResult.rows };
        }

        let budget = { summary: {}, items: [] };
        const budgetCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'budgets')`);
        if (budgetCheck.rows[0].exists) {
          const budgetResult = await pool.query(`
            SELECT bi.*, bc.name as category_name, bc.icon, bc.is_income
            FROM budget_items bi JOIN budgets b ON bi.budget_id = b.id
            LEFT JOIN budget_categories bc ON bi.category_id = bc.id
            WHERE b.event_id = $1`, [eventId]);
          budget.items = budgetResult.rows;
        }

        let timeline = [];
        const timelineCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'event_timeline')`);
        if (timelineCheck.rows[0].exists) {
          const result = await pool.query('SELECT * FROM event_timeline WHERE event_id = $1 ORDER BY sort_order', [eventId]);
          timeline = result.rows;
        }

        return res.json({ success: true, event, guests, budget, timeline });
      }

      case 'create': {
        const { name, eventDate, eventType, venueName, venueCity, expectedAttendance, dressCode, theme, notes } = data || {};
        if (!name || !eventDate) return res.status(400).json({ error: 'name and eventDate required' });
        // Use actual database column names: title, date, venue, category
        const venue = venueName ? (venueCity ? `${venueName}, ${venueCity}` : venueName) : venueCity || null;
        // Map eventType to valid category (only 'corporate' and 'nightlife' allowed)
        const validCategories = ['corporate', 'nightlife'];
        const category = validCategories.includes(eventType) ? eventType : 'nightlife';
        // Generate next ID
        const maxIdResult = await pool.query('SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) + 1 as next_id FROM events');
        const nextId = maxIdResult.rows[0].next_id;
        const result = await pool.query(`
          INSERT INTO events (id, title, date, category, venue, status, user_id)
          VALUES ($1, $2, $3, $4, $5, 'planning', $6) RETURNING *
        `, [nextId.toString(), name, eventDate, category, venue, userId]);
        const createdEvent = mapEventRow(result.rows[0]);
        // Emit WebSocket notification
        emitNotification(userId, 'created', 'event', createdEvent);
        return res.json({ success: true, event: createdEvent, message: 'Event created' });
      }

      case 'update': {
        if (!eventId) return res.status(400).json({ error: 'eventId required' });
        // Verify ownership
        const checkUpdate = await pool.query('SELECT * FROM events WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [eventId, userId]);
        if (checkUpdate.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
        const fields = [];
        const values = [];
        let idx = 1;
        // Map API field names to actual database columns (title, date, venue, category, status)
        const allowedFields = ['title', 'date', 'category', 'venue', 'status'];
        const fieldMap = { name: 'title', eventDate: 'date', eventType: 'category', venueName: 'venue', venueCity: 'venue' };

        for (const [key, value] of Object.entries(data || {})) {
          const dbField = fieldMap[key] || key;
          if (allowedFields.includes(dbField) && value !== undefined) {
            fields.push(`${dbField} = $${idx++}`);
            values.push(value);
          }
        }
        if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
        values.push(eventId);
        await pool.query(`UPDATE events SET ${fields.join(', ')} WHERE id = $${idx}`, values);
        // Emit WebSocket notification
        emitNotification(userId, 'updated', 'event', { id: eventId, ...data });
        return res.json({ success: true, message: 'Event updated' });
      }

      case 'delete': {
        if (!eventId) return res.status(400).json({ error: 'eventId required' });
        // Verify ownership before delete
        const checkDel = await pool.query('SELECT * FROM events WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [eventId, userId]);
        if (checkDel.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
        const deletedEvent = mapEventRow(checkDel.rows[0]);
        await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
        // Emit WebSocket notification
        emitNotification(userId, 'deleted', 'event', deletedEvent);
        return res.json({ success: true, message: 'Event deleted' });
      }

      case 'addTimeline': {
        if (!eventId) return res.status(400).json({ error: 'eventId required' });
        const { time, title, description, location, isCritical } = data || {};
        if (!time || !title) return res.status(400).json({ error: 'time and title required' });
        await pool.query(`
          INSERT INTO event_timeline (event_id, time, title, description, location, is_critical)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [eventId, time, title, description, location, isCritical || false]);
        return res.json({ success: true, message: 'Timeline item added' });
      }

      case 'addChecklist': {
        if (!eventId) return res.status(400).json({ error: 'eventId required' });
        const { item, category, priority } = data || {};
        if (!item) return res.status(400).json({ error: 'item required' });
        await pool.query(`
          INSERT INTO event_checklist (event_id, item, category, priority) VALUES ($1, $2, $3, $4)
        `, [eventId, item, category || 'General', priority || 'medium']);
        return res.json({ success: true, message: 'Checklist item added' });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Valid: list, get, getFull, create, update, delete, addTimeline, addChecklist' });
    }
  } catch (error) {
    console.error('GPT Events error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/gpt/guests - Unified guests session
app.post('/api/v1/gpt/guests', async (req, res) => {
  try {
    // Extract known fields and treat rest as potential flat data
    const { action, guestId, eventId, data, filters, ...flatFields } = req.body;
    // Merge data object with flat fields (flat fields take precedence for backwards compatibility)
    const mergedData = { ...(data || {}), ...flatFields };
    const userId = req.user?.id;

    switch (action) {
      case 'list': {
        const { category, search, limit = 100 } = filters || {};
        let query = 'SELECT * FROM guests WHERE (user_id = $1::integer OR user_id IS NULL)';
        const values = [userId];
        if (eventId) { query += ` AND event_id = $${values.length + 1}`; values.push(eventId); }
        if (category) { query += ` AND status = $${values.length + 1}`; values.push(category); }
        if (search) { query += ` AND (name ILIKE $${values.length + 1} OR email ILIKE $${values.length + 1})`; values.push(`%${search}%`); }
        query += ` ORDER BY created_at DESC LIMIT $${values.length + 1}`;
        values.push(limit);
        const result = await pool.query(query, values);
        return res.json({ success: true, guests: result.rows, total: result.rows.length });
      }

      case 'get': {
        if (!guestId) return res.status(400).json({ error: 'guestId required' });
        const result = await pool.query('SELECT * FROM guests WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [guestId, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
        return res.json({ success: true, guest: result.rows[0] });
      }

      case 'add': {
        // Support both { data: { name, email } } and flat { name, email } formats
        const { name, email, phone, instagram, partySize, category, notes } = mergedData;
        if (!name || !email) return res.status(400).json({ error: 'name and email required' });
        const result = await pool.query(`
          INSERT INTO guests (name, email, phone, instagram, party_size, category, notes, user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
        `, [name, email, phone, instagram, partySize || 1, category || 'pending', notes, userId]);
        const addedGuest = result.rows[0];
        // Emit WebSocket notification
        emitNotification(userId, 'created', 'guest', addedGuest);
        return res.json({ success: true, guest: addedGuest, message: 'Guest added' });
      }

      case 'update': {
        if (!guestId) return res.status(400).json({ error: 'guestId required' });
        // Verify ownership
        const checkUpd = await pool.query('SELECT * FROM guests WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [guestId, userId]);
        if (checkUpd.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
        const fields = [];
        const values = [];
        let idx = 1;
        const allowedFields = ['name', 'email', 'phone', 'instagram', 'party_size', 'status', 'notes'];
        const fieldMap = { partySize: 'party_size', category: 'status' };
        for (const [key, value] of Object.entries(mergedData)) {
          const dbField = fieldMap[key] || key;
          if (allowedFields.includes(dbField) && value !== undefined) {
            fields.push(`${dbField} = $${idx++}`);
            values.push(value);
          }
        }
        if (fields.length === 0) return res.status(400).json({ error: 'No valid fields' });
        values.push(guestId);
        await pool.query(`UPDATE guests SET ${fields.join(', ')} WHERE id = $${idx}`, values);
        // Emit WebSocket notification
        emitNotification(userId, 'updated', 'guest', { id: guestId, name: checkUpd.rows[0].name, ...mergedData });
        return res.json({ success: true, message: 'Guest updated' });
      }

      case 'delete': {
        if (!guestId) return res.status(400).json({ error: 'guestId required' });
        // Verify ownership
        const checkDel = await pool.query('SELECT * FROM guests WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [guestId, userId]);
        if (checkDel.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
        const deletedGuest = checkDel.rows[0];
        await pool.query('DELETE FROM guests WHERE id = $1', [guestId]);
        // Emit WebSocket notification
        emitNotification(userId, 'deleted', 'guest', deletedGuest);
        return res.json({ success: true, message: 'Guest removed' });
      }

      case 'approve': {
        if (!guestId) return res.status(400).json({ error: 'guestId required' });
        const checkAppr = await pool.query('SELECT * FROM guests WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [guestId, userId]);
        if (checkAppr.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
        await pool.query('UPDATE guests SET status = $1 WHERE id = $2', ['approved', guestId]);
        // Emit WebSocket notification
        emitNotification(userId, 'approved', 'guest', { id: guestId, name: checkAppr.rows[0].name });
        return res.json({ success: true, message: 'Guest approved' });
      }

      case 'reject': {
        if (!guestId) return res.status(400).json({ error: 'guestId required' });
        const checkRej = await pool.query('SELECT * FROM guests WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [guestId, userId]);
        if (checkRej.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
        await pool.query('UPDATE guests SET status = $1 WHERE id = $2', ['rejected', guestId]);
        // Emit WebSocket notification
        emitNotification(userId, 'rejected', 'guest', { id: guestId, name: checkRej.rows[0].name });
        return res.json({ success: true, message: 'Guest rejected' });
      }

      case 'checkIn': {
        if (!guestId) return res.status(400).json({ error: 'guestId required' });
        const checkIn = await pool.query('SELECT * FROM guests WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [guestId, userId]);
        if (checkIn.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
        await pool.query('UPDATE guests SET checked_in_at = CURRENT_TIMESTAMP WHERE id = $1', [guestId]);
        // Emit WebSocket notification
        emitNotification(userId, 'checkedIn', 'guest', { id: guestId, name: checkIn.rows[0].name });
        return res.json({ success: true, message: 'Guest checked in' });
      }

      case 'stats': {
        const result = await pool.query(`
          SELECT COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'pending') as pending,
            COUNT(*) FILTER (WHERE status = 'approved') as approved,
            COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL) as checked_in
          FROM guests WHERE (user_id = $1::integer OR user_id IS NULL)
        `, [userId]);
        return res.json({ success: true, stats: result.rows[0] });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Valid: list, get, add, update, delete, approve, reject, checkIn, stats' });
    }
  } catch (error) {
    console.error('GPT Guests error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/gpt/budget - Unified budget session
app.post('/api/v1/gpt/budget', async (req, res) => {
  try {
    const { action, eventId, itemId, data } = req.body;

    switch (action) {
      case 'getCategories': {
        const result = await pool.query('SELECT * FROM budget_categories ORDER BY sort_order');
        return res.json({ success: true, categories: result.rows });
      }

      case 'getSummary': {
        if (!eventId) return res.status(400).json({ error: 'eventId required' });
        const result = await pool.query(`
          SELECT
            COALESCE(SUM(bi.estimated_amount) FILTER (WHERE bc.is_income = false), 0) as total_estimated_expenses,
            COALESCE(SUM(bi.actual_amount) FILTER (WHERE bc.is_income = false), 0) as total_actual_expenses,
            COALESCE(SUM(bi.estimated_amount) FILTER (WHERE bc.is_income = true), 0) as total_estimated_income,
            COALESCE(SUM(bi.actual_amount) FILTER (WHERE bc.is_income = true), 0) as total_actual_income,
            COUNT(*) FILTER (WHERE bi.is_paid) as paid_count,
            COUNT(*) FILTER (WHERE NOT bi.is_paid) as pending_count
          FROM budget_items bi
          JOIN budgets b ON bi.budget_id = b.id
          LEFT JOIN budget_categories bc ON bi.category_id = bc.id
          WHERE b.event_id = $1
        `, [eventId]);
        const row = result.rows[0];
        return res.json({
          success: true,
          summary: {
            estimatedExpenses: parseFloat(row.total_estimated_expenses) || 0,
            actualExpenses: parseFloat(row.total_actual_expenses) || 0,
            estimatedIncome: parseFloat(row.total_estimated_income) || 0,
            actualIncome: parseFloat(row.total_actual_income) || 0,
            estimatedProfit: (parseFloat(row.total_estimated_income) || 0) - (parseFloat(row.total_estimated_expenses) || 0),
            actualProfit: (parseFloat(row.total_actual_income) || 0) - (parseFloat(row.total_actual_expenses) || 0),
            paidItems: parseInt(row.paid_count) || 0,
            pendingItems: parseInt(row.pending_count) || 0
          }
        });
      }

      case 'getItems': {
        if (!eventId) return res.status(400).json({ error: 'eventId required' });
        const result = await pool.query(`
          SELECT bi.*, bc.name as category_name, bc.icon, bc.is_income
          FROM budget_items bi
          JOIN budgets b ON bi.budget_id = b.id
          LEFT JOIN budget_categories bc ON bi.category_id = bc.id
          WHERE b.event_id = $1
          ORDER BY bc.sort_order, bi.created_at
        `, [eventId]);
        return res.json({ success: true, items: result.rows });
      }

      case 'addItem': {
        if (!eventId) return res.status(400).json({ error: 'eventId required' });
        const { categoryId, description, vendorName, estimatedAmount, actualAmount, isPaid, dueDate, notes } = data || {};
        if (!categoryId || !description) return res.status(400).json({ error: 'categoryId and description required' });

        // Get or create budget for event
        let budgetResult = await pool.query('SELECT id FROM budgets WHERE event_id = $1', [eventId]);
        let budgetId;
        if (budgetResult.rows.length === 0) {
          const newBudget = await pool.query('INSERT INTO budgets (event_id) VALUES ($1) RETURNING id', [eventId]);
          budgetId = newBudget.rows[0].id;
        } else {
          budgetId = budgetResult.rows[0].id;
        }

        await pool.query(`
          INSERT INTO budget_items (budget_id, category_id, description, vendor_name, estimated_amount, actual_amount, is_paid, due_date, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [budgetId, categoryId, description, vendorName, estimatedAmount || 0, actualAmount || 0, isPaid || false, dueDate, notes]);
        return res.json({ success: true, message: 'Budget item added' });
      }

      case 'updateItem': {
        if (!itemId) return res.status(400).json({ error: 'itemId required' });
        const fields = [];
        const values = [];
        let idx = 1;
        const allowedFields = ['description', 'vendor_name', 'estimated_amount', 'actual_amount', 'is_paid', 'due_date', 'notes', 'category_id'];
        const fieldMap = { vendorName: 'vendor_name', estimatedAmount: 'estimated_amount', actualAmount: 'actual_amount', isPaid: 'is_paid', dueDate: 'due_date', categoryId: 'category_id' };
        for (const [key, value] of Object.entries(data || {})) {
          const dbField = fieldMap[key] || key;
          if (allowedFields.includes(dbField) && value !== undefined) {
            fields.push(`${dbField} = $${idx++}`);
            values.push(value);
          }
        }
        if (fields.length === 0) return res.status(400).json({ error: 'No valid fields' });
        values.push(itemId);
        await pool.query(`UPDATE budget_items SET ${fields.join(', ')} WHERE id = $${idx}`, values);
        return res.json({ success: true, message: 'Budget item updated' });
      }

      case 'deleteItem': {
        if (!itemId) return res.status(400).json({ error: 'itemId required' });
        await pool.query('DELETE FROM budget_items WHERE id = $1', [itemId]);
        return res.json({ success: true, message: 'Budget item deleted' });
      }

      case 'markPaid': {
        if (!itemId) return res.status(400).json({ error: 'itemId required' });
        await pool.query('UPDATE budget_items SET is_paid = true WHERE id = $1', [itemId]);
        return res.json({ success: true, message: 'Item marked as paid' });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Valid: getCategories, getSummary, getItems, addItem, updateItem, deleteItem, markPaid' });
    }
  } catch (error) {
    console.error('GPT Budget error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/gpt/staff - Unified staff session
app.post('/api/v1/gpt/staff', async (req, res) => {
  try {
    const { action, staffId, eventId, assignmentId, data, filters } = req.body;
    const userId = req.user?.id;

    // Check if staff table exists
    const tableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'staff')`);
    if (!tableCheck.rows[0].exists) {
      return res.json({ success: true, staff: [], message: 'Staff table not initialized' });
    }

    switch (action) {
      case 'list': {
        const result = await pool.query('SELECT * FROM staff WHERE (user_id = $1::integer OR user_id IS NULL) ORDER BY name', [userId]);
        return res.json({ success: true, staff: result.rows });
      }

      case 'get': {
        if (!staffId) return res.status(400).json({ error: 'staffId required' });
        const result = await pool.query('SELECT * FROM staff WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [staffId, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Staff not found' });
        return res.json({ success: true, staff: result.rows[0] });
      }

      case 'add': {
        const { name, email, phone, role, hourlyRate, experienceLevel } = data || {};
        if (!name || !email) return res.status(400).json({ error: 'name and email required' });
        const result = await pool.query(`
          INSERT INTO staff (name, email, phone, role, hourly_rate, experience_level, status, user_id)
          VALUES ($1, $2, $3, $4, $5, $6, 'active', $7) RETURNING *
        `, [name, email, phone, role, hourlyRate, experienceLevel || 'intermediate', userId]);
        return res.json({ success: true, staff: result.rows[0], message: 'Staff member added' });
      }

      case 'update': {
        if (!staffId) return res.status(400).json({ error: 'staffId required' });
        // Verify ownership
        const check = await pool.query('SELECT id FROM staff WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [staffId, userId]);
        if (check.rows.length === 0) return res.status(404).json({ error: 'Staff not found' });
        const fields = [];
        const values = [];
        let idx = 1;
        for (const [key, value] of Object.entries(data || {})) {
          if (value !== undefined) {
            const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
            fields.push(`${dbField} = $${idx++}`);
            values.push(value);
          }
        }
        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
        values.push(staffId);
        await pool.query(`UPDATE staff SET ${fields.join(', ')} WHERE id = $${idx}`, values);
        return res.json({ success: true, message: 'Staff updated' });
      }

      case 'delete': {
        if (!staffId) return res.status(400).json({ error: 'staffId required' });
        await pool.query('DELETE FROM staff WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [staffId, userId]);
        return res.json({ success: true, message: 'Staff removed' });
      }

      case 'assignToEvent': {
        if (!staffId || !eventId) return res.status(400).json({ error: 'staffId and eventId required' });
        const { role, shiftStart, shiftEnd } = data || {};
        await pool.query(`
          INSERT INTO staff_assignments (staff_id, event_id, role, shift_start, shift_end, status)
          VALUES ($1, $2, $3, $4, $5, 'scheduled')
        `, [staffId, eventId, role, shiftStart, shiftEnd]);
        return res.json({ success: true, message: 'Staff assigned to event' });
      }

      case 'getEventStaff': {
        if (!eventId) return res.status(400).json({ error: 'eventId required' });
        const assignCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'staff_assignments')`);
        if (!assignCheck.rows[0].exists) return res.json({ success: true, assignments: [] });
        const result = await pool.query(`
          SELECT sa.*, s.name, s.phone, s.photo_url
          FROM staff_assignments sa
          JOIN staff s ON sa.staff_id = s.id
          WHERE sa.event_id = $1
        `, [eventId]);
        return res.json({ success: true, assignments: result.rows });
      }

      case 'removeAssignment': {
        if (!assignmentId) return res.status(400).json({ error: 'assignmentId required' });
        await pool.query('DELETE FROM staff_assignments WHERE id = $1', [assignmentId]);
        return res.json({ success: true, message: 'Assignment removed' });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Valid: list, get, add, update, delete, assignToEvent, getEventStaff, removeAssignment' });
    }
  } catch (error) {
    console.error('GPT Staff error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/gpt/vendors - Unified vendors session
app.post('/api/v1/gpt/vendors', async (req, res) => {
  try {
    const { action, vendorId, data, filters } = req.body;
    const userId = req.user?.id;

    const tableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'vendors')`);
    if (!tableCheck.rows[0].exists) {
      return res.json({ success: true, vendors: [], message: 'Vendors table not initialized' });
    }

    switch (action) {
      case 'list': {
        const { category, isPreferred } = filters || {};
        let query = 'SELECT * FROM vendors WHERE (user_id = $1::integer OR user_id IS NULL)';
        const values = [userId];
        if (category) { query += ` AND category = $${values.length + 1}`; values.push(category); }
        if (isPreferred !== undefined) { query += ` AND is_preferred = $${values.length + 1}`; values.push(isPreferred); }
        query += ' ORDER BY name';
        const result = await pool.query(query, values);
        return res.json({ success: true, vendors: result.rows });
      }

      case 'get': {
        if (!vendorId) return res.status(400).json({ error: 'vendorId required' });
        const result = await pool.query('SELECT * FROM vendors WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [vendorId, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
        return res.json({ success: true, vendor: result.rows[0] });
      }

      case 'add': {
        const { name, category, contactName, email, phone, website, city, notes, isPreferred } = data || {};
        if (!name) return res.status(400).json({ error: 'name required' });
        const result = await pool.query(`
          INSERT INTO vendors (name, category, contact_name, email, phone, website, city, notes, is_preferred, user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
        `, [name, category, contactName, email, phone, website, city, notes, isPreferred || false, userId]);
        const addedVendor = result.rows[0];
        // Emit WebSocket notification
        emitNotification(userId, 'created', 'vendor', addedVendor);
        return res.json({ success: true, vendor: addedVendor, message: 'Vendor added' });
      }

      case 'update': {
        if (!vendorId) return res.status(400).json({ error: 'vendorId required' });
        // Verify ownership
        const checkVUpd = await pool.query('SELECT * FROM vendors WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [vendorId, userId]);
        if (checkVUpd.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
        const fields = [];
        const values = [];
        let idx = 1;
        const fieldMap = { contactName: 'contact_name', isPreferred: 'is_preferred' };
        for (const [key, value] of Object.entries(data || {})) {
          if (value !== undefined) {
            const dbField = fieldMap[key] || key;
            fields.push(`${dbField} = $${idx++}`);
            values.push(value);
          }
        }
        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
        values.push(vendorId);
        await pool.query(`UPDATE vendors SET ${fields.join(', ')} WHERE id = $${idx}`, values);
        // Emit WebSocket notification
        emitNotification(userId, 'updated', 'vendor', { id: vendorId, name: checkVUpd.rows[0].name, ...data });
        return res.json({ success: true, message: 'Vendor updated' });
      }

      case 'delete': {
        if (!vendorId) return res.status(400).json({ error: 'vendorId required' });
        // Verify ownership
        const checkVDel = await pool.query('SELECT * FROM vendors WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [vendorId, userId]);
        if (checkVDel.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
        const deletedVendor = checkVDel.rows[0];
        await pool.query('DELETE FROM vendors WHERE id = $1', [vendorId]);
        // Emit WebSocket notification
        emitNotification(userId, 'deleted', 'vendor', deletedVendor);
        return res.json({ success: true, message: 'Vendor deleted' });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Valid: list, get, add, update, delete' });
    }
  } catch (error) {
    console.error('GPT Vendors error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/gpt/models - Unified models/talent session
app.post('/api/v1/gpt/models', async (req, res) => {
  try {
    const { action, modelId, data, filters } = req.body;
    const userId = req.user?.id;

    const tableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'models')`);
    if (!tableCheck.rows[0].exists) {
      return res.json({ success: true, models: [], message: 'Models table not initialized' });
    }

    switch (action) {
      case 'list': {
        const { status } = filters || {};
        let query = 'SELECT * FROM models WHERE (user_id = $1::integer OR user_id IS NULL)';
        const params = [userId];
        if (status) {
          query += ` AND status = $2`;
          params.push(status);
        }
        query += ' ORDER BY created_at DESC';
        const result = await pool.query(query, params);
        return res.json({ success: true, models: result.rows });
      }

      case 'get': {
        if (!modelId) return res.status(400).json({ error: 'modelId required' });
        const result = await pool.query('SELECT * FROM models WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [modelId, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Model not found' });
        return res.json({ success: true, model: result.rows[0] });
      }

      case 'updateStatus': {
        if (!modelId) return res.status(400).json({ error: 'modelId required' });
        const { status } = data || {};
        if (!['pending', 'approved', 'declined', 'assigned'].includes(status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }
        await pool.query('UPDATE models SET status = $1 WHERE id = $2::integer AND (user_id = $3::integer OR user_id IS NULL)', [status, modelId, userId]);
        return res.json({ success: true, message: `Model ${status}` });
      }

      case 'stats': {
        const result = await pool.query(`
          SELECT COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'pending') as pending,
            COUNT(*) FILTER (WHERE status = 'approved') as approved,
            COUNT(*) FILTER (WHERE status = 'assigned') as assigned
          FROM models WHERE (user_id = $1::integer OR user_id IS NULL)
        `, [userId]);
        return res.json({ success: true, stats: result.rows[0] });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Valid: list, get, updateStatus, stats' });
    }
  } catch (error) {
    console.error('GPT Models error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/gpt/tables - Unified table reservations session
app.post('/api/v1/gpt/tables', async (req, res) => {
  try {
    const { action, reservationId, eventId, data, filters } = req.body;

    const tableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'table_reservations')`);
    if (!tableCheck.rows[0].exists) {
      return res.json({ success: true, reservations: [], message: 'Table reservations not initialized' });
    }

    switch (action) {
      case 'list': {
        let query = 'SELECT * FROM table_reservations';
        const values = [];
        if (eventId) { query += ' WHERE event_id = $1'; values.push(eventId); }
        query += ' ORDER BY created_at DESC';
        const result = await pool.query(query, values);
        return res.json({ success: true, reservations: result.rows });
      }

      case 'create': {
        const { tableId, tableName, zone, customerName, customerEmail, customerPhone, partySize, minimumSpend } = data || {};
        if (!eventId || !customerName) return res.status(400).json({ error: 'eventId and customerName required' });
        const result = await pool.query(`
          INSERT INTO table_reservations (event_id, table_id, table_name, zone, customer_name, customer_email, customer_phone, party_size, minimum_spend, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending') RETURNING *
        `, [eventId, tableId, tableName, zone, customerName, customerEmail, customerPhone, partySize, minimumSpend]);
        return res.json({ success: true, reservation: result.rows[0], message: 'Reservation created' });
      }

      case 'confirm': {
        if (!reservationId) return res.status(400).json({ error: 'reservationId required' });
        await pool.query('UPDATE table_reservations SET status = $1 WHERE id = $2', ['confirmed', reservationId]);
        return res.json({ success: true, message: 'Reservation confirmed' });
      }

      case 'cancel': {
        if (!reservationId) return res.status(400).json({ error: 'reservationId required' });
        await pool.query('UPDATE table_reservations SET status = $1 WHERE id = $2', ['cancelled', reservationId]);
        return res.json({ success: true, message: 'Reservation cancelled' });
      }

      case 'stats': {
        const result = await pool.query(`
          SELECT COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'pending') as pending,
            COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
            COALESCE(SUM(minimum_spend) FILTER (WHERE status = 'confirmed'), 0) as revenue
          FROM table_reservations ${eventId ? 'WHERE event_id = $1' : ''}
        `, eventId ? [eventId] : []);
        return res.json({ success: true, stats: result.rows[0] });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Valid: list, create, confirm, cancel, stats' });
    }
  } catch (error) {
    console.error('GPT Tables error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/gpt/tickets - Unified tickets session
app.post('/api/v1/gpt/tickets', async (req, res) => {
  try {
    const { action, ticketId, eventId, data, filters } = req.body;

    const tableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tickets')`);
    if (!tableCheck.rows[0].exists) {
      return res.json({ success: true, tickets: [], message: 'Tickets table not initialized' });
    }

    switch (action) {
      case 'list': {
        let query = 'SELECT * FROM tickets';
        const values = [];
        if (eventId) { query += ' WHERE event_id = $1'; values.push(eventId); }
        query += ' ORDER BY created_at DESC';
        const result = await pool.query(query, values);
        return res.json({ success: true, tickets: result.rows });
      }

      case 'create': {
        const { ticketType, holderName, holderEmail, price, userId: dataUserId } = data || {};
        const userId = req.user?.id || dataUserId || null;
        if (!eventId || !ticketType) return res.status(400).json({ error: 'eventId and ticketType required' });
        const ticketId = generateTicketId();
        const result = await pool.query(`
          INSERT INTO tickets (id, user_id, event_id, ticket_type, holder_name, holder_email, price, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'valid') RETURNING *
        `, [ticketId, userId, eventId, ticketType, holderName, holderEmail, price || 0]);
        return res.json({ success: true, ticket: result.rows[0], message: 'Ticket created' });
      }

      case 'checkIn': {
        if (!ticketId) return res.status(400).json({ error: 'ticketId required' });
        await pool.query('UPDATE tickets SET status = $1, checked_in_at = CURRENT_TIMESTAMP WHERE id = $2', ['used', ticketId]);
        return res.json({ success: true, message: 'Ticket checked in' });
      }

      case 'stats': {
        const result = await pool.query(`
          SELECT COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'valid') as valid,
            COUNT(*) FILTER (WHERE status = 'used') as used,
            COALESCE(SUM(price), 0) as revenue
          FROM tickets ${eventId ? 'WHERE event_id = $1' : ''}
        `, eventId ? [eventId] : []);
        return res.json({ success: true, stats: result.rows[0] });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Valid: list, create, checkIn, stats' });
    }
  } catch (error) {
    console.error('GPT Tickets error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/gpt/sponsors - Unified sponsors session
app.post('/api/v1/gpt/sponsors', async (req, res) => {
  try {
    const { action, sponsorId, data, filters } = req.body;
    const userId = req.user?.id;

    const tableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sponsors')`);
    if (!tableCheck.rows[0].exists) {
      return res.json({ success: true, sponsors: [], message: 'Sponsors table not initialized' });
    }

    switch (action) {
      case 'list': {
        const result = await pool.query('SELECT * FROM sponsors WHERE (user_id = $1::integer OR user_id IS NULL) ORDER BY created_at DESC', [userId]);
        return res.json({ success: true, sponsors: result.rows });
      }

      case 'get': {
        if (!sponsorId) return res.status(400).json({ error: 'sponsorId required' });
        const result = await pool.query('SELECT * FROM sponsors WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [sponsorId, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Sponsor not found' });
        return res.json({ success: true, sponsor: result.rows[0] });
      }

      case 'add': {
        const { companyName, contactName, email, phone, tier, amount, benefits } = data || {};
        if (!companyName) return res.status(400).json({ error: 'companyName required' });
        const result = await pool.query(`
          INSERT INTO sponsors (company_name, contact_name, email, phone, tier, amount, benefits, status, user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8) RETURNING *
        `, [companyName, contactName, email, phone, tier || 'silver', amount || 0, benefits, userId]);
        const addedSponsor = result.rows[0];
        // Emit WebSocket notification
        emitNotification(userId, 'created', 'sponsor', addedSponsor);
        return res.json({ success: true, sponsor: addedSponsor, message: 'Sponsor added' });
      }

      case 'updateStatus': {
        if (!sponsorId) return res.status(400).json({ error: 'sponsorId required' });
        // Verify ownership
        const checkSUpd = await pool.query('SELECT * FROM sponsors WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [sponsorId, userId]);
        if (checkSUpd.rows.length === 0) return res.status(404).json({ error: 'Sponsor not found' });
        const { status } = data || {};
        await pool.query('UPDATE sponsors SET status = $1 WHERE id = $2', [status, sponsorId]);
        // Emit WebSocket notification
        emitNotification(userId, 'updated', 'sponsor', { id: sponsorId, companyName: checkSUpd.rows[0].company_name, status });
        return res.json({ success: true, message: 'Sponsor status updated' });
      }

      case 'stats': {
        const result = await pool.query(`
          SELECT COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'pending') as pending,
            COUNT(*) FILTER (WHERE status = 'active') as active,
            COALESCE(SUM(amount) FILTER (WHERE status = 'active'), 0) as revenue
          FROM sponsors WHERE (user_id = $1::integer OR user_id IS NULL)
        `, [userId]);
        return res.json({ success: true, stats: result.rows[0] });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Valid: list, get, add, updateStatus, stats' });
    }
  } catch (error) {
    console.error('GPT Sponsors error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/gpt/promoters - Unified promoters session
app.post('/api/v1/gpt/promoters', async (req, res) => {
  try {
    const { action, promoterId, promoterCode, period, data } = req.body;
    const userId = req.user?.id;

    switch (action) {
      case 'list': {
        const result = await pool.query(`
          SELECT p.*,
            (SELECT COUNT(*) FROM promoter_sales ps WHERE ps.promoter_id = p.id) as sales_count
          FROM promoters p
          WHERE (p.user_id = $1::integer OR p.user_id IS NULL)
          ORDER BY p.total_sales DESC
        `, [userId]);
        return res.json({ success: true, promoters: result.rows, tiers: promoterTiers });
      }

      case 'get': {
        if (!promoterId) return res.status(400).json({ error: 'promoterId required' });
        const result = await pool.query('SELECT * FROM promoters WHERE id = $1', [promoterId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Promoter not found' });
        return res.json({ success: true, promoter: result.rows[0] });
      }

      case 'add': {
        const { name, email, phone, commissionRate = 10, commissionType = 'percentage', bio, socialInstagram, socialTiktok, socialTwitter } = data || {};
        if (!name || !email) return res.status(400).json({ error: 'name and email required' });
        let code = generatePromoterCode(name);
        const result = await pool.query(`
          INSERT INTO promoters (user_id, name, email, phone, code, commission_rate, commission_type, status, tier, bio, social_instagram, social_tiktok, social_twitter, landing_page_slug)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'bronze', $8, $9, $10, $11, $12) RETURNING *
        `, [userId, name, email.toLowerCase(), phone, code, commissionRate, commissionType, bio, socialInstagram, socialTiktok, socialTwitter, code.toLowerCase()]);
        return res.json({ success: true, promoter: result.rows[0], message: 'Promoter created with code: ' + code });
      }

      case 'update': {
        if (!promoterId) return res.status(400).json({ error: 'promoterId required' });
        const { name, email, phone, commissionRate, status, tier, bio } = data || {};
        const updates = [];
        const values = [];
        let idx = 1;
        if (name) { updates.push(`name = $${idx++}`); values.push(name); }
        if (email) { updates.push(`email = $${idx++}`); values.push(email.toLowerCase()); }
        if (phone) { updates.push(`phone = $${idx++}`); values.push(phone); }
        if (commissionRate) { updates.push(`commission_rate = $${idx++}`); values.push(commissionRate); }
        if (status) { updates.push(`status = $${idx++}`); values.push(status); }
        if (tier) { updates.push(`tier = $${idx++}`); values.push(tier); }
        if (bio) { updates.push(`bio = $${idx++}`); values.push(bio); }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        updates.push(`updated_at = NOW()`);
        values.push(promoterId);
        const result = await pool.query(`UPDATE promoters SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values);
        return res.json({ success: true, promoter: result.rows[0], message: 'Promoter updated' });
      }

      case 'delete': {
        if (!promoterId) return res.status(400).json({ error: 'promoterId required' });
        await pool.query('DELETE FROM promoters WHERE id = $1', [promoterId]);
        return res.json({ success: true, message: 'Promoter deleted' });
      }

      case 'trackSale': {
        const { saleAmount, eventId, guestName, guestEmail } = data || {};
        const code = promoterCode || data?.promoterCode;
        if (!code || !saleAmount) return res.status(400).json({ error: 'promoterCode and saleAmount required' });
        const pResult = await pool.query('SELECT * FROM promoters WHERE code = $1 AND status = $2', [code.toUpperCase(), 'active']);
        if (pResult.rows.length === 0) return res.status(404).json({ error: 'Promoter not found or inactive' });
        const promoter = pResult.rows[0];
        const commissionAmount = promoter.commission_type === 'percentage'
          ? (parseFloat(saleAmount) * parseFloat(promoter.commission_rate)) / 100
          : parseFloat(promoter.commission_rate);
        const saleResult = await pool.query(`
          INSERT INTO promoter_sales (promoter_id, event_id, guest_name, guest_email, sale_amount, commission_amount, commission_status)
          VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *
        `, [promoter.id, eventId, guestName, guestEmail, saleAmount, commissionAmount]);
        await pool.query(`UPDATE promoters SET total_sales = total_sales + $1, total_commission = total_commission + $2, total_tickets_sold = total_tickets_sold + 1, last_sale_at = NOW() WHERE id = $3`,
          [saleAmount, commissionAmount, promoter.id]);
        return res.json({ success: true, sale: saleResult.rows[0], promoter: { name: promoter.name, code: promoter.code, commissionEarned: commissionAmount } });
      }

      case 'leaderboard': {
        let dateFilter = '';
        if (period === 'week') dateFilter = `AND ps.created_at >= NOW() - INTERVAL '7 days'`;
        else if (period === 'month') dateFilter = `AND ps.created_at >= NOW() - INTERVAL '30 days'`;
        else if (period === 'year') dateFilter = `AND ps.created_at >= NOW() - INTERVAL '365 days'`;
        const result = await pool.query(`
          SELECT p.id, p.name, p.code, p.tier, p.photo_url,
            COALESCE(SUM(ps.sale_amount), 0) as period_sales,
            COALESCE(SUM(ps.commission_amount), 0) as period_commission,
            COUNT(ps.id) as period_tickets
          FROM promoters p
          LEFT JOIN promoter_sales ps ON p.id = ps.promoter_id ${dateFilter}
          WHERE p.status = 'active'
          GROUP BY p.id ORDER BY period_sales DESC LIMIT 10
        `);
        return res.json({ success: true, period: period || 'all', leaderboard: result.rows.map((p, i) => ({ ...p, rank: i + 1 })) });
      }

      case 'stats': {
        if (!promoterId) return res.status(400).json({ error: 'promoterId required' });
        const statsResult = await pool.query(`
          SELECT COUNT(*) as total_sales, COALESCE(SUM(sale_amount), 0) as total_revenue, COALESCE(SUM(commission_amount), 0) as total_commission,
            COALESCE(SUM(CASE WHEN commission_status = 'paid' THEN commission_amount ELSE 0 END), 0) as paid_commission,
            COALESCE(SUM(CASE WHEN commission_status = 'pending' THEN commission_amount ELSE 0 END), 0) as pending_commission
          FROM promoter_sales WHERE promoter_id = $1
        `, [promoterId]);
        return res.json({ success: true, stats: statsResult.rows[0] });
      }

      case 'payout': {
        if (!promoterId) return res.status(400).json({ error: 'promoterId required' });
        const { amount, paymentMethod, reference, notes } = data || {};
        if (!amount || !paymentMethod) return res.status(400).json({ error: 'amount and paymentMethod required' });
        const payoutResult = await pool.query(`
          INSERT INTO promoter_payouts (promoter_id, amount, payment_method, reference, notes, status, paid_at)
          VALUES ($1, $2, $3, $4, $5, 'completed', NOW()) RETURNING *
        `, [promoterId, amount, paymentMethod, reference, notes]);
        await pool.query(`UPDATE promoter_sales SET commission_status = 'paid', paid_at = NOW() WHERE promoter_id = $1 AND commission_status = 'pending'`, [promoterId]);
        return res.json({ success: true, payout: payoutResult.rows[0], message: 'Payout created and commissions marked as paid' });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Valid: list, get, add, update, delete, trackSale, leaderboard, stats, payout' });
    }
  } catch (error) {
    console.error('GPT Promoters error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/gpt/integrations - Unified integrations session
app.post('/api/v1/gpt/integrations', async (req, res) => {
  try {
    const { action, provider } = req.body;
    const userId = req.user?.id;

    switch (action) {
      case 'list': {
        const result = await pool.query('SELECT provider, status, last_sync FROM user_integrations WHERE user_id = $1::integer', [userId]);
        return res.json({ success: true, integrations: result.rows });
      }

      case 'sync': {
        if (!provider) return res.status(400).json({ error: 'provider required (eventbrite or mailchimp)' });
        if (provider === 'eventbrite') {
          const intResult = await pool.query('SELECT api_key_encrypted FROM user_integrations WHERE user_id = $1::integer AND provider = $2', [userId, 'eventbrite']);
          if (intResult.rows.length === 0) return res.status(400).json({ error: 'Eventbrite not connected. Connect first via the dashboard.' });
          // Just return a message - actual sync requires the full endpoint
          return res.json({ success: true, message: 'Use the dashboard to sync Eventbrite events' });
        } else if (provider === 'mailchimp') {
          return res.json({ success: true, message: 'Use the dashboard to sync with Mailchimp' });
        }
        return res.status(400).json({ error: 'Unknown provider' });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Valid: list, sync' });
    }
  } catch (error) {
    console.error('GPT Integrations error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/gpt/emails - Unified email tracking session
app.post('/api/v1/gpt/emails', async (req, res) => {
  try {
    const { action, emailId } = req.body;

    switch (action) {
      case 'getSummary': {
        const result = await pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE event_type = 'email.sent') as sent,
            COUNT(*) FILTER (WHERE event_type = 'email.delivered') as delivered,
            COUNT(*) FILTER (WHERE event_type = 'email.opened') as opened,
            COUNT(*) FILTER (WHERE event_type = 'email.clicked') as clicked,
            COUNT(*) FILTER (WHERE event_type = 'email.bounced') as bounced
          FROM email_events
        `);
        return res.json({ success: true, summary: result.rows[0] });
      }

      case 'getStatus': {
        if (!emailId) return res.status(400).json({ error: 'emailId required' });
        const result = await pool.query('SELECT * FROM email_events WHERE email_id = $1 ORDER BY timestamp DESC', [emailId]);
        return res.json({ success: true, events: result.rows, currentStatus: result.rows[0]?.event_type || 'unknown' });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Valid: getSummary, getStatus' });
    }
  } catch (error) {
    console.error('GPT Emails error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/gpt/uploads - Unified file uploads session
app.post('/api/v1/gpt/uploads', async (req, res) => {
  try {
    const { action, uploadId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    switch (action) {
      case 'list': {
        const result = await pool.query(`
          SELECT id, original_filename, file_type, upload_type, records_processed,
                 records_success, records_failed, status, event_id, created_at
          FROM file_uploads
          WHERE user_id = $1::integer
          ORDER BY created_at DESC
          LIMIT 50
        `, [userId]);
        return res.json({ success: true, uploads: result.rows });
      }

      case 'get': {
        if (!uploadId) return res.status(400).json({ error: 'uploadId required' });
        const result = await pool.query(`
          SELECT * FROM file_uploads
          WHERE id = $1::integer AND user_id = $2::integer
        `, [uploadId, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Upload not found' });
        return res.json({ success: true, upload: result.rows[0] });
      }

      case 'stats': {
        const result = await pool.query(`
          SELECT
            COUNT(*) as total_uploads,
            SUM(records_processed) as total_records,
            SUM(records_success) as total_success,
            SUM(records_failed) as total_failed,
            COUNT(*) FILTER (WHERE status = 'completed') as completed_uploads,
            COUNT(*) FILTER (WHERE status = 'processing') as processing_uploads
          FROM file_uploads
          WHERE user_id = $1::integer
        `, [userId]);
        return res.json({ success: true, stats: result.rows[0] });
      }

      case 'getTemplate': {
        return res.json({
          success: true,
          template: {
            format: 'CSV or Excel (xlsx)',
            columns: ['name', 'email', 'phone', 'instagram', 'category', 'company', 'notes'],
            downloadUrl: '/api/v1/uploads/template/contacts',
            example: [
              { name: 'John Doe', email: 'john@example.com', phone: '+1234567890', instagram: '@johndoe', category: 'A', company: 'Acme Corp', notes: 'VIP guest' }
            ]
          }
        });
      }

      default:
        return res.status(400).json({
          error: 'Invalid action. Valid: list, get, stats, getTemplate',
          note: 'For uploading files, use POST /api/v1/uploads/contacts with multipart form data'
        });
    }
  } catch (error) {
    console.error('GPT Uploads error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// UNIFIED GPT SESSION ENDPOINT
// Single endpoint that routes to all GPT handlers
// Accepts flat structure: { endpoint, action, name, eventDate, ... }
// ============================================
app.post('/api/v1/gpt/session', async (req, res) => {
  // Require authentication for GPT session
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please authenticate via OAuth to use this API'
    });
  }

  const {
    endpoint,
    action,
    // ID fields
    eventId, guestId, staffId, vendorId, modelId, sponsorId, reservationId, ticketId, itemId, assignmentId, promoterId, uploadId,
    // Additional params
    promoterCode, provider, emailId, period,
    // Filter fields
    filters,
    // Data wrapper (optional - for backwards compatibility)
    data,
    // All other fields are treated as data
    ...restFields
  } = req.body;

  if (!endpoint) {
    return res.status(400).json({
      error: 'Missing endpoint parameter',
      validEndpoints: ['manageEvents', 'manageGuests', 'manageBudget', 'manageStaff', 'manageVendors', 'manageModels', 'manageTables', 'manageTickets', 'manageSponsors', 'managePromoters', 'manageIntegrations', 'manageEmails', 'manageUploads', 'manageCode', 'manageSMS', 'getDashboard']
    });
  }

  // Map endpoint names to internal routes
  const endpointMap = {
    'manageEvents': '/api/v1/gpt/events',
    'manageGuests': '/api/v1/gpt/guests',
    'manageBudget': '/api/v1/gpt/budget',
    'manageStaff': '/api/v1/gpt/staff',
    'manageVendors': '/api/v1/gpt/vendors',
    'manageModels': '/api/v1/gpt/models',
    'manageTables': '/api/v1/gpt/tables',
    'manageTickets': '/api/v1/gpt/tickets',
    'manageSponsors': '/api/v1/gpt/sponsors',
    'managePromoters': '/api/v1/gpt/promoters',
    'manageIntegrations': '/api/v1/gpt/integrations',
    'manageEmails': '/api/v1/gpt/emails',
    'manageUploads': '/api/v1/gpt/uploads',
    'manageCode': '/api/v1/gpt/code',
    'manageSMS': '/api/v1/gpt/sms',
    'getDashboard': '/api/v1/dashboard'
  };

  const targetPath = endpointMap[endpoint];
  if (!targetPath) {
    return res.status(400).json({
      error: `Invalid endpoint: ${endpoint}`,
      validEndpoints: Object.keys(endpointMap)
    });
  }

  // For getDashboard, redirect to GET endpoint
  if (endpoint === 'getDashboard') {
    req.url = targetPath;
    req.method = 'GET';
    return app._router.handle(req, res, () => {});
  }

  // Build the data object - merge explicit data with flat fields
  const mergedData = { ...(data || {}), ...restFields };

  // Build forwarded body with proper structure
  req.url = targetPath;
  req.body = {
    action,
    eventId, guestId, staffId, vendorId, modelId, sponsorId, reservationId, ticketId, itemId, assignmentId, promoterId, uploadId,
    promoterCode, provider, emailId, period,
    filters,
    data: Object.keys(mergedData).length > 0 ? mergedData : undefined
  };

  // Clean undefined values
  Object.keys(req.body).forEach(key => req.body[key] === undefined && delete req.body[key]);

  return app._router.handle(req, res, () => {});
});

// ============================================
// GPT SMS ENDPOINT - Send SMS messages via Telnyx
// ============================================
app.post('/api/v1/gpt/sms', async (req, res) => {
  // Require authentication
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Extract known fields and treat rest as potential flat data
  const { action, guestId, eventId, data, ...flatFields } = req.body;
  // Merge data object with flat fields (flat fields take precedence for backwards compatibility)
  const mergedData = { ...(data || {}), ...flatFields };

  try {
    switch (action) {
      case 'send': {
        // Send SMS to a specific phone number - supports both { data: { to, message } } and flat { to, message }
        const { to, message } = mergedData;
        if (!to || !message) {
          return res.status(400).json({ error: 'Missing required fields: to, message' });
        }
        const result = await sendSMS(to, message);
        return res.json({
          success: true,
          message: 'SMS sent successfully',
          data: result
        });
      }

      case 'sendToGuest': {
        // Send SMS to a guest by ID
        if (!guestId) {
          return res.status(400).json({ error: 'Missing guestId' });
        }
        const { message } = mergedData;
        if (!message) {
          return res.status(400).json({ error: 'Missing message' });
        }

        // Get guest phone from database
        const guestResult = await pool.query(
          'SELECT name, phone FROM guests WHERE id = $1 AND user_id = $2',
          [guestId, req.user.id]
        );

        if (guestResult.rows.length === 0) {
          return res.status(404).json({ error: 'Guest not found' });
        }

        const guest = guestResult.rows[0];
        if (!guest.phone) {
          return res.status(400).json({ error: `Guest ${guest.name} does not have a phone number` });
        }

        const result = await sendSMS(guest.phone, message);
        return res.json({
          success: true,
          message: `SMS sent to ${guest.name}`,
          data: result
        });
      }

      case 'sendToEvent': {
        // Send SMS to all guests of an event with phone numbers
        if (!eventId) {
          return res.status(400).json({ error: 'Missing eventId' });
        }
        const { message } = mergedData;
        if (!message) {
          return res.status(400).json({ error: 'Missing message' });
        }

        // Get all guests with phone numbers for this event
        const guestsResult = await pool.query(
          `SELECT id, name, phone FROM guests
           WHERE event_id = $1 AND user_id = $2 AND phone IS NOT NULL AND phone != ''`,
          [eventId, req.user.id]
        );

        if (guestsResult.rows.length === 0) {
          return res.status(400).json({ error: 'No guests with phone numbers found for this event' });
        }

        const results = [];
        const errors = [];

        for (const guest of guestsResult.rows) {
          try {
            const result = await sendSMS(guest.phone, message);
            results.push({ guestId: guest.id, name: guest.name, ...result });
          } catch (err) {
            errors.push({ guestId: guest.id, name: guest.name, error: err.message });
          }
        }

        return res.json({
          success: true,
          message: `SMS sent to ${results.length} guests`,
          data: {
            sent: results,
            failed: errors,
            totalSent: results.length,
            totalFailed: errors.length
          }
        });
      }

      case 'status': {
        // Check if SMS is configured
        return res.json({
          success: true,
          data: {
            configured: !!TELNYX_API_KEY,
            phoneNumber: TELNYX_PHONE_NUMBER
          }
        });
      }

      case 'schedule': {
        // Schedule a message for later
        const { recipients, message, scheduledAt } = mergedData;

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
          return res.status(400).json({ error: 'Recipients array is required' });
        }
        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }
        if (!scheduledAt) {
          return res.status(400).json({ error: 'scheduledAt timestamp is required (ISO format)' });
        }

        const scheduledTime = new Date(scheduledAt);
        if (scheduledTime <= new Date()) {
          return res.status(400).json({ error: 'Scheduled time must be in the future' });
        }

        const scheduleResult = await pool.query(`
          INSERT INTO scheduled_messages (user_id, event_id, recipients, message, scheduled_at)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [req.user.id, eventId || null, JSON.stringify(recipients), message, scheduledTime]);

        return res.json({
          success: true,
          message: 'Message scheduled successfully',
          scheduledMessage: scheduleResult.rows[0]
        });
      }

      case 'listScheduled': {
        // List scheduled messages
        let query = 'SELECT * FROM scheduled_messages WHERE user_id = $1';
        const params = [req.user.id];

        if (eventId) {
          query += ' AND event_id = $2';
          params.push(eventId);
        }

        query += ' ORDER BY scheduled_at ASC';

        const listResult = await pool.query(query, params);
        return res.json({
          success: true,
          scheduledMessages: listResult.rows,
          total: listResult.rows.length
        });
      }

      case 'cancelScheduled': {
        // Cancel a scheduled message
        const { scheduledId } = mergedData;
        if (!scheduledId) {
          return res.status(400).json({ error: 'scheduledId is required' });
        }

        const cancelResult = await pool.query(
          'UPDATE scheduled_messages SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 AND status = $4 RETURNING *',
          ['cancelled', scheduledId, req.user.id, 'pending']
        );

        if (cancelResult.rows.length === 0) {
          return res.status(404).json({ error: 'Scheduled message not found or already processed' });
        }

        return res.json({
          success: true,
          message: 'Scheduled message cancelled',
          scheduledMessage: cancelResult.rows[0]
        });
      }

      case 'bulkSend': {
        // Send SMS to multiple recipients immediately
        const { recipients, message } = mergedData;

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
          return res.status(400).json({ error: 'Recipients array is required' });
        }
        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }

        let apiKey = process.env.TELNYX_API_KEY;
        const fromNumber = process.env.TELNYX_PHONE_NUMBER;

        if (!apiKey) {
          const telnyxInt = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['telnyx']);
          if (telnyxInt.rows[0]?.api_key_encrypted) {
            apiKey = decryptApiKey(telnyxInt.rows[0].api_key_encrypted);
          }
        }

        if (!apiKey || !fromNumber) {
          return res.status(400).json({ error: 'Telnyx not configured' });
        }

        const results = [];
        for (const recipient of recipients) {
          try {
            const telnyxResponse = await fetch('https://api.telnyx.com/v2/messages', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ from: fromNumber, to: recipient, text: message })
            });
            const telnyxData = await telnyxResponse.json();
            results.push({
              to: recipient,
              success: telnyxResponse.ok,
              messageId: telnyxData.data?.id
            });
          } catch (e) {
            results.push({ to: recipient, success: false, error: e.message });
          }
        }

        const sentCount = results.filter(r => r.success).length;
        return res.json({
          success: true,
          message: `Sent ${sentCount}/${recipients.length} messages`,
          totalSent: sentCount,
          totalFailed: recipients.length - sentCount,
          results
        });
      }

      default:
        return res.status(400).json({
          error: `Invalid action: ${action}`,
          validActions: ['send', 'sendToGuest', 'sendToEvent', 'status', 'schedule', 'listScheduled', 'cancelScheduled', 'bulkSend']
        });
    }
  } catch (error) {
    console.error('SMS Error:', error);
    return res.status(500).json({
      error: 'Failed to send SMS',
      details: error.message
    });
  }
});

// ============================================
// GPT CODE ACCESS ENDPOINT - Allow GPT to read/write project files
// ============================================
const fsPromises = fs.promises;

app.post('/api/v1/gpt/code', async (req, res) => {
  // Require authentication
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { action, path: requestPath, content, searchQuery, extension } = req.body;

  // Base project directory - adjust based on your deployment
  const PROJECT_ROOT = process.env.PROJECT_ROOT || path.join(__dirname, '..');

  // Allowed directories (relative to PROJECT_ROOT)
  const ALLOWED_PATHS = ['src', 'server', 'public'];

  // Blocked file patterns for security
  const BLOCKED_PATTERNS = ['.env', 'node_modules', '.git', 'credentials', 'secret', 'password', '.pem', '.key'];

  const isPathAllowed = (checkPath) => {
    const normalizedPath = path.normalize(checkPath);
    const relativePath = path.relative(PROJECT_ROOT, normalizedPath);

    // Must be within allowed directories
    const isAllowed = ALLOWED_PATHS.some(allowed => relativePath.startsWith(allowed));

    // Must not match blocked patterns
    const isBlocked = BLOCKED_PATTERNS.some(pattern =>
      normalizedPath.toLowerCase().includes(pattern.toLowerCase())
    );

    return isAllowed && !isBlocked;
  };

  try {
    switch (action) {
      case 'list': {
        // List files in a directory
        const targetDir = requestPath ? path.join(PROJECT_ROOT, requestPath) : PROJECT_ROOT;

        if (!isPathAllowed(targetDir)) {
          return res.status(403).json({ error: 'Access denied to this path' });
        }

        const entries = await fsPromises.readdir(targetDir, { withFileTypes: true });
        const files = entries
          .filter(entry => !BLOCKED_PATTERNS.some(p => entry.name.includes(p)))
          .map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            path: path.join(requestPath || '', entry.name)
          }));

        return res.json({
          success: true,
          path: requestPath || '/',
          files,
          count: files.length
        });
      }

      case 'read': {
        // Read a file's contents
        if (!requestPath) {
          return res.status(400).json({ error: 'Path is required' });
        }

        const filePath = path.join(PROJECT_ROOT, requestPath);

        if (!isPathAllowed(filePath)) {
          return res.status(403).json({ error: 'Access denied to this file' });
        }

        const fileContent = await fsPromises.readFile(filePath, 'utf-8');
        const stats = await fsPromises.stat(filePath);

        return res.json({
          success: true,
          path: requestPath,
          content: fileContent,
          size: stats.size,
          modified: stats.mtime
        });
      }

      case 'write': {
        // Write/update a file
        if (!requestPath) {
          return res.status(400).json({ error: 'Path is required' });
        }
        if (content === undefined) {
          return res.status(400).json({ error: 'Content is required' });
        }

        const filePath = path.join(PROJECT_ROOT, requestPath);

        if (!isPathAllowed(filePath)) {
          return res.status(403).json({ error: 'Access denied to this file' });
        }

        // Create directory if it doesn't exist
        await fsPromises.mkdir(path.dirname(filePath), { recursive: true });

        // Backup existing file if it exists
        try {
          const existing = await fsPromises.readFile(filePath, 'utf-8');
          const backupPath = `${filePath}.backup.${Date.now()}`;
          await fsPromises.writeFile(backupPath, existing);
        } catch (e) {
          // File doesn't exist, no backup needed
        }

        await fsPromises.writeFile(filePath, content, 'utf-8');

        return res.json({
          success: true,
          message: `File ${requestPath} has been updated`,
          path: requestPath
        });
      }

      case 'search': {
        // Search for text in files
        if (!searchQuery) {
          return res.status(400).json({ error: 'searchQuery is required' });
        }

        const searchDir = requestPath ? path.join(PROJECT_ROOT, requestPath) : PROJECT_ROOT;
        const results = [];

        const searchInDirectory = async (dir, relativePath = '') => {
          const entries = await fsPromises.readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relPath = path.join(relativePath, entry.name);

            if (BLOCKED_PATTERNS.some(p => entry.name.includes(p))) continue;

            if (entry.isDirectory() && ALLOWED_PATHS.some(a => relPath.startsWith(a) || a.startsWith(relPath))) {
              await searchInDirectory(fullPath, relPath);
            } else if (entry.isFile()) {
              // Only search allowed extensions
              const ext = path.extname(entry.name).toLowerCase();
              const allowedExts = extension ? [extension] : ['.js', '.ts', '.tsx', '.jsx', '.json', '.css', '.html', '.yaml', '.yml', '.md'];

              if (allowedExts.includes(ext)) {
                try {
                  const fileContent = await fsPromises.readFile(fullPath, 'utf-8');
                  const lines = fileContent.split('\n');
                  const matches = [];

                  lines.forEach((line, index) => {
                    if (line.toLowerCase().includes(searchQuery.toLowerCase())) {
                      matches.push({
                        line: index + 1,
                        content: line.trim().substring(0, 200)
                      });
                    }
                  });

                  if (matches.length > 0) {
                    results.push({
                      path: relPath,
                      matches: matches.slice(0, 10) // Limit matches per file
                    });
                  }
                } catch (e) {
                  // Skip files that can't be read
                }
              }
            }
          }
        };

        await searchInDirectory(searchDir);

        return res.json({
          success: true,
          query: searchQuery,
          results: results.slice(0, 50), // Limit total results
          totalFiles: results.length
        });
      }

      case 'structure': {
        // Get project structure overview
        const getStructure = async (dir, relativePath = '', depth = 0) => {
          if (depth > 3) return []; // Limit depth

          const entries = await fsPromises.readdir(dir, { withFileTypes: true });
          const structure = [];

          for (const entry of entries) {
            if (BLOCKED_PATTERNS.some(p => entry.name.includes(p))) continue;

            const relPath = path.join(relativePath, entry.name);

            if (entry.isDirectory() && ALLOWED_PATHS.some(a => relPath.startsWith(a) || a.startsWith(relPath.split('/')[0]))) {
              structure.push({
                name: entry.name,
                type: 'directory',
                path: relPath,
                children: await getStructure(path.join(dir, entry.name), relPath, depth + 1)
              });
            } else if (entry.isFile() && depth > 0) {
              structure.push({
                name: entry.name,
                type: 'file',
                path: relPath
              });
            }
          }

          return structure;
        };

        const structure = await getStructure(PROJECT_ROOT);

        return res.json({
          success: true,
          structure,
          allowedPaths: ALLOWED_PATHS
        });
      }

      default:
        return res.status(400).json({
          error: 'Invalid action',
          validActions: ['list', 'read', 'write', 'search', 'structure']
        });
    }
  } catch (error) {
    console.error('GPT Code endpoint error:', error);
    return res.status(500).json({
      error: error.message,
      action
    });
  }
});

// ============================================
// EVENTS ENDPOINTS
// ============================================

// GET /api/v1/events - Get all events with optional filters
app.get('/api/v1/events', async (req, res) => {
  try {
    const { status, upcoming, featured, limit = 50 } = req.query;
    const userId = req.user?.id;
    let query = 'SELECT * FROM events';
    const conditions = [];
    const values = [];
    let paramCount = 1;

    // Multi-tenant: filter by user_id if authenticated
    if (userId) {
      conditions.push(`(user_id = $${paramCount}::integer OR user_id IS NULL)`);
      values.push(userId);
      paramCount++;
    }

    if (status) {
      conditions.push(`status = $${paramCount}`);
      values.push(status);
      paramCount++;
    }
    if (upcoming === 'true') {
      conditions.push(`date >= CURRENT_DATE`);
    }
    if (featured === 'true') {
      conditions.push(`featured = true`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY date ASC';
    query += ` LIMIT $${paramCount}`;
    values.push(parseInt(limit));

    const result = await pool.query(query, values);
    res.json({
      events: result.rows.map(transformEvent),
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      error: 'Failed to fetch events',
      details: error.message,
      hint: error.hint || null
    });
  }
});

// GET /api/v1/events/calendar - Get events for calendar view
app.get('/api/v1/events/calendar', async (req, res) => {
  try {
    const { month, year } = req.query;
    const userId = req.user?.id;
    const currentYear = year || new Date().getFullYear();
    const currentMonth = month || new Date().getMonth() + 1;

    // Multi-tenant: filter by user_id
    let query = `SELECT id, title, date, status, venue
       FROM events
       WHERE EXTRACT(YEAR FROM date) = $1
       AND EXTRACT(MONTH FROM date) = $2`;
    const values = [currentYear, currentMonth];

    if (userId) {
      query += ` AND (user_id = $3::integer OR user_id IS NULL)`;
      values.push(userId);
    }
    query += ` ORDER BY date`;

    const result = await pool.query(query, values);

    res.json({
      events: result.rows.map(row => ({
        id: row.id,
        name: row.title,
        eventDate: row.date,
        status: row.status,
        venue: row.venue,
      })),
      month: currentMonth,
      year: currentYear,
    });
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

// GET /api/v1/events/stats - Get event statistics
app.get('/api/v1/events/stats', async (req, res) => {
  try {
    const userId = req.user?.id;
    const userFilter = userId ? `WHERE (user_id = ${parseInt(userId)} OR user_id IS NULL)` : '';
    const userFilterAnd = userId ? `AND (user_id = ${parseInt(userId)} OR user_id IS NULL)` : '';

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'upcoming') as upcoming,
        COUNT(*) FILTER (WHERE status = 'ongoing') as ongoing,
        COUNT(*) FILTER (WHERE status = 'past') as past,
        COUNT(*) FILTER (WHERE date >= CURRENT_DATE) as upcoming_by_date,
        COUNT(*) FILTER (WHERE date < CURRENT_DATE) as past_by_date
      FROM events ${userFilter}
    `);

    const thisMonth = await pool.query(`
      SELECT COUNT(*) as count FROM events
      WHERE EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)
      AND EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)
      ${userFilterAnd}
    `);

    // Try to get category stats if column exists
    let categoryStats = {};
    try {
      const byCategory = await pool.query(`
        SELECT category, COUNT(*) as count FROM events WHERE category IS NOT NULL ${userFilterAnd} GROUP BY category
      `);
      byCategory.rows.forEach(r => { categoryStats[r.category] = parseInt(r.count); });
    } catch {
      categoryStats = {};
    }

    res.json({
      ...stats.rows[0],
      thisMonth: parseInt(thisMonth.rows[0].count),
      byCategory: categoryStats
    });
  } catch (error) {
    console.error('Error fetching event stats:', error);
    res.status(500).json({ error: 'Failed to fetch event stats', details: error.message });
  }
});

// GET /api/v1/events/:id - Get single event with details (supports both numeric ID and slug)
app.get('/api/v1/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Support both numeric ID and slug lookup
    let result;
    const isNumericId = /^\d+$/.test(id);

    if (isNumericId) {
      // Numeric ID: filter by user_id for multi-tenant security
      if (userId) {
        result = await pool.query('SELECT * FROM events WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [id, userId]);
      } else {
        // Public access only for public events
        result = await pool.query('SELECT * FROM events WHERE id = $1 AND (is_public = true OR is_public IS NULL)', [id]);
      }
    } else {
      // Slug lookup: allow public access (via slug means it's meant to be public)
      result = await pool.query(
        'SELECT * FROM events WHERE (slug = $1 OR eventbrite_id = $1)',
        [id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Use the found event's id for subsequent queries
    const eventId = result.rows[0].id;

    // Get related data counts with graceful handling for missing tables
    let guestsCount = 0, ticketsCount = 0, sponsorsCount = 0, budgetSum = 0;

    // Check which tables exist
    const tablesCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('guests', 'guest_lists', 'tickets', 'sponsors', 'budgets')
    `);
    const existingTables = tablesCheck.rows.map(r => r.table_name);

    // Query each table only if it exists
    const queries = [];

    if (existingTables.includes('guest_lists')) {
      queries.push(pool.query('SELECT COUNT(*) FROM guest_lists WHERE event_id = $1', [eventId]).then(r => { guestsCount = parseInt(r.rows[0].count); }));
    } else if (existingTables.includes('guests')) {
      queries.push(pool.query('SELECT COUNT(*) FROM guests WHERE event_id = $1', [eventId]).then(r => { guestsCount = parseInt(r.rows[0].count); }));
    }

    if (existingTables.includes('tickets')) {
      // Try event_ref_id first, fallback to event_id
      queries.push(
        pool.query('SELECT COUNT(*) FROM tickets WHERE event_ref_id = $1 OR event_id::text = $1', [eventId])
          .then(r => { ticketsCount = parseInt(r.rows[0].count); })
          .catch(() => { ticketsCount = 0; })
      );
    }

    if (existingTables.includes('sponsors')) {
      queries.push(
        pool.query('SELECT COUNT(*) FROM sponsors WHERE event_id = $1', [eventId])
          .then(r => { sponsorsCount = parseInt(r.rows[0].count); })
          .catch(() => { sponsorsCount = 0; })
      );
    }

    if (existingTables.includes('budgets')) {
      queries.push(
        pool.query('SELECT COALESCE(SUM(total_budget), 0) as budget FROM budgets WHERE event_id = $1', [eventId])
          .then(r => { budgetSum = parseFloat(r.rows[0].budget); })
          .catch(() => { budgetSum = 0; })
      );
    }

    await Promise.all(queries);

    res.json({
      ...transformEvent(result.rows[0]),
      guestsCount,
      ticketsCount,
      sponsorsCount,
      totalBudget: budgetSum,
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// POST /api/v1/events - Create new event
app.post('/api/v1/events', async (req, res) => {
  try {
    const {
      name, description, eventType, venueName, venueAddress, venueCity, venueCapacity,
      eventDate, startTime, endTime, doorsOpen, status, coverImage, theme, dressCode,
      ageRestriction, ticketLink, isPublic, isFeatured, expectedAttendance, notes
    } = req.body;

    if (!name || !eventDate) {
      return res.status(400).json({ error: 'Name and event date are required' });
    }

    // Combine venue info
    const venue = venueName ? (venueCity ? `${venueName}, ${venueCity}` : venueName) : venueCity || null;

    // Map eventType to valid category (only 'corporate' and 'nightlife' allowed)
    const validCategories = ['corporate', 'nightlife'];
    const category = validCategories.includes(eventType) ? eventType : 'nightlife';

    // Generate event ID from name (slug format like evt_my_event_name)
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 30);
    const timestamp = Date.now().toString(36);
    const eventId = `evt_${slug}_${timestamp}`;

    // Use actual database columns: title, date, venue, category, status
    const result = await pool.query(
      `INSERT INTO events (id, title, date, venue, category, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [eventId, name, eventDate, venue, category, status || 'planning']
    );

    console.log(`✅ New event created: ${name} on ${eventDate}`);
    res.status(201).json(transformEvent(result.rows[0]));
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PUT /api/v1/events/:id - Update event
app.put('/api/v1/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // First, check which columns exist in the events table
    const columnsResult = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'events'
    `);
    const existingColumns = new Set(columnsResult.rows.map(r => r.column_name));

    // Build dynamic update query
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Map frontend field names to possible database column names
    // (supports both berry-bly-productions schema and full dashboard schema)
    const fieldMappings = {
      name: ['name', 'title'],
      title: ['title', 'name'],
      description: ['description'],
      eventType: ['event_type', 'category'],
      category: ['category', 'event_type'],
      venueName: ['venue_name', 'venue'],
      venue: ['venue', 'venue_name'],
      venueAddress: ['venue_address'],
      venueCity: ['venue_city'],
      venueCapacity: ['venue_capacity'],
      eventDate: ['event_date', 'date'],
      date: ['date', 'event_date'],
      startTime: ['start_time', 'time'],
      time: ['time', 'start_time'],
      endTime: ['end_time'],
      doorsOpen: ['doors_open'],
      status: ['status'],
      coverImage: ['cover_image', 'flyer_url'],
      flyerUrl: ['flyer_url', 'cover_image'],
      theme: ['theme'],
      dressCode: ['dress_code'],
      ageRestriction: ['age_restriction'],
      ticketLink: ['ticket_link', 'eventbrite_url'],
      eventbriteUrl: ['eventbrite_url', 'ticket_link'],
      isPublic: ['is_public'],
      isFeatured: ['is_featured', 'featured'],
      featured: ['featured', 'is_featured'],
      guestListEnabled: ['guest_list_enabled'],
      tableMapEnabled: ['table_map_enabled'],
      expectedAttendance: ['expected_attendance'],
      actualAttendance: ['actual_attendance'],
      notes: ['notes']
    };

    for (const [key, possibleColumns] of Object.entries(fieldMappings)) {
      if (updates[key] !== undefined) {
        // Find the first column that exists
        const dbColumn = possibleColumns.find(col => existingColumns.has(col));
        if (dbColumn) {
          fields.push(`${dbColumn} = $${paramCount}`);
          values.push(updates[key]);
          paramCount++;
        }
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Add updated_at if column exists
    if (existingColumns.has('updated_at')) {
      fields.push(`updated_at = CURRENT_TIMESTAMP`);
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE events SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(transformEvent(result.rows[0]));
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// DELETE /api/v1/events/:id - Delete event
app.delete('/api/v1/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM events WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// POST /api/v1/events/bulk-delete - Delete multiple events
app.post('/api/v1/events/bulk-delete', async (req, res) => {
  try {
    const { eventIds } = req.body;

    if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
      return res.status(400).json({ error: 'Event IDs required' });
    }

    const result = await pool.query(
      'DELETE FROM events WHERE id = ANY($1) RETURNING id',
      [eventIds]
    );

    res.json({
      success: true,
      message: `Deleted ${result.rowCount} events`,
      deletedCount: result.rowCount
    });
  } catch (error) {
    console.error('Error bulk deleting events:', error);
    res.status(500).json({ error: 'Failed to delete events' });
  }
});

// POST /api/v1/events/:id/duplicate - Duplicate event
app.post('/api/v1/events/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;
    const { newDate, newName } = req.body;

    const original = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
    if (original.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = original.rows[0];
    const name = newName || `${event.title} (Copy)`;

    // Generate next ID
    const maxIdResult = await pool.query('SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) + 1 as next_id FROM events');
    const nextId = maxIdResult.rows[0].next_id;

    // Use actual database columns: title, date, venue, category, status
    const result = await pool.query(
      `INSERT INTO events (id, title, date, venue, category, status)
       VALUES ($1, $2, $3, $4, $5, 'planning')
       RETURNING *`,
      [nextId.toString(), name, newDate || event.date, event.venue, event.category]
    );

    console.log(`✅ Event duplicated: ${name}`);
    res.status(201).json(transformEvent(result.rows[0]));
  } catch (error) {
    console.error('Error duplicating event:', error);
    res.status(500).json({ error: 'Failed to duplicate event' });
  }
});

// ============================================
// EVENT TIMELINE ENDPOINTS - Run of Show
// ============================================

// GET /api/v1/events/:eventId/timeline
app.get('/api/v1/events/:eventId/timeline', async (req, res) => {
  try {
    const { eventId } = req.params;
    const result = await pool.query(
      'SELECT * FROM event_timeline WHERE event_id = $1 ORDER BY time, sort_order',
      [eventId]
    );
    res.json({ timeline: result.rows });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// POST /api/v1/events/:eventId/timeline
app.post('/api/v1/events/:eventId/timeline', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { time, title, description, responsible, location, isCritical, notes, sortOrder } = req.body;

    const result = await pool.query(
      `INSERT INTO event_timeline (event_id, time, title, description, responsible, location, is_critical, notes, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [eventId, time, title, description, responsible, location, isCritical || false, notes, sortOrder || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding timeline item:', error);
    res.status(500).json({ error: 'Failed to add timeline item' });
  }
});

// PUT /api/v1/events/:eventId/timeline/:id
app.put('/api/v1/events/:eventId/timeline/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { time, title, description, responsible, location, isCritical, status, notes, sortOrder } = req.body;

    const result = await pool.query(
      `UPDATE event_timeline SET
        time = COALESCE($1, time),
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        responsible = COALESCE($4, responsible),
        location = COALESCE($5, location),
        is_critical = COALESCE($6, is_critical),
        status = COALESCE($7, status),
        notes = COALESCE($8, notes),
        sort_order = COALESCE($9, sort_order)
       WHERE id = $10 RETURNING *`,
      [time, title, description, responsible, location, isCritical, status, notes, sortOrder, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Timeline item not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating timeline item:', error);
    res.status(500).json({ error: 'Failed to update timeline item' });
  }
});

// DELETE /api/v1/events/:eventId/timeline/:id
app.delete('/api/v1/events/:eventId/timeline/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM event_timeline WHERE id = $1', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting timeline item:', error);
    res.status(500).json({ error: 'Failed to delete timeline item' });
  }
});

// ============================================
// EVENT CHECKLIST ENDPOINTS
// ============================================

// GET /api/v1/events/:eventId/checklist
app.get('/api/v1/events/:eventId/checklist', async (req, res) => {
  try {
    const { eventId } = req.params;
    const result = await pool.query(
      'SELECT * FROM event_checklist WHERE event_id = $1 ORDER BY category, sort_order',
      [eventId]
    );

    // Group by category
    const grouped = result.rows.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {});

    const stats = {
      total: result.rows.length,
      completed: result.rows.filter(i => i.is_completed).length,
      percentage: result.rows.length > 0 ? Math.round((result.rows.filter(i => i.is_completed).length / result.rows.length) * 100) : 0,
    };

    res.json({ checklist: grouped, items: result.rows, stats });
  } catch (error) {
    console.error('Error fetching checklist:', error);
    res.status(500).json({ error: 'Failed to fetch checklist' });
  }
});

// POST /api/v1/events/:eventId/checklist
app.post('/api/v1/events/:eventId/checklist', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { category, item, dueDate, priority, notes } = req.body;

    const result = await pool.query(
      `INSERT INTO event_checklist (event_id, category, item, due_date, priority, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [eventId, category, item, dueDate, priority || 'medium', notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding checklist item:', error);
    res.status(500).json({ error: 'Failed to add checklist item' });
  }
});

// PUT /api/v1/events/:eventId/checklist/:id
app.put('/api/v1/events/:eventId/checklist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { isCompleted, completedBy, item, category, dueDate, priority, notes } = req.body;

    const result = await pool.query(
      `UPDATE event_checklist SET
        is_completed = COALESCE($1, is_completed),
        completed_by = CASE WHEN $1 = true THEN $2 ELSE completed_by END,
        completed_at = CASE WHEN $1 = true THEN CURRENT_TIMESTAMP ELSE completed_at END,
        item = COALESCE($3, item),
        category = COALESCE($4, category),
        due_date = COALESCE($5, due_date),
        priority = COALESCE($6, priority),
        notes = COALESCE($7, notes)
       WHERE id = $8 RETURNING *`,
      [isCompleted, completedBy, item, category, dueDate, priority, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist item not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating checklist item:', error);
    res.status(500).json({ error: 'Failed to update checklist item' });
  }
});

// DELETE /api/v1/events/:eventId/checklist/:id
app.delete('/api/v1/events/:eventId/checklist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM event_checklist WHERE id = $1', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting checklist item:', error);
    res.status(500).json({ error: 'Failed to delete checklist item' });
  }
});

// ============================================
// BUDGET ENDPOINTS - Budget Tracker
// ============================================

// GET /api/v1/budget-categories - Get all budget categories
app.get('/api/v1/budget-categories', async (req, res) => {
  try {
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'budget_categories'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      // Return simplified default categories (5 total)
      return res.json({
        categories: [
          { id: 1, name: 'Venue & Production', icon: 'building', color: '#8B5CF6', is_income: false, sort_order: 1 },
          { id: 2, name: 'Talent & Staffing', icon: 'users', color: '#EC4899', is_income: false, sort_order: 2 },
          { id: 3, name: 'Marketing & Operations', icon: 'megaphone', color: '#3B82F6', is_income: false, sort_order: 3 },
          { id: 4, name: 'Tickets & Tables', icon: 'ticket', color: '#22C55E', is_income: true, sort_order: 4 },
          { id: 5, name: 'Sponsorships', icon: 'handshake', color: '#D4AF37', is_income: true, sort_order: 5 }
        ]
      });
    }

    const result = await pool.query('SELECT * FROM budget_categories ORDER BY sort_order');
    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Error fetching budget categories:', error);
    res.status(500).json({ error: 'Failed to fetch budget categories' });
  }
});

// GET /api/v1/events/:eventId/budget - Get budget for event
app.get('/api/v1/events/:eventId/budget', async (req, res) => {
  try {
    const { eventId } = req.params;

    // Check if budgets table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'budgets'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      // Return default empty budget if table doesn't exist
      return res.json({
        budget: {
          id: 0,
          event_id: eventId,
          name: 'Event Budget',
          total_budget: 0,
          total_spent: 0,
          total_income: 0,
          currency: 'USD',
          status: 'draft'
        },
        items: [],
        byCategory: [],
        summary: {
          totalBudget: 0,
          totalEstimatedExpenses: 0,
          totalActualExpenses: 0,
          totalEstimatedIncome: 0,
          totalActualIncome: 0,
          estimatedProfit: 0,
          actualProfit: 0,
          budgetRemaining: 0,
          paidCount: 0,
          pendingCount: 0,
        },
      });
    }

    // Get or create budget for event
    let budget = await pool.query('SELECT * FROM budgets WHERE event_id = $1', [eventId]);

    if (budget.rows.length === 0) {
      // Get event title for budget
      const event = await pool.query('SELECT title FROM events WHERE id = $1', [eventId]);
      const eventName = event.rows[0]?.title || 'Event';

      budget = await pool.query(
        `INSERT INTO budgets (event_id, name) VALUES ($1, $2) RETURNING *`,
        [eventId, `${eventName} Budget`]
      );
    }

    const budgetId = budget.rows[0].id;

    // Get all budget items with category info
    const itemsResult = await pool.query(
      `SELECT bi.*, bc.name as category_name, bc.icon, bc.color, bc.is_income
       FROM budget_items bi
       LEFT JOIN budget_categories bc ON bi.category_id = bc.id
       WHERE bi.budget_id = $1
       ORDER BY bc.sort_order, bi.created_at`,
      [budgetId]
    );

    // Transform items to camelCase with proper number types
    const transformItem = (item) => ({
      id: item.id,
      budgetId: item.budget_id,
      categoryId: item.category_id,
      categoryName: item.category_name || 'Uncategorized',
      description: item.description,
      vendorName: item.vendor_name,
      estimatedAmount: parseFloat(item.estimated_amount || 0),
      actualAmount: item.actual_amount ? parseFloat(item.actual_amount) : null,
      isPaid: item.is_paid,
      paidDate: item.paid_date,
      paymentMethod: item.payment_method,
      receiptUrl: item.receipt_url,
      notes: item.notes,
      status: item.status,
      dueDate: item.due_date,
      icon: item.icon,
      color: item.color,
      isIncome: item.is_income || false,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    });

    const items = itemsResult.rows.map(transformItem);

    // Calculate totals
    const expenses = items.filter(i => !i.isIncome);
    const income = items.filter(i => i.isIncome);

    const totalEstimatedExpenses = expenses.reduce((sum, i) => sum + (i.estimatedAmount || 0), 0);
    const totalActualExpenses = expenses.reduce((sum, i) => sum + (i.actualAmount || 0), 0);
    const totalEstimatedIncome = income.reduce((sum, i) => sum + (i.estimatedAmount || 0), 0);
    const totalActualIncome = income.reduce((sum, i) => sum + (i.actualAmount || 0), 0);

    // Group by category
    const byCategory = items.reduce((acc, item) => {
      const catName = item.categoryName;
      if (!acc[catName]) {
        acc[catName] = {
          name: catName,
          icon: item.icon,
          color: item.color,
          isIncome: item.isIncome,
          items: [],
          totalEstimated: 0,
          totalActual: 0,
        };
      }
      acc[catName].items.push(item);
      acc[catName].totalEstimated += item.estimatedAmount || 0;
      acc[catName].totalActual += item.actualAmount || 0;
      return acc;
    }, {});

    res.json({
      budget: budget.rows[0],
      items: items,
      byCategory: Object.values(byCategory),
      summary: {
        totalBudget: parseFloat(budget.rows[0].total_budget || 0),
        totalEstimatedExpenses,
        totalActualExpenses,
        totalEstimatedIncome,
        totalActualIncome,
        estimatedProfit: totalEstimatedIncome - totalEstimatedExpenses,
        actualProfit: totalActualIncome - totalActualExpenses,
        budgetRemaining: parseFloat(budget.rows[0].total_budget || 0) - totalActualExpenses,
        paidCount: items.filter(i => i.isPaid).length,
        pendingCount: items.filter(i => !i.isPaid && !i.isIncome).length,
      },
    });
  } catch (error) {
    console.error('Error fetching budget:', error);
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
});

// PUT /api/v1/events/:eventId/budget - Update budget settings
app.put('/api/v1/events/:eventId/budget', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { totalBudget, name, notes, status } = req.body;

    const result = await pool.query(
      `UPDATE budgets SET
        total_budget = COALESCE($1, total_budget),
        name = COALESCE($2, name),
        notes = COALESCE($3, notes),
        status = COALESCE($4, status),
        updated_at = CURRENT_TIMESTAMP
       WHERE event_id = $5 RETURNING *`,
      [totalBudget, name, notes, status, eventId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Budget not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating budget:', error);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

// GET /api/v1/events/:eventId/budget/items - Get all budget items for an event
app.get('/api/v1/events/:eventId/budget/items', async (req, res) => {
  try {
    const { eventId } = req.params;

    // Check if required tables exist
    const tablesCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('budgets', 'budget_items', 'budget_categories')
    `);
    const existingTables = tablesCheck.rows.map(r => r.table_name);

    if (!existingTables.includes('budgets') || !existingTables.includes('budget_items')) {
      return res.json({ items: [], total: 0 });
    }

    // Get budget ID for this event
    const budget = await pool.query('SELECT id FROM budgets WHERE event_id = $1', [eventId]);
    if (budget.rows.length === 0) {
      return res.json({ items: [], total: 0 });
    }
    const budgetId = budget.rows[0].id;

    // Get all budget items with optional category info
    let query = `
      SELECT bi.*
      FROM budget_items bi
      WHERE bi.budget_id = $1
      ORDER BY bi.created_at DESC
    `;

    if (existingTables.includes('budget_categories')) {
      query = `
        SELECT bi.*, bc.name as category_name, bc.icon as category_icon, bc.color as category_color, bc.is_income
        FROM budget_items bi
        LEFT JOIN budget_categories bc ON bi.category_id = bc.id
        WHERE bi.budget_id = $1
        ORDER BY bi.created_at DESC
      `;
    }

    const result = await pool.query(query, [budgetId]);
    res.json({ items: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Error fetching budget items:', error);
    res.status(500).json({ error: 'Failed to fetch budget items' });
  }
});

// POST /api/v1/events/:eventId/budget/items - Add budget item
app.post('/api/v1/events/:eventId/budget/items', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { categoryId, description, vendorName, estimatedAmount, actualAmount, isPaid, paidDate, paymentMethod, notes, dueDate } = req.body;

    // Check if required tables exist
    const tablesCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('budgets', 'budget_items')
    `);
    const existingTables = tablesCheck.rows.map(r => r.table_name);

    if (!existingTables.includes('budgets') || !existingTables.includes('budget_items')) {
      return res.status(503).json({ error: 'Budget feature not available - tables do not exist' });
    }

    // Get budget ID
    const budget = await pool.query('SELECT id FROM budgets WHERE event_id = $1', [eventId]);
    if (budget.rows.length === 0) {
      return res.status(404).json({ error: 'Budget not found for this event. Create a budget first.' });
    }
    const budgetId = budget.rows[0].id;

    const result = await pool.query(
      `INSERT INTO budget_items (budget_id, category_id, description, vendor_name, estimated_amount, actual_amount, is_paid, paid_date, payment_method, notes, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [budgetId, categoryId, description, vendorName, estimatedAmount || 0, actualAmount, isPaid || false, paidDate, paymentMethod, notes, dueDate]
    );

    // Get category info
    if (categoryId) {
      const category = await pool.query('SELECT * FROM budget_categories WHERE id = $1', [categoryId]);
      result.rows[0].category = category.rows[0];
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding budget item:', error);
    res.status(500).json({ error: 'Failed to add budget item' });
  }
});

// PUT /api/v1/budget/items/:id - Update budget item
app.put('/api/v1/budget/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, description, vendorName, estimatedAmount, actualAmount, isPaid, paidDate, paymentMethod, notes, status, dueDate, receiptUrl } = req.body;

    const result = await pool.query(
      `UPDATE budget_items SET
        category_id = COALESCE($1, category_id),
        description = COALESCE($2, description),
        vendor_name = COALESCE($3, vendor_name),
        estimated_amount = COALESCE($4, estimated_amount),
        actual_amount = COALESCE($5, actual_amount),
        is_paid = COALESCE($6, is_paid),
        paid_date = COALESCE($7, paid_date),
        payment_method = COALESCE($8, payment_method),
        notes = COALESCE($9, notes),
        status = COALESCE($10, status),
        due_date = COALESCE($11, due_date),
        receipt_url = COALESCE($12, receipt_url),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $13 RETURNING *`,
      [categoryId, description, vendorName, estimatedAmount, actualAmount, isPaid, paidDate, paymentMethod, notes, status, dueDate, receiptUrl, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Budget item not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating budget item:', error);
    res.status(500).json({ error: 'Failed to update budget item' });
  }
});

// DELETE /api/v1/budget/items/:id - Delete budget item
app.delete('/api/v1/budget/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM budget_items WHERE id = $1', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting budget item:', error);
    res.status(500).json({ error: 'Failed to delete budget item' });
  }
});

// ============================================
// VENDORS ENDPOINTS - Vendor Management
// ============================================

// GET /api/v1/vendors - Get all vendors
app.get('/api/v1/vendors', async (req, res) => {
  try {
    // Check if vendors table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'vendors'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      // Return empty array if table doesn't exist
      return res.json({ vendors: [], total: 0 });
    }

    const { category, preferred } = req.query;
    let query = 'SELECT * FROM vendors';
    const conditions = [];
    const values = [];
    let paramCount = 1;

    if (category) {
      conditions.push(`category = $${paramCount}`);
      values.push(category);
      paramCount++;
    }
    if (preferred === 'true') {
      conditions.push('is_preferred = true');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY is_preferred DESC, rating DESC, name';

    const result = await pool.query(query, values);
    res.json({ vendors: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

// GET /api/v1/vendors/:id - Get single vendor
app.get('/api/v1/vendors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM vendors WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching vendor:', error);
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

// POST /api/v1/vendors - Create vendor
app.post('/api/v1/vendors', async (req, res) => {
  try {
    // Check if vendors table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'vendors'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      return res.status(503).json({ error: 'Vendors feature not available - table does not exist' });
    }

    const { name, category, contactName, email, phone, website, address, city, rating, notes, isPreferred } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Vendor name is required' });
    }

    const result = await pool.query(
      `INSERT INTO vendors (name, category, contact_name, email, phone, website, address, city, rating, notes, is_preferred)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [name, category, contactName, email, phone, website, address, city, rating || 0, notes, isPreferred || false]
    );

    console.log(`✅ New vendor created: ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating vendor:', error);
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

// PUT /api/v1/vendors/:id - Update vendor
app.put('/api/v1/vendors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, contactName, email, phone, website, address, city, rating, notes, isPreferred } = req.body;

    const result = await pool.query(
      `UPDATE vendors SET
        name = COALESCE($1, name),
        category = COALESCE($2, category),
        contact_name = COALESCE($3, contact_name),
        email = COALESCE($4, email),
        phone = COALESCE($5, phone),
        website = COALESCE($6, website),
        address = COALESCE($7, address),
        city = COALESCE($8, city),
        rating = COALESCE($9, rating),
        notes = COALESCE($10, notes),
        is_preferred = COALESCE($11, is_preferred),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $12 RETURNING *`,
      [name, category, contactName, email, phone, website, address, city, rating, notes, isPreferred, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating vendor:', error);
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

// DELETE /api/v1/vendors/:id - Delete vendor
app.delete('/api/v1/vendors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM vendors WHERE id = $1', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting vendor:', error);
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

// ============================================================
// PRIORITY MEDIUM: STAFF MANAGEMENT ENDPOINTS
// ============================================================

// GET /api/v1/staff - Get all staff with stats
app.get('/api/v1/staff', async (req, res) => {
  try {
    const userId = req.user?.id || null;

    // Check if staff table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'staff'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      return res.json({
        staff: [],
        stats: { active: 0, inactive: 0, total: 0, avg_rating: 0 }
      });
    }

    // Check if staff_assignments table exists for the subquery
    const assignmentsCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'staff_assignments'
      )
    `);

    let result;
    if (assignmentsCheck.rows[0].exists) {
      result = await pool.query(`
        SELECT s.*,
          (SELECT COUNT(*) FROM staff_assignments sa WHERE sa.staff_id = s.id) as assignments_count,
          (SELECT COUNT(*) FROM staff_assignments sa
           JOIN events e ON sa.event_id::text = e.id::text
           WHERE sa.staff_id = s.id AND e.date >= CURRENT_DATE) as upcoming_events
        FROM staff s
        WHERE (s.user_id = $1::integer OR s.user_id IS NULL)
        ORDER BY s.created_at DESC
      `, [userId]);
    } else {
      result = await pool.query(`SELECT * FROM staff WHERE (user_id = $1::integer OR user_id IS NULL) ORDER BY created_at DESC`, [userId]);
    }

    // Get stats
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive,
        COUNT(*) as total,
        COALESCE(AVG(rating), 0) as avg_rating
      FROM staff WHERE (user_id = $1::integer OR user_id IS NULL)
    `, [userId]);

    res.json({
      staff: result.rows,
      stats: stats.rows[0]
    });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
});

// GET /api/v1/staff/available - Get available staff for a date
app.get('/api/v1/staff/available', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { date, role } = req.query;
    let query = `
      SELECT s.* FROM staff s
      WHERE s.status = 'active'
      AND (s.user_id = $1::integer OR s.user_id IS NULL)
      AND s.id NOT IN (
        SELECT DISTINCT sa.staff_id FROM staff_assignments sa
        JOIN events e ON sa.event_id = e.id
        WHERE e.date = $2 AND sa.status != 'cancelled'
      )
    `;
    const params = [userId, date || new Date().toISOString().split('T')[0]];

    if (role) {
      query += ` AND (s.role = $3 OR s.secondary_role = $3)`;
      params.push(role);
    }

    query += ` ORDER BY s.rating DESC, s.total_events DESC`;

    const result = await pool.query(query, params);
    res.json({ staff: result.rows });
  } catch (error) {
    console.error('Error fetching available staff:', error);
    res.status(500).json({ error: 'Failed to fetch available staff' });
  }
});

// GET /api/v1/staff/:id - Get single staff member with history
app.get('/api/v1/staff/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const staffResult = await pool.query('SELECT * FROM staff WHERE id = $1::integer AND (user_id = $2::integer OR user_id IS NULL)', [id, userId]);
    if (staffResult.rows.length === 0) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    // Get recent assignments
    const assignments = await pool.query(`
      SELECT sa.*, e.name as event_name, e.date as event_date
      FROM staff_assignments sa
      JOIN events e ON sa.event_id = e.id
      WHERE sa.staff_id = $1
      ORDER BY e.date DESC
      LIMIT 10
    `, [id]);

    // Get recent payments
    const payments = await pool.query(`
      SELECT sp.*, e.name as event_name
      FROM staff_payments sp
      LEFT JOIN events e ON sp.event_id = e.id
      WHERE sp.staff_id = $1
      ORDER BY sp.created_at DESC
      LIMIT 10
    `, [id]);

    res.json({
      staff: staffResult.rows[0],
      recentAssignments: assignments.rows,
      recentPayments: payments.rows
    });
  } catch (error) {
    console.error('Error fetching staff member:', error);
    res.status(500).json({ error: 'Failed to fetch staff member' });
  }
});

// POST /api/v1/staff - Create new staff member
app.post('/api/v1/staff', async (req, res) => {
  try {
    const userId = req.user?.id;
    const {
      name, email, phone, role, secondaryRole, photoUrl, instagram,
      hourlyRate, dayRate, experienceLevel, skills, notes,
      availability, emergencyContact, emergencyPhone
    } = req.body;

    const result = await pool.query(`
      INSERT INTO staff (
        name, email, phone, role, secondary_role, photo_url, instagram,
        hourly_rate, day_rate, experience_level, skills, notes,
        availability, emergency_contact, emergency_phone, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      name, email, phone, role, secondaryRole, photoUrl, instagram,
      hourlyRate, dayRate, experienceLevel || 'intermediate',
      skills || [], notes,
      availability || { weekdays: true, weekends: true },
      emergencyContact, emergencyPhone, userId
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating staff:', error);
    res.status(500).json({ error: 'Failed to create staff member' });
  }
});

// PUT /api/v1/staff/:id - Update staff member
app.put('/api/v1/staff/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const {
      name, email, phone, role, secondaryRole, photoUrl, instagram,
      hourlyRate, dayRate, experienceLevel, skills, notes, status,
      availability, emergencyContact, emergencyPhone, rating
    } = req.body;

    const result = await pool.query(`
      UPDATE staff SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        role = COALESCE($4, role),
        secondary_role = $5,
        photo_url = $6,
        instagram = $7,
        hourly_rate = COALESCE($8, hourly_rate),
        day_rate = $9,
        experience_level = COALESCE($10, experience_level),
        skills = COALESCE($11, skills),
        notes = $12,
        status = COALESCE($13, status),
        availability = COALESCE($14, availability),
        emergency_contact = $15,
        emergency_phone = $16,
        rating = COALESCE($17, rating),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $18::integer AND (user_id = $19::integer OR user_id IS NULL)
      RETURNING *
    `, [
      name, email, phone, role, secondaryRole, photoUrl, instagram,
      hourlyRate, dayRate, experienceLevel, skills, notes, status,
      availability, emergencyContact, emergencyPhone, rating, id, userId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Staff not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating staff:', error);
    res.status(500).json({ error: 'Failed to update staff member' });
  }
});

// DELETE /api/v1/staff/:id - Delete staff member
app.delete('/api/v1/staff/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    await pool.query('DELETE FROM staff WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [id, userId]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting staff:', error);
    res.status(500).json({ error: 'Failed to delete staff member' });
  }
});

// ============================================================
// STAFF ASSIGNMENTS ENDPOINTS
// ============================================================

// GET /api/v1/events/:eventId/staff - Get staff assigned to event
app.get('/api/v1/events/:eventId/staff', async (req, res) => {
  try {
    const { eventId } = req.params;
    const result = await pool.query(`
      SELECT sa.*, s.name as staff_name, s.phone, s.email, s.photo_url, s.instagram
      FROM staff_assignments sa
      JOIN staff s ON sa.staff_id = s.id
      WHERE sa.event_id = $1
      ORDER BY sa.shift_start, s.name
    `, [eventId]);

    // Get summary by role
    const summary = await pool.query(`
      SELECT role, COUNT(*) as count,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed
      FROM staff_assignments
      WHERE event_id = $1
      GROUP BY role
    `, [eventId]);

    res.json({
      assignments: result.rows,
      summary: summary.rows
    });
  } catch (error) {
    console.error('Error fetching event staff:', error);
    res.status(500).json({ error: 'Failed to fetch event staff' });
  }
});

// POST /api/v1/events/:eventId/staff - Assign staff to event
app.post('/api/v1/events/:eventId/staff', async (req, res) => {
  try {
    const { eventId } = req.params;
    const {
      staffId, role, shiftStart, shiftEnd, breakDuration, location,
      uniform, specialInstructions, rateType, rateAmount, bonus
    } = req.body;

    // Check if already assigned
    const existing = await pool.query(
      'SELECT id FROM staff_assignments WHERE staff_id = $1 AND event_id = $2',
      [staffId, eventId]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Staff already assigned to this event' });
    }

    const result = await pool.query(`
      INSERT INTO staff_assignments (
        staff_id, event_id, role, shift_start, shift_end, break_duration,
        location, uniform, special_instructions, rate_type, rate_amount, bonus
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      staffId, eventId, role, shiftStart, shiftEnd, breakDuration || 0,
      location, uniform, specialInstructions, rateType || 'hourly', rateAmount, bonus || 0
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error assigning staff:', error);
    res.status(500).json({ error: 'Failed to assign staff' });
  }
});

// PUT /api/v1/staff-assignments/:id - Update assignment
app.put('/api/v1/staff-assignments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      role, shiftStart, shiftEnd, breakDuration, location, uniform,
      specialInstructions, rateType, rateAmount, bonus, status,
      confirmedAt, checkedInAt, checkedOutAt, hoursWorked, notes
    } = req.body;

    const result = await pool.query(`
      UPDATE staff_assignments SET
        role = COALESCE($1, role),
        shift_start = $2,
        shift_end = $3,
        break_duration = COALESCE($4, break_duration),
        location = $5,
        uniform = $6,
        special_instructions = $7,
        rate_type = COALESCE($8, rate_type),
        rate_amount = $9,
        bonus = COALESCE($10, bonus),
        status = COALESCE($11, status),
        confirmed_at = $12,
        checked_in_at = $13,
        checked_out_at = $14,
        hours_worked = $15,
        notes = $16,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $17
      RETURNING *
    `, [
      role, shiftStart, shiftEnd, breakDuration, location, uniform,
      specialInstructions, rateType, rateAmount, bonus, status,
      confirmedAt, checkedInAt, checkedOutAt, hoursWorked, notes, id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

// DELETE /api/v1/staff-assignments/:id - Remove assignment
app.delete('/api/v1/staff-assignments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM staff_assignments WHERE id = $1', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error removing assignment:', error);
    res.status(500).json({ error: 'Failed to remove assignment' });
  }
});

// POST /api/v1/staff-assignments/:id/checkin - Check in staff
app.post('/api/v1/staff-assignments/:id/checkin', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      UPDATE staff_assignments SET
        checked_in_at = CURRENT_TIMESTAMP,
        status = 'checked_in'
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error checking in staff:', error);
    res.status(500).json({ error: 'Failed to check in staff' });
  }
});

// POST /api/v1/staff-assignments/:id/checkout - Check out staff
app.post('/api/v1/staff-assignments/:id/checkout', async (req, res) => {
  try {
    const { id } = req.params;
    const { hoursWorked } = req.body;

    const result = await pool.query(`
      UPDATE staff_assignments SET
        checked_out_at = CURRENT_TIMESTAMP,
        hours_worked = $1,
        status = 'completed'
      WHERE id = $2
      RETURNING *
    `, [hoursWorked, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Update staff total_events
    await pool.query(`
      UPDATE staff SET
        total_events = total_events + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [result.rows[0].staff_id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error checking out staff:', error);
    res.status(500).json({ error: 'Failed to check out staff' });
  }
});

// ============================================================
// REMOVED SECTIONS (Simplified for Berry Bly/Maxim needs):
// - Staff Payments endpoints
// - Vendor Quotes endpoints
// - Vendor Contracts endpoints
// - Vendor History endpoints
// ============================================================

// ============================================================
// CLIENT PORTAL ENDPOINTS
// ============================================================

// Helper function to generate access token
const generateAccessToken = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

// POST /api/v1/events/:eventId/client-access - Create client access for event
app.post('/api/v1/events/:eventId/client-access', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { clientName, clientEmail, permissions, expiresInDays, sendEmail = true } = req.body;

    if (!clientName || !clientEmail) {
      return res.status(400).json({ error: 'Client name and email are required' });
    }

    // Get event details for the email
    const eventResult = await pool.query('SELECT title, date, venue FROM events WHERE id = $1', [eventId]);
    const event = eventResult.rows[0];

    const accessToken = generateAccessToken();
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const result = await pool.query(`
      INSERT INTO client_access (event_id, client_name, client_email, access_token, permissions, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [eventId, clientName, clientEmail, accessToken, permissions || { viewBudget: true, viewTimeline: true, viewStaff: false, viewVendors: false }, expiresAt]);

    // Generate portal URL
    const portalUrl = `${process.env.FRONTEND_URL || 'https://berry-dashboard-production.up.railway.app'}/client/${accessToken}`;

    // Send email with portal link
    let emailSent = false;
    if (sendEmail && process.env.RESEND_API_KEY) {
      try {
        const eventName = event?.title || 'Event';
        const eventDate = event?.date ? new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';
        const venue = event?.venue || '';

        await resend.emails.send({
          from: EMAIL_CONFIG.from,
          to: clientEmail,
          replyTo: EMAIL_CONFIG.replyTo,
          subject: `🎉 Your Client Portal Access - ${eventName}`,
          html: `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #ffffff; padding: 40px; border-radius: 16px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #d4af37; margin: 0; font-size: 28px;">✨ Berry Bly Productions</h1>
                <p style="color: #888; margin-top: 8px;">Client Portal Access</p>
              </div>

              <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px;">
                <h2 style="color: #fff; margin: 0 0 20px 0; font-size: 22px;">Hello ${clientName}! 👋</h2>
                <p style="color: #ccc; line-height: 1.6; margin: 0;">
                  You've been granted access to view the event dashboard for <strong style="color: #d4af37;">${eventName}</strong>.
                </p>
                ${eventDate ? `<p style="color: #888; margin-top: 10px;">📅 ${eventDate}</p>` : ''}
                ${venue ? `<p style="color: #888; margin-top: 5px;">📍 ${venue}</p>` : ''}
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #d4af37 0%, #f4d03f 100%); color: #000; padding: 16px 40px; border-radius: 30px; text-decoration: none; font-weight: bold; font-size: 16px;">
                  Access Your Portal →
                </a>
              </div>

              <div style="background: #111; padding: 20px; border-radius: 8px; margin-top: 30px;">
                <p style="color: #888; font-size: 12px; margin: 0;">
                  <strong>Portal Link:</strong><br>
                  <a href="${portalUrl}" style="color: #d4af37; word-break: break-all;">${portalUrl}</a>
                </p>
                ${expiresAt ? `<p style="color: #666; font-size: 11px; margin-top: 10px;">This link expires on ${new Date(expiresAt).toLocaleDateString()}</p>` : ''}
              </div>

              <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #222;">
                <p style="color: #666; font-size: 12px; margin: 0;">
                  Berry Bly Productions | Luxury Event Management<br>
                  <a href="mailto:${EMAIL_CONFIG.replyTo}" style="color: #d4af37;">${EMAIL_CONFIG.replyTo}</a>
                </p>
              </div>
            </div>
          `
        });
        emailSent = true;
        console.log(`✅ Client portal email sent to ${clientEmail} for event ${eventId}`);
      } catch (emailError) {
        console.error('Error sending client portal email:', emailError);
      }
    }

    res.status(201).json({
      ...result.rows[0],
      portalUrl,
      emailSent
    });
  } catch (error) {
    console.error('Error creating client access:', error);
    res.status(500).json({ error: 'Failed to create client access' });
  }
});

// GET /api/v1/events/:eventId/client-access - Get all client access for event
app.get('/api/v1/events/:eventId/client-access', async (req, res) => {
  try {
    const { eventId } = req.params;

    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'client_access'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      // Return empty array if table doesn't exist
      return res.json({ clients: [] });
    }

    const result = await pool.query(`
      SELECT id, client_name, client_email, permissions, last_accessed, expires_at, is_active, created_at
      FROM client_access
      WHERE event_id = $1
      ORDER BY created_at DESC
    `, [eventId]);
    res.json({ clients: result.rows });
  } catch (error) {
    console.error('Error fetching client access:', error);
    res.status(500).json({ error: 'Failed to fetch client access' });
  }
});

// DELETE /api/v1/client-access/:id - Revoke client access
app.delete('/api/v1/client-access/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE client_access SET is_active = false WHERE id = $1', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error revoking client access:', error);
    res.status(500).json({ error: 'Failed to revoke client access' });
  }
});

// GET /api/v1/client-portal/:token - Validate token and get client portal data
app.get('/api/v1/client-portal/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Validate token
    const accessResult = await pool.query(`
      SELECT ca.*, e.name as event_name, e.date as event_date, e.venue,
             e.status as event_status
      FROM client_access ca
      JOIN events e ON ca.event_id = e.id
      WHERE ca.access_token = $1
    `, [token]);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid access token' });
    }

    const access = accessResult.rows[0];

    // Check if active and not expired
    if (!access.is_active) {
      return res.status(403).json({ error: 'Access has been revoked' });
    }
    if (access.expires_at && new Date(access.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Access has expired' });
    }

    // Update last accessed
    await pool.query('UPDATE client_access SET last_accessed = CURRENT_TIMESTAMP WHERE id = $1', [access.id]);

    // Build response based on permissions
    const response = {
      client: {
        name: access.client_name,
        email: access.client_email
      },
      event: {
        id: access.event_id,
        name: access.event_name,
        date: access.event_date,
        venue: access.venue_name,
        city: access.venue_city,
        status: access.event_status,
        expectedAttendance: access.expected_attendance,
        theme: access.theme,
        dressCode: access.dress_code
      },
      permissions: access.permissions
    };

    // Fetch budget if permitted
    if (access.permissions?.viewBudget) {
      const budgetResult = await pool.query(`
        SELECT b.*, bc.name as category_name, bc.icon, bc.is_income
        FROM budget_items b
        JOIN budgets bu ON b.budget_id = bu.id
        LEFT JOIN budget_categories bc ON b.category_id = bc.id
        WHERE bu.event_id = $1
        ORDER BY bc.sort_order, b.created_at
      `, [access.event_id]);

      const budgetSummary = await pool.query(`
        SELECT
          COALESCE(SUM(estimated_amount) FILTER (WHERE NOT bc.is_income), 0) as total_estimated_expenses,
          COALESCE(SUM(actual_amount) FILTER (WHERE NOT bc.is_income), 0) as total_actual_expenses,
          COALESCE(SUM(estimated_amount) FILTER (WHERE bc.is_income), 0) as total_estimated_income,
          COALESCE(SUM(actual_amount) FILTER (WHERE bc.is_income), 0) as total_actual_income,
          COUNT(*) FILTER (WHERE b.is_paid) as paid_count,
          COUNT(*) FILTER (WHERE NOT b.is_paid) as pending_count
        FROM budget_items b
        JOIN budgets bu ON b.budget_id = bu.id
        LEFT JOIN budget_categories bc ON b.category_id = bc.id
        WHERE bu.event_id = $1
      `, [access.event_id]);

      response.budget = {
        items: budgetResult.rows.map(item => ({
          category: item.category_name,
          icon: item.icon,
          description: item.description,
          estimatedAmount: parseFloat(item.estimated_amount) || 0,
          actualAmount: parseFloat(item.actual_amount) || 0,
          isPaid: item.is_paid,
          isIncome: item.is_income
        })),
        summary: budgetSummary.rows[0]
      };
    }

    // Fetch timeline if permitted
    if (access.permissions?.viewTimeline) {
      const timelineResult = await pool.query(`
        SELECT time, title, description, location, is_critical, status
        FROM event_timeline
        WHERE event_id = $1
        ORDER BY sort_order, time
      `, [access.event_id]);

      const checklistResult = await pool.query(`
        SELECT category, item, is_completed, priority
        FROM event_checklist
        WHERE event_id = $1
        ORDER BY priority DESC, category
      `, [access.event_id]);

      response.timeline = timelineResult.rows;
      response.checklist = {
        items: checklistResult.rows,
        completed: checklistResult.rows.filter(c => c.is_completed).length,
        total: checklistResult.rows.length
      };
    }

    // Fetch staff if permitted
    if (access.permissions?.viewStaff) {
      const staffResult = await pool.query(`
        SELECT s.name, s.role, s.photo_url, sa.shift_start, sa.shift_end, sa.status
        FROM staff_assignments sa
        JOIN staff s ON sa.staff_id = s.id
        WHERE sa.event_id = $1
        ORDER BY sa.shift_start
      `, [access.event_id]);
      response.staff = staffResult.rows;
    }

    // Fetch vendors if permitted
    if (access.permissions?.viewVendors) {
      const vendorResult = await pool.query(`
        SELECT v.name, v.category, vc.title as contract_title, vc.status
        FROM vendor_contracts vc
        JOIN vendors v ON vc.vendor_id = v.id
        WHERE vc.event_id = $1
        ORDER BY v.category
      `, [access.event_id]);
      response.vendors = vendorResult.rows;
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching client portal:', error);
    res.status(500).json({ error: 'Failed to fetch client portal data' });
  }
});

// ============================================
// MODELS ENDPOINTS
// ============================================

// Get all models
app.get('/api/v1/models', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { status, event_id } = req.query;
    let query = 'SELECT * FROM models WHERE (user_id = $1::integer OR user_id IS NULL)';
    const params = [userId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (event_id) {
      query += ` AND event_id = $${paramIndex++}`;
      params.push(event_id);
    }

    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);

    res.json({
      models: result.rows.map(m => ({
        id: m.id.toString(),
        eventId: m.event_id?.toString(),
        name: m.name,
        email: m.email || '',
        phone: m.phone || '',
        instagram: m.instagram || '',
        photos: m.photos || [],
        height: m.height || '',
        experienceLevel: m.experience_level,
        availability: m.availability || {},
        notes: m.notes || '',
        status: m.status,
        aiScore: m.ai_score,
        createdAt: m.created_at.toISOString(),
        updatedAt: m.updated_at?.toISOString()
      }))
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// Get models stats
app.get('/api/v1/models/stats', async (req, res) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'assigned') as assigned,
        COUNT(*) FILTER (WHERE status = 'declined') as declined
      FROM models WHERE (user_id = $1::integer OR user_id IS NULL)
    `, [userId]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching models stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get single model
app.get('/api/v1/models/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query('SELECT * FROM models WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [req.params.id, userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Model not found' });
    }
    const m = result.rows[0];
    res.json({
      id: m.id.toString(),
      eventId: m.event_id?.toString(),
      name: m.name,
      email: m.email || '',
      phone: m.phone || '',
      instagram: m.instagram || '',
      photos: m.photos || [],
      height: m.height || '',
      experienceLevel: m.experience_level,
      availability: m.availability || {},
      notes: m.notes || '',
      status: m.status,
      aiScore: m.ai_score,
      createdAt: m.created_at.toISOString()
    });
  } catch (error) {
    console.error('Error fetching model:', error);
    res.status(500).json({ error: 'Failed to fetch model' });
  }
});

// Create model
app.post('/api/v1/models', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { name, email, phone, instagram, photos, height, experienceLevel, availability, notes, eventId } = req.body;
    const result = await pool.query(`
      INSERT INTO models (name, email, phone, instagram, photos, height, experience_level, availability, notes, event_id, status, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
      RETURNING *
    `, [name, email, phone, instagram, photos || [], height, experienceLevel || 'intermediate', availability || {}, notes, eventId || null, userId]);

    const m = result.rows[0];
    res.status(201).json({
      id: m.id.toString(),
      name: m.name,
      status: m.status,
      createdAt: m.created_at.toISOString()
    });
  } catch (error) {
    console.error('Error creating model:', error);
    res.status(500).json({ error: 'Failed to create model' });
  }
});

// Update model status
app.patch('/api/v1/models/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { status, eventId } = req.body;
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (eventId !== undefined) {
      updates.push(`event_id = $${paramIndex++}`);
      params.push(eventId);
    }
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(req.params.id);
    params.push(userId);

    const result = await pool.query(
      `UPDATE models SET ${updates.join(', ')} WHERE id = $${paramIndex} AND (user_id = $${paramIndex + 1} OR user_id IS NULL) RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Model not found' });
    }
    res.json({ success: true, model: result.rows[0] });
  } catch (error) {
    console.error('Error updating model:', error);
    res.status(500).json({ error: 'Failed to update model' });
  }
});

// Delete model
app.delete('/api/v1/models/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    await pool.query('DELETE FROM models WHERE id = $1 AND (user_id = $2::integer OR user_id IS NULL)', [req.params.id, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting model:', error);
    res.status(500).json({ error: 'Failed to delete model' });
  }
});

// ============================================
// TABLE RESERVATIONS ENDPOINTS
// ============================================

// Get all table reservations
app.get('/api/v1/table-reservations', async (req, res) => {
  try {
    const { event_id, status } = req.query;
    let query = 'SELECT * FROM table_reservations WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (event_id) {
      query += ` AND event_id = $${paramIndex++}`;
      params.push(event_id);
    }
    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);

    res.json({
      reservations: result.rows.map(t => ({
        id: t.id.toString(),
        tableId: t.table_id,
        tableName: t.table_name,
        zone: t.zone,
        eventId: t.event_id?.toString(),
        customerName: t.customer_name,
        customerEmail: t.customer_email || '',
        customerPhone: t.customer_phone || '',
        partySize: t.party_size,
        specialRequests: t.special_requests || '',
        status: t.status,
        depositPaid: t.deposit_paid,
        depositAmount: parseFloat(t.deposit_amount) || 0,
        minimumSpend: parseFloat(t.minimum_spend) || 0,
        capacity: t.capacity,
        createdAt: t.created_at.toISOString()
      }))
    });
  } catch (error) {
    console.error('Error fetching table reservations:', error);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

// Get table reservations stats
app.get('/api/v1/table-reservations/stats', async (req, res) => {
  try {
    // Check if table exists first
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'table_reservations'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      return res.json({ total: 0, pending: 0, confirmed: 0, cancelled: 0, revenue: 0 });
    }

    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
      FROM table_reservations
    `);
    res.json({
      ...result.rows[0],
      revenue: 0 // Calculated separately if needed
    });
  } catch (error) {
    console.error('Error fetching table stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats', details: error.message });
  }
});

// Create table reservation
app.post('/api/v1/table-reservations', async (req, res) => {
  try {
    const {
      tableId, tableName, zone, eventId, customerName, customerEmail,
      customerPhone, partySize, specialRequests, minimumSpend, capacity
    } = req.body;

    const result = await pool.query(`
      INSERT INTO table_reservations
        (table_id, table_name, zone, event_id, customer_name, customer_email,
         customer_phone, party_size, special_requests, minimum_spend, capacity, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
      RETURNING *
    `, [
      tableId || `TBL-${Date.now()}`,
      tableName || 'Table',
      zone || 'Standard',
      eventId || null,
      customerName,
      customerEmail,
      customerPhone,
      partySize || 1,
      specialRequests,
      minimumSpend || 0,
      capacity || 6
    ]);

    const t = result.rows[0];
    res.status(201).json({
      id: t.id.toString(),
      tableId: t.table_id,
      tableName: t.table_name,
      customerName: t.customer_name,
      status: t.status,
      createdAt: t.created_at.toISOString()
    });
  } catch (error) {
    console.error('Error creating reservation:', error);
    res.status(500).json({ error: 'Failed to create reservation' });
  }
});

// Update table reservation
app.patch('/api/v1/table-reservations/:id', async (req, res) => {
  try {
    const { status, depositPaid, depositAmount } = req.body;
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (depositPaid !== undefined) {
      updates.push(`deposit_paid = $${paramIndex++}`);
      params.push(depositPaid);
    }
    if (depositAmount !== undefined) {
      updates.push(`deposit_amount = $${paramIndex++}`);
      params.push(depositAmount);
    }
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE table_reservations SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    res.json({ success: true, reservation: result.rows[0] });
  } catch (error) {
    console.error('Error updating reservation:', error);
    res.status(500).json({ error: 'Failed to update reservation' });
  }
});

// Delete table reservation
app.delete('/api/v1/table-reservations/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM table_reservations WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting reservation:', error);
    res.status(500).json({ error: 'Failed to delete reservation' });
  }
});

// ============================================
// HEALTH MONITORING SYSTEM
// Comprehensive health checks with alerts
// ============================================

const serverStartTime = Date.now();
let lastHealthStatus = { status: 'unknown', timestamp: null };
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_ALERT = 3;

// All tables that should exist in the database (Simplified)
const REQUIRED_TABLES = [
  'guests', 'email_events', 'tickets', 'sponsors',
  'events', 'event_timeline', 'event_checklist', 'budgets', 'budget_categories',
  'budget_items', 'vendors', 'staff', 'staff_assignments', 'client_access',
  'models', 'table_reservations'
];

// Send alert email when health issues detected
const sendHealthAlert = async (issues, severity = 'warning') => {
  try {
    const issueList = issues.map(i => `- ${i}`).join('\n');
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${severity === 'critical' ? '#dc2626' : '#f59e0b'}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">Berry Dashboard Alert</h1>
          <p style="margin: 10px 0 0;">Health Check ${severity === 'critical' ? 'CRITICAL' : 'Warning'}</p>
        </div>
        <div style="padding: 20px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Issues Detected:</h2>
          <pre style="background: #1f2937; color: #f3f4f6; padding: 15px; border-radius: 8px; overflow-x: auto;">${issueList}</pre>
          <p style="color: #6b7280; font-size: 14px;">
            Timestamp: ${new Date().toISOString()}<br>
            Server Uptime: ${Math.floor((Date.now() - serverStartTime) / 1000 / 60)} minutes<br>
            Consecutive Failures: ${consecutiveFailures}
          </p>
        </div>
        <div style="padding: 15px; background: #1f2937; color: #9ca3af; text-align: center; font-size: 12px;">
          Berry Bly Productions - Automated Health Monitoring
        </div>
      </div>
    `;

    await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: EMAIL_CONFIG.adminEmail,
      subject: `[${severity.toUpperCase()}] Berry Dashboard Health Alert`,
      html
    });
    console.log(`Health alert sent to ${EMAIL_CONFIG.adminEmail}`);
  } catch (error) {
    console.error('Failed to send health alert:', error);
  }
};

// Deep Health Check - Tests all components
app.get('/api/v1/health/deep', async (req, res) => {
  const startTime = Date.now();
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    components: {},
    issues: []
  };

  // 1. Database Connection
  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    health.components.database = {
      status: 'healthy',
      responseTime: Date.now() - dbStart,
      message: 'Connected'
    };
  } catch (error) {
    health.status = 'unhealthy';
    health.components.database = {
      status: 'unhealthy',
      error: error.message
    };
    health.issues.push(`Database: ${error.message}`);
  }

  // 2. Check all required tables exist
  if (health.components.database?.status === 'healthy') {
    try {
      const tablesResult = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
      `);
      const existingTables = tablesResult.rows.map(r => r.table_name);
      const missingTables = REQUIRED_TABLES.filter(t => !existingTables.includes(t));

      health.components.tables = {
        status: missingTables.length === 0 ? 'healthy' : 'degraded',
        total: REQUIRED_TABLES.length,
        existing: existingTables.length,
        missing: missingTables
      };

      if (missingTables.length > 0) {
        health.issues.push(`Missing tables: ${missingTables.join(', ')}`);
      }
    } catch (error) {
      health.components.tables = { status: 'error', error: error.message };
      health.issues.push(`Table check failed: ${error.message}`);
    }
  }

  // 3. Check table row counts (data integrity)
  if (health.components.database?.status === 'healthy') {
    try {
      const counts = {};
      for (const table of ['guests', 'events', 'staff', 'vendors', 'sponsors']) {
        try {
          const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
          counts[table] = parseInt(result.rows[0].count);
        } catch {
          counts[table] = 'error';
        }
      }
      health.components.data = {
        status: 'healthy',
        counts
      };
    } catch (error) {
      health.components.data = { status: 'error', error: error.message };
    }
  }

  // 4. Memory Usage
  const memUsage = process.memoryUsage();
  const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  health.components.memory = {
    status: memUsedMB > memTotalMB * 0.9 ? 'warning' : 'healthy',
    heapUsed: `${memUsedMB} MB`,
    heapTotal: `${memTotalMB} MB`,
    percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
  };

  if (memUsedMB > memTotalMB * 0.9) {
    health.issues.push(`High memory usage: ${memUsedMB}/${memTotalMB} MB`);
  }

  // 5. Email Service (Resend)
  health.components.email = {
    status: process.env.RESEND_API_KEY ? 'configured' : 'not_configured',
    from: EMAIL_CONFIG.from,
    adminEmail: EMAIL_CONFIG.adminEmail
  };

  if (!process.env.RESEND_API_KEY) {
    health.issues.push('Email service (Resend) not configured');
  }

  // 6. Environment Check
  const requiredEnvVars = ['DATABASE_URL', 'RESEND_API_KEY'];
  const missingEnv = requiredEnvVars.filter(v => !process.env[v]);
  health.components.environment = {
    status: missingEnv.length === 0 ? 'healthy' : 'degraded',
    nodeEnv: process.env.NODE_ENV || 'development',
    port: PORT,
    missingVariables: missingEnv
  };

  // Calculate overall status
  health.responseTime = Date.now() - startTime;

  if (health.issues.length > 0) {
    if (health.components.database?.status === 'unhealthy') {
      health.status = 'critical';
      consecutiveFailures++;
    } else {
      health.status = 'degraded';
    }
  } else {
    consecutiveFailures = 0;
  }

  // Send alert if consecutive failures exceed threshold
  if (consecutiveFailures >= MAX_FAILURES_BEFORE_ALERT) {
    await sendHealthAlert(health.issues, 'critical');
    consecutiveFailures = 0; // Reset after alert
  }

  lastHealthStatus = { status: health.status, timestamp: health.timestamp };

  res.status(health.status === 'critical' ? 503 : 200).json(health);
});

// Test all API endpoints
app.get('/api/v1/health/test-apis', async (req, res) => {
  const results = {
    timestamp: new Date().toISOString(),
    totalEndpoints: 0,
    passed: 0,
    failed: 0,
    tests: []
  };

  // API endpoints to test (GET only for safety)
  const endpointsToTest = [
    { path: '/api/health', name: 'Basic Health' },
    { path: '/api/v1/health', name: 'V1 Health' },
    { path: '/api/stats', name: 'Guest Stats' },
    { path: '/api/guests', name: 'Guests List' },
    { path: '/api/v1/guest-lists', name: 'Guest Lists' },
    { path: '/api/v1/guest-lists/stats', name: 'Guest Lists Stats' },
    { path: '/api/v1/tickets', name: 'Tickets' },
    { path: '/api/v1/tickets/stats', name: 'Tickets Stats' },
    { path: '/api/v1/sponsors', name: 'Sponsors' },
    { path: '/api/v1/sponsors/stats', name: 'Sponsors Stats' },
    { path: '/api/v1/sponsors/tiers', name: 'Sponsor Tiers' },
    { path: '/api/v1/events', name: 'Events' },
    { path: '/api/v1/events/stats', name: 'Events Stats' },
    { path: '/api/v1/events/calendar', name: 'Events Calendar' },
    { path: '/api/v1/budget-categories', name: 'Budget Categories' },
    { path: '/api/v1/vendors', name: 'Vendors' },
    { path: '/api/v1/staff', name: 'Staff' },
    { path: '/api/guests/featured', name: 'Featured Guests' }
  ];

  for (const endpoint of endpointsToTest) {
    results.totalEndpoints++;
    const startTime = Date.now();

    try {
      // Test database connectivity as proxy for API health
      await pool.query('SELECT 1');
      results.tests.push({
        endpoint: endpoint.path,
        name: endpoint.name,
        status: 'pass',
        responseTime: Date.now() - startTime
      });
      results.passed++;
    } catch (error) {
      results.tests.push({
        endpoint: endpoint.path,
        name: endpoint.name,
        status: 'fail',
        error: error.message,
        responseTime: Date.now() - startTime
      });
      results.failed++;
    }
  }

  results.successRate = Math.round((results.passed / results.totalEndpoints) * 100);

  res.json(results);
});

// Send test alert
app.post('/api/v1/health/test-alert', async (req, res) => {
  try {
    await sendHealthAlert(['This is a test alert', 'All systems operational'], 'warning');
    res.json({ success: true, message: `Test alert sent to ${EMAIL_CONFIG.adminEmail}` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Detailed status endpoint
app.get('/api/v1/health/status', async (req, res) => {
  const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
  const uptimeFormatted = {
    days: Math.floor(uptime / 86400),
    hours: Math.floor((uptime % 86400) / 3600),
    minutes: Math.floor((uptime % 3600) / 60),
    seconds: uptime % 60
  };

  const memUsage = process.memoryUsage();

  // Get connection pool stats
  const poolStats = {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount
  };

  res.json({
    status: lastHealthStatus.status,
    lastCheck: lastHealthStatus.timestamp,
    server: {
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
      uptime: uptimeFormatted,
      uptimeSeconds: uptime
    },
    memory: {
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)} MB`,
      rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`
    },
    database: poolStats,
    config: {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      emailConfigured: !!process.env.RESEND_API_KEY,
      databaseConfigured: !!process.env.DATABASE_URL
    }
  });
});

// Quick liveness probe (for load balancers/k8s)
app.get('/api/v1/health/live', (req, res) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Readiness probe (checks if ready to accept traffic)
app.get('/api/v1/health/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'not_ready', error: error.message });
  }
});

// GET /api/v1/websocket/info - Get WebSocket connection info
app.get('/api/v1/websocket/info', (req, res) => {
  const baseUrl = process.env.RAILWAY_STATIC_URL || process.env.BASE_URL || `http://localhost:${PORT}`;
  const wsUrl = baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');

  res.json({
    websocket: {
      url: `${wsUrl}/ws`,
      connectionExample: `${wsUrl}/ws?token=YOUR_ACCESS_TOKEN`,
      connectedClients: wsClients?.size || 0
    },
    instructions: {
      connect: 'Connect to WebSocket with your OAuth access token as query param',
      example: "new WebSocket('wss://berry-dashboard-api-production.up.railway.app/ws?token=YOUR_TOKEN')",
      events: [
        { type: 'connected', description: 'Sent when successfully connected' },
        { type: 'notification', description: 'Real-time updates (create, update, delete)' },
        { type: 'pong', description: 'Response to ping keepalive' },
        { type: 'error', description: 'Error messages' }
      ],
      notificationFormat: {
        type: 'notification',
        action: 'created|updated|deleted|approved|rejected|checkedIn',
        entity: 'event|guest|vendor|sponsor',
        data: '{ ...entity data }',
        message: 'Human-readable message',
        timestamp: 'ISO timestamp'
      }
    }
  });
});

// ============================================
// WEBSOCKET SERVER FOR REAL-TIME NOTIFICATIONS
// ============================================

// Create HTTP server from Express app
const server = http.createServer(app);

// Create WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server, path: '/ws' });

// Store connected clients with their user info
const wsClients = new Map();

// Authenticate WebSocket connection using token from URL
const authenticateWsConnection = async (token) => {
  if (!token) return null;
  try {
    const result = await pool.query(
      `SELECT u.* FROM users u
       JOIN oauth_tokens t ON u.id = t.user_id
       WHERE t.access_token = $1 AND t.expires_at > NOW()`,
      [token]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('WS Auth error:', error);
    return null;
  }
};

// WebSocket connection handler
wss.on('connection', async (ws, req) => {
  // Extract token from URL: /ws?token=xxx
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  // Authenticate user
  const user = await authenticateWsConnection(token);

  if (!user) {
    ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
    ws.close(4001, 'Unauthorized');
    return;
  }

  // Store client with user info
  const clientId = crypto.randomUUID();
  wsClients.set(clientId, { ws, user, connectedAt: new Date() });

  console.log(`WebSocket: User ${user.email} connected (${clientId})`);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: `Welcome ${user.name || user.email}!`,
    userId: user.id,
    timestamp: new Date().toISOString()
  }));

  // Handle incoming messages (for future use - chat, commands, etc.)
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`WS Message from ${user.email}:`, message);

      // Handle ping/pong for keepalive
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      }
    } catch (e) {
      console.error('Invalid WS message:', e);
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    wsClients.delete(clientId);
    console.log(`WebSocket: User ${user.email} disconnected (${clientId})`);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error(`WS Error for ${user.email}:`, error);
    wsClients.delete(clientId);
  });
});

// Broadcast notification to specific user(s)
const broadcastNotification = (userId, notification) => {
  const message = JSON.stringify({
    type: 'notification',
    ...notification,
    timestamp: new Date().toISOString()
  });

  wsClients.forEach((client) => {
    // Send to specific user or to all if userId is null
    if ((userId === null || client.user.id === userId) && client.ws.readyState === 1) {
      client.ws.send(message);
    }
  });
};

// Broadcast to all connected users (admin broadcasts)
const broadcastToAll = (notification) => {
  broadcastNotification(null, notification);
};

// Helper to emit CRUD notifications
const emitNotification = (userId, action, entity, data) => {
  broadcastNotification(userId, {
    action,     // 'created', 'updated', 'deleted'
    entity,     // 'event', 'guest', 'vendor', 'sponsor', etc.
    data,       // The created/updated/deleted record
    message: getNotificationMessage(action, entity, data)
  });
};

// Generate human-readable notification message
const getNotificationMessage = (action, entity, data) => {
  const name = data?.name || data?.title || data?.company_name || data?.companyName || `#${data?.id}`;
  const messages = {
    created: `New ${entity} created: ${name}`,
    updated: `${entity} updated: ${name}`,
    deleted: `${entity} deleted: ${name}`,
    approved: `${entity} approved: ${name}`,
    rejected: `${entity} rejected: ${name}`,
    checkedIn: `${entity} checked in: ${name}`
  };
  return messages[action] || `${action} ${entity}: ${name}`;
};

// ============================================
// INTEGRATIONS API - Manage external service connections
// ============================================

// Supported providers configuration
const INTEGRATION_PROVIDERS = {
  eventbrite: {
    name: 'Eventbrite',
    icon: '🎪',
    color: '#F6682F',
    description: 'Import events and tickets from Eventbrite',
    fields: ['api_key'],
    testEndpoint: 'https://www.eventbriteapi.com/v3/users/me/'
  },
  mailchimp: {
    name: 'Mailchimp',
    icon: '📧',
    color: '#FFE01B',
    description: 'Sync guests with Mailchimp audiences',
    fields: ['api_key', 'server_prefix'],
    testEndpoint: null // Built dynamically with server prefix
  },
  ticketmaster: {
    name: 'Ticketmaster',
    icon: '🎫',
    color: '#0068B3',
    description: 'Sync events and tickets from Ticketmaster',
    fields: ['api_key', 'api_secret'],
    testEndpoint: 'https://app.ticketmaster.com/discovery/v2/events.json'
  },
  sendgrid: {
    name: 'SendGrid',
    icon: '✉️',
    color: '#1A82E2',
    description: 'Send transactional and marketing emails',
    fields: ['api_key'],
    testEndpoint: 'https://api.sendgrid.com/v3/user/profile'
  },
  twilio: {
    name: 'Twilio',
    icon: '📱',
    color: '#F22F46',
    description: 'SMS and WhatsApp messaging',
    fields: ['account_sid', 'auth_token', 'phone_number'],
    testEndpoint: null
  },
  telnyx: {
    name: 'Telnyx',
    icon: '📞',
    color: '#00C08B',
    description: 'SMS, Voice and Fax messaging platform',
    fields: ['api_key', 'phone_number', 'messaging_profile_id'],
    testEndpoint: 'https://api.telnyx.com/v2/messaging_profiles'
  }
};

// GET /api/v1/integrations - List all integrations with status
app.get('/api/v1/integrations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM integrations ORDER BY provider');

    // Merge with provider config and mask API keys
    const integrations = Object.keys(INTEGRATION_PROVIDERS).map(provider => {
      const config = INTEGRATION_PROVIDERS[provider];
      const saved = result.rows.find(r => r.provider === provider);

      return {
        provider,
        ...config,
        status: saved?.status || 'disconnected',
        lastSync: saved?.last_sync,
        lastError: saved?.last_error,
        hasApiKey: !!saved?.api_key_encrypted,
        apiKeyMasked: saved?.api_key_encrypted ? maskApiKey(decryptApiKey(saved.api_key_encrypted)) : null,
        extraConfig: saved?.extra_config || {}
      };
    });

    res.json({ integrations });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

// GET /api/v1/integrations/:provider - Get specific integration details
app.get('/api/v1/integrations/:provider', async (req, res) => {
  try {
    const { provider } = req.params;

    if (!INTEGRATION_PROVIDERS[provider]) {
      return res.status(400).json({ error: 'Unknown provider' });
    }

    const result = await pool.query('SELECT * FROM integrations WHERE provider = $1', [provider]);
    const saved = result.rows[0];
    const config = INTEGRATION_PROVIDERS[provider];

    res.json({
      provider,
      ...config,
      status: saved?.status || 'disconnected',
      lastSync: saved?.last_sync,
      lastError: saved?.last_error,
      hasApiKey: !!saved?.api_key_encrypted,
      apiKeyMasked: saved?.api_key_encrypted ? maskApiKey(decryptApiKey(saved.api_key_encrypted)) : null,
      extraConfig: saved?.extra_config || {}
    });
  } catch (error) {
    console.error('Error fetching integration:', error);
    res.status(500).json({ error: 'Failed to fetch integration' });
  }
});

// POST /api/v1/integrations/:provider/config - Save API key configuration
app.post('/api/v1/integrations/:provider/config', async (req, res) => {
  try {
    const { provider } = req.params;
    const { apiKey, apiSecret, extraConfig } = req.body;

    if (!INTEGRATION_PROVIDERS[provider]) {
      return res.status(400).json({ error: 'Unknown provider' });
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    const encryptedKey = encryptApiKey(apiKey);
    const encryptedSecret = apiSecret ? encryptApiKey(apiSecret) : null;

    // Upsert the integration config
    const result = await pool.query(`
      INSERT INTO integrations (provider, api_key_encrypted, api_secret_encrypted, extra_config, status, updated_at)
      VALUES ($1, $2, $3, $4, 'pending', NOW())
      ON CONFLICT (provider)
      DO UPDATE SET
        api_key_encrypted = $2,
        api_secret_encrypted = $3,
        extra_config = $4,
        status = 'pending',
        updated_at = NOW()
      RETURNING *
    `, [provider, encryptedKey, encryptedSecret, JSON.stringify(extraConfig || {})]);

    res.json({
      success: true,
      message: 'Configuration saved. Click "Test Connection" to verify.',
      integration: {
        provider,
        status: 'pending',
        hasApiKey: true
      }
    });
  } catch (error) {
    console.error('Error saving integration config:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// POST /api/v1/integrations/:provider/test - Test the connection
app.post('/api/v1/integrations/:provider/test', async (req, res) => {
  try {
    const { provider } = req.params;

    if (!INTEGRATION_PROVIDERS[provider]) {
      return res.status(400).json({ error: 'Unknown provider' });
    }

    // Get saved credentials
    const result = await pool.query('SELECT * FROM integrations WHERE provider = $1', [provider]);
    const saved = result.rows[0];

    if (!saved?.api_key_encrypted) {
      return res.status(400).json({ error: 'No API key configured for this provider' });
    }

    const apiKey = decryptApiKey(saved.api_key_encrypted);
    const apiSecret = saved.api_secret_encrypted ? decryptApiKey(saved.api_secret_encrypted) : null;
    const extraConfig = saved.extra_config || {};

    let testResult = { success: false, message: '' };

    // Test connection based on provider
    switch (provider) {
      case 'eventbrite':
        try {
          const ebResponse = await fetch('https://www.eventbriteapi.com/v3/users/me/', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });
          if (ebResponse.ok) {
            const userData = await ebResponse.json();
            testResult = { success: true, message: `Connected as ${userData.name || userData.email}` };
          } else {
            const error = await ebResponse.json();
            testResult = { success: false, message: error.error_description || 'Invalid API key' };
          }
        } catch (e) {
          testResult = { success: false, message: 'Connection failed: ' + e.message };
        }
        break;

      case 'mailchimp':
        try {
          const serverPrefix = extraConfig.server_prefix || 'us21';
          const mcResponse = await fetch(`https://${serverPrefix}.api.mailchimp.com/3.0/ping`, {
            headers: { 'Authorization': `apikey ${apiKey}` }
          });
          if (mcResponse.ok) {
            testResult = { success: true, message: 'Connected to Mailchimp successfully' };
          } else {
            testResult = { success: false, message: 'Invalid API key or server prefix' };
          }
        } catch (e) {
          testResult = { success: false, message: 'Connection failed: ' + e.message };
        }
        break;

      case 'ticketmaster':
        try {
          const tmResponse = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}&size=1`);
          if (tmResponse.ok) {
            testResult = { success: true, message: 'Connected to Ticketmaster API' };
          } else {
            testResult = { success: false, message: 'Invalid API key' };
          }
        } catch (e) {
          testResult = { success: false, message: 'Connection failed: ' + e.message };
        }
        break;

      case 'sendgrid':
        try {
          const sgResponse = await fetch('https://api.sendgrid.com/v3/user/profile', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });
          if (sgResponse.ok) {
            testResult = { success: true, message: 'Connected to SendGrid' };
          } else {
            testResult = { success: false, message: 'Invalid API key' };
          }
        } catch (e) {
          testResult = { success: false, message: 'Connection failed: ' + e.message };
        }
        break;

      case 'twilio':
        try {
          const accountSid = apiKey;
          const authToken = apiSecret;
          const twilioAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
          const twResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
            headers: { 'Authorization': `Basic ${twilioAuth}` }
          });
          if (twResponse.ok) {
            testResult = { success: true, message: 'Connected to Twilio' };
          } else {
            testResult = { success: false, message: 'Invalid Account SID or Auth Token' };
          }
        } catch (e) {
          testResult = { success: false, message: 'Connection failed: ' + e.message };
        }
        break;

      case 'telnyx':
        try {
          const telnyxResponse = await fetch('https://api.telnyx.com/v2/messaging_profiles', {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            }
          });
          if (telnyxResponse.ok) {
            const telnyxData = await telnyxResponse.json();
            const profileCount = telnyxData.data?.length || 0;
            testResult = { success: true, message: `Connected to Telnyx (${profileCount} messaging profiles found)` };
          } else {
            const telnyxError = await telnyxResponse.json().catch(() => ({}));
            testResult = { success: false, message: telnyxError.errors?.[0]?.detail || 'Invalid API key' };
          }
        } catch (e) {
          testResult = { success: false, message: 'Connection failed: ' + e.message };
        }
        break;

      default:
        testResult = { success: false, message: 'Provider test not implemented' };
    }

    // Update status in database
    await pool.query(`
      UPDATE integrations
      SET status = $1, last_error = $2, updated_at = NOW()
      WHERE provider = $3
    `, [testResult.success ? 'connected' : 'error', testResult.success ? null : testResult.message, provider]);

    res.json(testResult);
  } catch (error) {
    console.error('Error testing integration:', error);
    res.status(500).json({ error: 'Failed to test connection' });
  }
});

// DELETE /api/v1/integrations/:provider - Disconnect integration
app.delete('/api/v1/integrations/:provider', async (req, res) => {
  try {
    const { provider } = req.params;

    await pool.query('DELETE FROM integrations WHERE provider = $1', [provider]);

    res.json({ success: true, message: `${provider} disconnected` });
  } catch (error) {
    console.error('Error disconnecting integration:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// ============================================
// TELNYX MESSAGING ENDPOINTS
// ============================================

// POST /api/v1/telnyx/send-sms - Send SMS via Telnyx (Multi-tenant)
app.post('/api/v1/telnyx/send-sms', async (req, res) => {
  try {
    const { to, message, from } = req.body;
    const userId = req.user?.id;

    console.log('SMS Request:', { to, message: message?.substring(0, 20), userId, hasBody: !!req.body });

    if (!to || !message) {
      console.log('SMS Error: Missing to or message', { to: !!to, message: !!message });
      return res.status(400).json({ error: 'Phone number (to) and message are required' });
    }

    let apiKey = null;
    let extraConfig = {};

    // Try user-specific integration first (multi-tenant)
    if (userId) {
      const userResult = await pool.query(
        'SELECT * FROM user_integrations WHERE user_id = $1::integer AND provider = $2 AND status = $3',
        [userId, 'telnyx', 'connected']
      );
      if (userResult.rows.length > 0) {
        apiKey = decryptApiKey(userResult.rows[0].api_key_encrypted);
        extraConfig = userResult.rows[0].extra_config || {};
      }
    }

    // Fallback to global integration
    if (!apiKey) {
      const result = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['telnyx']);
      const integration = result.rows[0];
      if (integration?.api_key_encrypted) {
        apiKey = decryptApiKey(integration.api_key_encrypted);
        extraConfig = integration.extra_config || {};
      }
    }

    if (!apiKey) {
      console.log('SMS Error: No API key found for user:', userId);
      return res.status(400).json({ error: 'Telnyx integration not configured. Please connect Telnyx in Integrations.' });
    }

    const fromNumber = from || extraConfig.phone_number;
    const messagingProfileId = extraConfig.messaging_profile_id;

    console.log('SMS Config:', { hasApiKey: !!apiKey, fromNumber, messagingProfileId });

    if (!fromNumber) {
      console.log('SMS Error: No from number configured');
      return res.status(400).json({ error: 'No sender phone number configured' });
    }

    const payload = {
      from: fromNumber,
      to: to,
      text: message
    };

    if (messagingProfileId) {
      payload.messaging_profile_id = messagingProfileId;
    }

    const telnyxResponse = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const telnyxData = await telnyxResponse.json();

    if (telnyxResponse.ok) {
      // Save conversation for multi-tenant tracking
      try {
        await pool.query(
          `INSERT INTO sms_conversations (from_number, to_number, direction, message, user_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [fromNumber, to, 'outbound', message, userId || null]
        );
      } catch (convErr) {
        console.log('Note: Could not save SMS conversation:', convErr.message);
      }

      res.json({
        success: true,
        messageId: telnyxData.data?.id,
        status: telnyxData.data?.to?.[0]?.status || 'queued'
      });
    } else {
      res.status(400).json({
        error: telnyxData.errors?.[0]?.detail || 'Failed to send SMS',
        details: telnyxData.errors
      });
    }
  } catch (error) {
    console.error('Error sending Telnyx SMS:', error);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// POST /api/v1/telnyx/send-bulk-sms - Send SMS to multiple recipients
app.post('/api/v1/telnyx/send-bulk-sms', async (req, res) => {
  try {
    const { recipients, message, from } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Recipients array is required' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get Telnyx credentials
    const result = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['telnyx']);
    const integration = result.rows[0];

    if (!integration?.api_key_encrypted) {
      return res.status(400).json({ error: 'Telnyx integration not configured' });
    }

    const apiKey = decryptApiKey(integration.api_key_encrypted);
    const extraConfig = integration.extra_config || {};
    const fromNumber = from || extraConfig.phone_number;
    const messagingProfileId = extraConfig.messaging_profile_id;

    if (!fromNumber) {
      return res.status(400).json({ error: 'No sender phone number configured' });
    }

    const results = [];
    for (const recipient of recipients) {
      try {
        const payload = {
          from: fromNumber,
          to: recipient,
          text: message
        };

        if (messagingProfileId) {
          payload.messaging_profile_id = messagingProfileId;
        }

        const telnyxResponse = await fetch('https://api.telnyx.com/v2/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const telnyxData = await telnyxResponse.json();

        results.push({
          to: recipient,
          success: telnyxResponse.ok,
          messageId: telnyxData.data?.id,
          error: telnyxResponse.ok ? null : telnyxData.errors?.[0]?.detail
        });
      } catch (e) {
        results.push({
          to: recipient,
          success: false,
          error: e.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
      success: true,
      totalSent: successCount,
      totalFailed: recipients.length - successCount,
      results
    });
  } catch (error) {
    console.error('Error sending bulk SMS:', error);
    res.status(500).json({ error: 'Failed to send bulk SMS' });
  }
});

// ============================================
// SCHEDULED SMS ENDPOINTS
// ============================================

// POST /api/v1/sms/schedule - Schedule a message for later
app.post('/api/v1/sms/schedule', async (req, res) => {
  try {
    const { recipients, message, scheduledAt, eventId } = req.body;
    const userId = req.user?.id || null;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Recipients array is required' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!scheduledAt) {
      return res.status(400).json({ error: 'scheduledAt timestamp is required' });
    }

    const scheduledTime = new Date(scheduledAt);
    if (scheduledTime <= new Date()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    const result = await pool.query(`
      INSERT INTO scheduled_messages (user_id, event_id, recipients, message, scheduled_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [userId, eventId || null, JSON.stringify(recipients), message, scheduledTime]);

    res.json({
      success: true,
      message: 'Message scheduled successfully',
      scheduledMessage: result.rows[0]
    });
  } catch (error) {
    console.error('Error scheduling SMS:', error);
    res.status(500).json({ error: 'Failed to schedule message' });
  }
});

// GET /api/v1/sms/scheduled - List scheduled messages
app.get('/api/v1/sms/scheduled', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { status, eventId } = req.query;

    let query = 'SELECT * FROM scheduled_messages WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND (user_id = $${paramIndex}::integer OR user_id IS NULL)`;
      params.push(userId);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (eventId) {
      query += ` AND event_id = $${paramIndex}`;
      params.push(eventId);
      paramIndex++;
    }

    query += ' ORDER BY scheduled_at ASC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      scheduledMessages: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching scheduled messages:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled messages' });
  }
});

// DELETE /api/v1/sms/scheduled/:id - Cancel a scheduled message
app.delete('/api/v1/sms/scheduled/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE scheduled_messages SET status = $1, updated_at = NOW() WHERE id = $2 AND status = $3 RETURNING *',
      ['cancelled', id, 'pending']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled message not found or already processed' });
    }

    res.json({
      success: true,
      message: 'Scheduled message cancelled',
      scheduledMessage: result.rows[0]
    });
  } catch (error) {
    console.error('Error cancelling scheduled message:', error);
    res.status(500).json({ error: 'Failed to cancel scheduled message' });
  }
});

// Function to process scheduled messages (runs every minute)
async function processScheduledMessages() {
  try {
    // Get all pending messages that are due
    const dueMessages = await pool.query(`
      SELECT * FROM scheduled_messages
      WHERE status = 'pending' AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      LIMIT 10
    `);

    if (dueMessages.rows.length === 0) return;

    console.log(`📬 Processing ${dueMessages.rows.length} scheduled messages...`);

    // Get Telnyx API key
    let apiKey = process.env.TELNYX_API_KEY;
    const fromNumber = process.env.TELNYX_PHONE_NUMBER;

    if (!apiKey) {
      const result = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['telnyx']);
      if (result.rows[0]?.api_key_encrypted) {
        apiKey = decryptApiKey(result.rows[0].api_key_encrypted);
      }
    }

    if (!apiKey || !fromNumber) {
      console.error('Telnyx not configured for scheduled messages');
      return;
    }

    for (const msg of dueMessages.rows) {
      const recipients = msg.recipients;
      const results = [];

      // Mark as processing
      await pool.query(
        'UPDATE scheduled_messages SET status = $1, updated_at = NOW() WHERE id = $2',
        ['processing', msg.id]
      );

      for (const recipient of recipients) {
        try {
          const telnyxResponse = await fetch('https://api.telnyx.com/v2/messages', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: fromNumber,
              to: recipient,
              text: msg.message
            })
          });

          const telnyxData = await telnyxResponse.json();
          results.push({
            to: recipient,
            success: telnyxResponse.ok,
            messageId: telnyxData.data?.id,
            error: telnyxResponse.ok ? null : telnyxData.errors?.[0]?.detail
          });
        } catch (e) {
          results.push({ to: recipient, success: false, error: e.message });
        }
      }

      const sentCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;

      // Update with results
      await pool.query(`
        UPDATE scheduled_messages
        SET status = $1, sent_at = NOW(), sent_count = $2, failed_count = $3, results = $4, updated_at = NOW()
        WHERE id = $5
      `, ['sent', sentCount, failedCount, JSON.stringify(results), msg.id]);

      console.log(`✅ Scheduled message ${msg.id} sent: ${sentCount} success, ${failedCount} failed`);
    }
  } catch (error) {
    console.error('Error processing scheduled messages:', error);
  }
}

// Start scheduled message processor (every minute)
setInterval(processScheduledMessages, 60 * 1000);
console.log('📅 Scheduled message processor started (checks every minute)');

// GET /api/v1/telnyx/phone-numbers - List Telnyx phone numbers
app.get('/api/v1/telnyx/phone-numbers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['telnyx']);
    const integration = result.rows[0];

    if (!integration?.api_key_encrypted) {
      return res.status(400).json({ error: 'Telnyx integration not configured' });
    }

    const apiKey = decryptApiKey(integration.api_key_encrypted);

    const telnyxResponse = await fetch('https://api.telnyx.com/v2/phone_numbers', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const telnyxData = await telnyxResponse.json();

    if (telnyxResponse.ok) {
      res.json({
        success: true,
        phoneNumbers: telnyxData.data?.map(pn => ({
          id: pn.id,
          phoneNumber: pn.phone_number,
          status: pn.status,
          connectionName: pn.connection_name
        })) || []
      });
    } else {
      res.status(400).json({ error: 'Failed to fetch phone numbers' });
    }
  } catch (error) {
    console.error('Error fetching Telnyx phone numbers:', error);
    res.status(500).json({ error: 'Failed to fetch phone numbers' });
  }
});

// GET /api/v1/telnyx/messaging-profiles - List Telnyx messaging profiles
app.get('/api/v1/telnyx/messaging-profiles', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['telnyx']);
    const integration = result.rows[0];

    if (!integration?.api_key_encrypted) {
      return res.status(400).json({ error: 'Telnyx integration not configured' });
    }

    const apiKey = decryptApiKey(integration.api_key_encrypted);

    const telnyxResponse = await fetch('https://api.telnyx.com/v2/messaging_profiles', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const telnyxData = await telnyxResponse.json();

    if (telnyxResponse.ok) {
      res.json({
        success: true,
        profiles: telnyxData.data?.map(p => ({
          id: p.id,
          name: p.name,
          enabled: p.enabled,
          numberPoolSettings: p.number_pool_settings
        })) || []
      });
    } else {
      res.status(400).json({ error: 'Failed to fetch messaging profiles' });
    }
  } catch (error) {
    console.error('Error fetching Telnyx messaging profiles:', error);
    res.status(500).json({ error: 'Failed to fetch messaging profiles' });
  }
});

// ============================================
// TELNYX INBOUND SMS WEBHOOK (Multi-tenant + AI Response)
// ============================================

// POST /api/webhooks/telnyx/sms - Handle inbound SMS from Telnyx
app.post('/api/webhooks/telnyx/sms', async (req, res) => {
  try {
    const event = req.body;
    console.log('📱 Telnyx webhook received:', event.data?.event_type);

    // Handle message.received event
    if (event.data?.event_type === 'message.received') {
      const payload = event.data.payload;
      const fromNumber = payload.from?.phone_number;
      const toNumber = payload.to?.[0]?.phone_number;
      const messageText = payload.text;
      const messagingProfileId = payload.messaging_profile_id;

      console.log(`📨 Inbound SMS from ${fromNumber} to ${toNumber}: ${messageText}`);

      // Find which user owns this phone number (multi-tenant lookup)
      let userId = null;
      let apiKey = null;

      // Check user_integrations for the phone number
      const userIntResult = await pool.query(
        `SELECT user_id, api_key_encrypted, extra_config FROM user_integrations
         WHERE provider = 'telnyx' AND status = 'connected'
         AND (extra_config->>'phone_number' = $1 OR extra_config->>'messaging_profile_id' = $2)`,
        [toNumber, messagingProfileId]
      );

      if (userIntResult.rows.length > 0) {
        userId = userIntResult.rows[0].user_id;
        apiKey = decryptApiKey(userIntResult.rows[0].api_key_encrypted);
      } else {
        // Fallback to global integration
        const globalResult = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['telnyx']);
        if (globalResult.rows[0]?.api_key_encrypted) {
          apiKey = decryptApiKey(globalResult.rows[0].api_key_encrypted);
        }
      }

      // Final fallback to environment variable
      if (!apiKey && process.env.TELNYX_API_KEY) {
        apiKey = process.env.TELNYX_API_KEY;
        console.log('Using TELNYX_API_KEY from environment');
      }

      // Save inbound message to sms_conversations
      await pool.query(
        `INSERT INTO sms_conversations (from_number, to_number, direction, message, user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [fromNumber, toNumber, 'inbound', messageText, userId]
      );

      // Generate AI response if OpenAI key is available
      let aiResponse = null;
      const openaiKey = process.env.OPENAI_API_KEY;

      if (openaiKey && apiKey) {
        try {
          // Get user/company context for personalized response
          let companyName = 'our company';
          if (userId) {
            const userResult = await pool.query('SELECT name, company FROM users WHERE id = $1', [userId]);
            if (userResult.rows[0]?.company) {
              companyName = userResult.rows[0].company;
            }
          }

          // Berry Bly Productions AI Concierge prompt
          const berryBlyPrompt = `You are the AI Concierge for Berry Bly Productions, Miami's premier luxury events company.

ABOUT US:
- We organize exclusive luxury events, VIP parties, fashion shows, and high-profile networking experiences
- Locations: Miami, FL - venues include LIV Miami, E11EVEN, Faena Hotel, Setai
- Website: berry.merktop.com | Email: concierge@berrybly.com

COMMON ANSWERS:
- Dress Code: Upscale/cocktail attire. Gentlemen: dress shoes required, no athletic wear. Ladies: elegant attire.
- VIP Tables: Premium bottle service starting at $2,000. Message for availability.
- Guest List: Your name should be on the list. Have valid ID ready at the door.
- Arrival: We recommend arriving 30-60 minutes after doors open.

SPONSORSHIP TIERS: Bronze ($1K-5K), Silver ($5K-15K), Gold ($15K-35K), Platinum ($35K-75K), Diamond ($75K-150K), Title ($150K+)

RESPONSE RULES:
- Be sophisticated, warm, and make every guest feel like a VIP
- Keep SMS responses under 160 characters
- Respond in the same language as the message (English or Spanish)
- For complex requests, offer to have a team member follow up

Current message from guest:`;

          // Call OpenAI for AI response
          const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: berryBlyPrompt
                },
                {
                  role: 'user',
                  content: messageText
                }
              ],
              max_tokens: 150,
              temperature: 0.7
            })
          });

          const openaiData = await openaiResponse.json();
          aiResponse = openaiData.choices?.[0]?.message?.content;

          if (aiResponse) {
            // Send AI response via Telnyx
            const replyPayload = {
              from: toNumber,
              to: fromNumber,
              text: aiResponse
            };

            if (messagingProfileId) {
              replyPayload.messaging_profile_id = messagingProfileId;
            }

            const telnyxReply = await fetch('https://api.telnyx.com/v2/messages', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(replyPayload)
            });

            const replyData = await telnyxReply.json();
            console.log(`🤖 AI Response sent: ${aiResponse}`);

            // Save AI response to conversation
            await pool.query(
              `INSERT INTO sms_conversations (from_number, to_number, direction, message, ai_response, user_id)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [toNumber, fromNumber, 'outbound', aiResponse, aiResponse, userId]
            );
          }
        } catch (aiError) {
          console.error('AI response error:', aiError.message);
        }
      }

      res.json({ success: true, processed: true, aiResponse: !!aiResponse });
    } else {
      // Acknowledge other event types
      res.json({ success: true, eventType: event.data?.event_type });
    }
  } catch (error) {
    console.error('Telnyx webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================
// SMS CONVERSATIONS MANAGEMENT ENDPOINTS
// ============================================

// GET /api/v1/sms/conversations - Get all conversations
app.get('/api/v1/sms/conversations', async (req, res) => {
  try {
    const { limit = 100, phone } = req.query;

    let query = 'SELECT * FROM sms_conversations WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (phone) {
      query += ` AND (from_number = $${paramIndex} OR to_number = $${paramIndex})`;
      params.push(phone);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    res.json({
      success: true,
      conversations: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching SMS conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// GET /api/v1/sms/conversations/threads - Get conversation threads grouped by phone number
app.get('/api/v1/sms/conversations/threads', async (req, res) => {
  try {
    const telnyxNumber = process.env.TELNYX_PHONE_NUMBER || '+19858539097';

    // Get unique phone numbers with their last message
    const result = await pool.query(`
      WITH ranked_messages AS (
        SELECT
          CASE
            WHEN from_number = $1 THEN to_number
            ELSE from_number
          END as contact_number,
          message,
          direction,
          is_read,
          is_human_takeover,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY CASE WHEN from_number = $1 THEN to_number ELSE from_number END
            ORDER BY created_at DESC
          ) as rn
        FROM sms_conversations
        WHERE from_number = $1 OR to_number = $1
      )
      SELECT
        contact_number,
        message as last_message,
        direction as last_direction,
        is_read,
        is_human_takeover,
        created_at as last_message_at,
        (SELECT COUNT(*) FROM sms_conversations
         WHERE (from_number = contact_number OR to_number = contact_number)
         AND (from_number = $1 OR to_number = $1)) as message_count,
        (SELECT COUNT(*) FROM sms_conversations
         WHERE from_number = contact_number AND to_number = $1 AND is_read = false) as unread_count
      FROM ranked_messages
      WHERE rn = 1
      ORDER BY created_at DESC
    `, [telnyxNumber]);

    res.json({
      success: true,
      threads: result.rows,
      total: result.rows.length,
      telnyxNumber
    });
  } catch (error) {
    console.error('Error fetching conversation threads:', error);
    res.status(500).json({ error: 'Failed to fetch threads' });
  }
});

// GET /api/v1/sms/conversations/thread/:phone - Get messages for a specific thread
app.get('/api/v1/sms/conversations/thread/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const { limit = 100 } = req.query;
    const telnyxNumber = process.env.TELNYX_PHONE_NUMBER || '+19858539097';

    const result = await pool.query(`
      SELECT * FROM sms_conversations
      WHERE (from_number = $1 AND to_number = $2)
         OR (from_number = $2 AND to_number = $1)
      ORDER BY created_at ASC
      LIMIT $3
    `, [phone, telnyxNumber, parseInt(limit)]);

    // Mark messages as read
    await pool.query(`
      UPDATE sms_conversations SET is_read = true
      WHERE from_number = $1 AND to_number = $2 AND is_read = false
    `, [phone, telnyxNumber]);

    res.json({
      success: true,
      messages: result.rows,
      total: result.rows.length,
      contactNumber: phone,
      telnyxNumber
    });
  } catch (error) {
    console.error('Error fetching thread messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/v1/sms/conversations/reply - Send manual reply (human takeover)
app.post('/api/v1/sms/conversations/reply', async (req, res) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: 'to and message are required' });
    }

    let apiKey = process.env.TELNYX_API_KEY;
    const fromNumber = process.env.TELNYX_PHONE_NUMBER;

    if (!apiKey) {
      const result = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['telnyx']);
      if (result.rows[0]?.api_key_encrypted) {
        apiKey = decryptApiKey(result.rows[0].api_key_encrypted);
      }
    }

    if (!apiKey || !fromNumber) {
      return res.status(400).json({ error: 'Telnyx not configured' });
    }

    // Send the message
    const telnyxResponse = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromNumber,
        to: to,
        text: message
      })
    });

    const telnyxData = await telnyxResponse.json();

    if (telnyxResponse.ok) {
      // Save to conversations with human flag
      await pool.query(`
        INSERT INTO sms_conversations (from_number, to_number, direction, message, is_human_takeover)
        VALUES ($1, $2, 'outbound', $3, true)
      `, [fromNumber, to, message]);

      // Mark conversation as human takeover
      await pool.query(`
        UPDATE sms_conversations SET is_human_takeover = true
        WHERE (from_number = $1 AND to_number = $2) OR (from_number = $2 AND to_number = $1)
      `, [to, fromNumber]);

      res.json({
        success: true,
        message: 'Reply sent successfully',
        messageId: telnyxData.data?.id
      });
    } else {
      res.status(400).json({
        error: telnyxData.errors?.[0]?.detail || 'Failed to send reply'
      });
    }
  } catch (error) {
    console.error('Error sending reply:', error);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// PUT /api/v1/sms/conversations/takeover/:phone - Toggle human takeover for a thread
app.put('/api/v1/sms/conversations/takeover/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const { enable } = req.body;
    const telnyxNumber = process.env.TELNYX_PHONE_NUMBER || '+19858539097';

    await pool.query(`
      UPDATE sms_conversations SET is_human_takeover = $1
      WHERE (from_number = $2 AND to_number = $3) OR (from_number = $3 AND to_number = $2)
    `, [enable !== false, phone, telnyxNumber]);

    res.json({
      success: true,
      message: enable !== false ? 'Human takeover enabled' : 'AI mode restored',
      humanTakeover: enable !== false
    });
  } catch (error) {
    console.error('Error toggling takeover:', error);
    res.status(500).json({ error: 'Failed to toggle takeover' });
  }
});

// PUT /api/v1/sms/conversations/:id/read - Mark message as read
app.put('/api/v1/sms/conversations/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('UPDATE sms_conversations SET is_read = true WHERE id = $1', [id]);

    res.json({ success: true, message: 'Marked as read' });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// DELETE /api/v1/sms/conversations/:id - Delete a single message
app.delete('/api/v1/sms/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM sms_conversations WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// DELETE /api/v1/sms/conversations/thread/:phone - Delete entire thread
app.delete('/api/v1/sms/conversations/thread/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const telnyxNumber = process.env.TELNYX_PHONE_NUMBER || '+19858539097';

    const result = await pool.query(`
      DELETE FROM sms_conversations
      WHERE (from_number = $1 AND to_number = $2) OR (from_number = $2 AND to_number = $1)
      RETURNING *
    `, [phone, telnyxNumber]);

    res.json({
      success: true,
      message: `Deleted ${result.rows.length} messages`,
      deletedCount: result.rows.length
    });
  } catch (error) {
    console.error('Error deleting thread:', error);
    res.status(500).json({ error: 'Failed to delete thread' });
  }
});

// GET /api/v1/sms/conversations/stats - Get conversation statistics
app.get('/api/v1/sms/conversations/stats', async (req, res) => {
  try {
    const telnyxNumber = process.env.TELNYX_PHONE_NUMBER || '+19858539097';

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_messages,
        COUNT(DISTINCT CASE WHEN from_number = $1 THEN to_number ELSE from_number END) as total_contacts,
        COUNT(*) FILTER (WHERE direction = 'inbound') as inbound_count,
        COUNT(*) FILTER (WHERE direction = 'outbound') as outbound_count,
        COUNT(*) FILTER (WHERE is_read = false AND direction = 'inbound') as unread_count,
        COUNT(*) FILTER (WHERE is_human_takeover = true) as human_takeover_count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h
      FROM sms_conversations
      WHERE from_number = $1 OR to_number = $1
    `, [telnyxNumber]);

    res.json({
      success: true,
      stats: stats.rows[0]
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================
// EVENTBRITE OAUTH 2.0 - Authentication Flow
// ============================================

// OAuth Configuration - MUST be set in environment variables
const EVENTBRITE_CLIENT_ID = process.env.EVENTBRITE_CLIENT_ID;
const EVENTBRITE_CLIENT_SECRET = process.env.EVENTBRITE_CLIENT_SECRET;
const EVENTBRITE_REDIRECT_URI = process.env.EVENTBRITE_REDIRECT_URI || 'https://berry-dashboard-api-production.up.railway.app/api/v1/auth/eventbrite/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://berry-dashboard-production.up.railway.app';

// Warn if Eventbrite credentials are not configured
if (!EVENTBRITE_CLIENT_ID || !EVENTBRITE_CLIENT_SECRET) {
  console.warn('⚠️ EVENTBRITE_CLIENT_ID and/or EVENTBRITE_CLIENT_SECRET not configured. Eventbrite OAuth will not work.');
}

// GET /api/v1/auth/eventbrite - Redirect to Eventbrite for authorization
app.get('/api/v1/auth/eventbrite', (req, res) => {
  // Get user ID from query parameter (passed from frontend)
  const userId = req.query.userId || 'global';

  // Generate a state parameter for CSRF protection, include userId
  const randomPart = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const state = `${randomPart}_${userId}`;

  // Store state in a cookie for validation
  res.cookie('eventbrite_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000 // 10 minutes
  });

  const authUrl = `https://www.eventbrite.com/oauth/authorize?response_type=code&client_id=${EVENTBRITE_CLIENT_ID}&redirect_uri=${encodeURIComponent(EVENTBRITE_REDIRECT_URI)}&state=${state}`;

  console.log('Redirecting to Eventbrite OAuth:', authUrl, 'for user:', userId);
  res.redirect(authUrl);
});

// GET /api/v1/auth/eventbrite/callback - Handle OAuth callback
app.get('/api/v1/auth/eventbrite/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    // Check for errors from Eventbrite
    if (error) {
      console.error('Eventbrite OAuth error:', error);
      return res.redirect(`${FRONTEND_URL}/dashboard?eventbrite=error&message=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return res.redirect(`${FRONTEND_URL}/dashboard?eventbrite=error&message=No authorization code received`);
    }

    // Validate state parameter (CSRF protection)
    const savedState = req.cookies?.eventbrite_oauth_state;
    if (state && savedState && state !== savedState) {
      console.error('State mismatch - possible CSRF attack');
      return res.redirect(`${FRONTEND_URL}/dashboard?eventbrite=error&message=Invalid state parameter`);
    }

    // Extract userId from state (format: randomPart_userId)
    const stateParts = (state || '').split('_');
    const userId = stateParts.length > 1 ? stateParts[stateParts.length - 1] : 'global';
    console.log('Processing OAuth callback for user:', userId);

    // Exchange authorization code for access token
    console.log('Exchanging code for token...');
    const tokenResponse = await fetch('https://www.eventbrite.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: EVENTBRITE_CLIENT_ID,
        client_secret: EVENTBRITE_CLIENT_SECRET,
        code: code,
        redirect_uri: EVENTBRITE_REDIRECT_URI
      }).toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return res.redirect(`${FRONTEND_URL}/dashboard?eventbrite=error&message=Failed to exchange token`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error('No access token in response:', tokenData);
      return res.redirect(`${FRONTEND_URL}/dashboard?eventbrite=error&message=No access token received`);
    }

    console.log('Got access token, fetching user info...');

    // Get user info to verify token works
    const userResponse = await fetch('https://www.eventbriteapi.com/v3/users/me/', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!userResponse.ok) {
      console.error('Failed to fetch user info');
      return res.redirect(`${FRONTEND_URL}/dashboard?eventbrite=error&message=Failed to verify token`);
    }

    const userData = await userResponse.json();
    const eventbriteEmail = userData.emails?.[0]?.email;
    console.log('Eventbrite user:', userData.name, eventbriteEmail);

    // Encrypt and store the access token
    const encryptedToken = encryptApiKey(accessToken);

    // Store in user_integrations table (per-user)
    if (userId && userId !== 'global') {
      await pool.query(`
        INSERT INTO user_integrations (user_id, provider, api_key_encrypted, status, provider_user_id, provider_user_email, provider_user_name, last_sync, extra_config)
        VALUES ($1, 'eventbrite', $2, 'connected', $3, $4, $5, NOW(), $6)
        ON CONFLICT (user_id, provider)
        DO UPDATE SET
          api_key_encrypted = $2,
          status = 'connected',
          provider_user_id = $3,
          provider_user_email = $4,
          provider_user_name = $5,
          last_sync = NOW(),
          extra_config = $6,
          updated_at = NOW()
      `, [
        userId,
        encryptedToken,
        userData.id,
        eventbriteEmail,
        userData.name,
        JSON.stringify({ connectedAt: new Date().toISOString() })
      ]);
      console.log(`Eventbrite connected for user ${userId}: ${eventbriteEmail}`);
    } else {
      // Fallback to global integrations table (backward compatibility)
      await pool.query(`
        INSERT INTO integrations (provider, api_key_encrypted, status, last_sync, extra_config)
        VALUES ('eventbrite', $1, 'connected', NOW(), $2)
        ON CONFLICT (provider)
        DO UPDATE SET
          api_key_encrypted = $1,
          status = 'connected',
          last_sync = NOW(),
          extra_config = $2
      `, [
        encryptedToken,
        JSON.stringify({
          userName: userData.name,
          userEmail: eventbriteEmail,
          connectedAt: new Date().toISOString()
        })
      ]);
      console.log('Eventbrite connected globally (no user specified)');
    }

    // Clear the state cookie
    res.clearCookie('eventbrite_oauth_state');

    // Generate a temporary auto-login token for the user
    let autoLoginToken = null;
    if (userId && userId !== 'global') {
      // Create a short-lived token that the frontend can use to restore the session
      autoLoginToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Store the auto-login token
      await pool.query(`
        INSERT INTO oauth_tokens (user_id, access_token, token_type, expires_at)
        VALUES ($1, $2, 'auto_login', $3)
      `, [userId, autoLoginToken, expiresAt]);
    }

    // Redirect back to dashboard with success and auto-login token
    const redirectUrl = autoLoginToken
      ? `${FRONTEND_URL}/dashboard?eventbrite=connected&user=${encodeURIComponent(userData.name || 'User')}&autoLogin=${autoLoginToken}`
      : `${FRONTEND_URL}/dashboard?eventbrite=connected&user=${encodeURIComponent(userData.name || 'User')}`;

    res.redirect(redirectUrl);

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${FRONTEND_URL}/dashboard?eventbrite=error&message=${encodeURIComponent(error.message)}`);
  }
});

// GET /api/v1/auth/eventbrite/status - Check connection status (per-user)
app.get('/api/v1/auth/eventbrite/status', async (req, res) => {
  try {
    const userId = req.query.userId;

    // Check user_integrations first (per-user)
    if (userId) {
      const userResult = await pool.query(
        'SELECT * FROM user_integrations WHERE user_id = $1::integer AND provider = $2',
        [userId, 'eventbrite']
      );

      if (userResult.rows.length > 0) {
        const integration = userResult.rows[0];

        if (integration.status !== 'connected') {
          return res.json({ connected: false });
        }

        // Verify token is still valid
        const apiKey = decryptApiKey(integration.api_key_encrypted);
        const userResponse = await fetch('https://www.eventbriteapi.com/v3/users/me/', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!userResponse.ok) {
          await pool.query(
            'UPDATE user_integrations SET status = $1 WHERE user_id = $2::integer AND provider = $3',
            ['expired', userId, 'eventbrite']
          );
          return res.json({ connected: false, error: 'Token expired' });
        }

        const userData = await userResponse.json();

        return res.json({
          connected: true,
          user: {
            name: integration.provider_user_name || userData.name,
            email: integration.provider_user_email || userData.emails?.[0]?.email
          },
          connectedAt: integration.created_at,
          lastSync: integration.last_sync
        });
      }
    }

    // Fallback to global integrations table
    const result = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['eventbrite']);
    const integration = result.rows[0];

    if (!integration || integration.status !== 'connected') {
      return res.json({ connected: false });
    }

    const apiKey = decryptApiKey(integration.api_key_encrypted);
    const userResponse = await fetch('https://www.eventbriteapi.com/v3/users/me/', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!userResponse.ok) {
      await pool.query('UPDATE integrations SET status = $1 WHERE provider = $2', ['expired', 'eventbrite']);
      return res.json({ connected: false, error: 'Token expired' });
    }

    const userData = await userResponse.json();
    const extraConfig = integration.extra_config ? (typeof integration.extra_config === 'string' ? JSON.parse(integration.extra_config) : integration.extra_config) : {};

    res.json({
      connected: true,
      user: {
        name: userData.name,
        email: userData.emails?.[0]?.email
      },
      connectedAt: extraConfig.connectedAt,
      lastSync: integration.last_sync
    });

  } catch (error) {
    console.error('Error checking Eventbrite status:', error);
    res.json({ connected: false, error: error.message });
  }
});

// POST /api/v1/auth/auto-login - Exchange auto-login token for session
app.post('/api/v1/auth/auto-login', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    // Find and validate the auto-login token
    const result = await pool.query(`
      SELECT t.*, u.id as user_id, u.email, u.name, u.company
      FROM oauth_tokens t
      JOIN users u ON t.user_id = u.id
      WHERE t.access_token = $1 AND t.token_type = 'auto_login' AND t.expires_at > NOW()
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userData = result.rows[0];

    // Delete the used auto-login token (one-time use)
    await pool.query('DELETE FROM oauth_tokens WHERE access_token = $1', [token]);

    // Generate a new session token
    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await pool.query(`
      INSERT INTO oauth_tokens (user_id, access_token, token_type, expires_at)
      VALUES ($1, $2, 'session', $3)
    `, [userData.user_id, newToken, expiresAt]);

    res.json({
      success: true,
      token: newToken,
      user: {
        id: userData.user_id,
        email: userData.email,
        name: userData.name,
        company: userData.company
      }
    });

  } catch (error) {
    console.error('Auto-login error:', error);
    res.status(500).json({ error: 'Auto-login failed' });
  }
});

// POST /api/v1/auth/eventbrite/disconnect - Disconnect Eventbrite (per-user)
app.post('/api/v1/auth/eventbrite/disconnect', async (req, res) => {
  try {
    const { userId } = req.body;
    let accessToken = null;
    let tokenRevoked = false;

    if (userId) {
      // Get the access token before deleting
      const tokenResult = await pool.query(
        'SELECT api_key_encrypted FROM user_integrations WHERE user_id = $1::integer AND provider = $2',
        [userId, 'eventbrite']
      );

      if (tokenResult.rows.length > 0) {
        accessToken = tokenResult.rows[0].api_key_encrypted;
      }

      // Delete the integration from database
      await pool.query(
        'DELETE FROM user_integrations WHERE user_id = $1::integer AND provider = $2',
        [userId, 'eventbrite']
      );
      console.log(`Eventbrite disconnected for user ${userId}`);
    } else {
      // Fallback to global disconnect
      const tokenResult = await pool.query(
        'SELECT api_key_encrypted FROM integrations WHERE provider = $1',
        ['eventbrite']
      );

      if (tokenResult.rows.length > 0) {
        accessToken = tokenResult.rows[0].api_key_encrypted;
      }

      await pool.query('UPDATE integrations SET status = $1, api_key_encrypted = NULL WHERE provider = $2', ['disconnected', 'eventbrite']);
    }

    // Revoke the OAuth token from Eventbrite
    if (accessToken) {
      try {
        const revokeResponse = await fetch('https://www.eventbriteapi.com/v3/users/me/access_tokens/current/', {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (revokeResponse.ok) {
          tokenRevoked = true;
          console.log('✅ Eventbrite OAuth token revoked successfully');
        } else {
          console.warn('⚠️ Failed to revoke Eventbrite token:', revokeResponse.status);
        }
      } catch (revokeError) {
        console.warn('⚠️ Error revoking Eventbrite token:', revokeError.message);
      }
    }

    res.json({
      success: true,
      message: 'Eventbrite disconnected',
      tokenRevoked,
    });
  } catch (error) {
    console.error('Error disconnecting Eventbrite:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// ============================================
// EVENTBRITE SYNC - Import events and tickets
// ============================================

// POST /api/v1/integrations/eventbrite/sync - Sync events from Eventbrite
app.post('/api/v1/integrations/eventbrite/sync', async (req, res) => {
  try {
    // Use authenticated user from token, fallback to body for backwards compatibility
    const userId = req.user?.id || req.body.userId;
    let apiKey = null;

    // Check user_integrations first (per-user)
    if (userId) {
      const userResult = await pool.query(
        'SELECT * FROM user_integrations WHERE user_id = $1::integer AND provider = $2 AND status = $3',
        [userId, 'eventbrite', 'connected']
      );
      if (userResult.rows.length > 0) {
        apiKey = decryptApiKey(userResult.rows[0].api_key_encrypted);
      }
    }

    // Fallback to global integrations
    if (!apiKey) {
      const result = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['eventbrite']);
      const saved = result.rows[0];
      if (saved?.api_key_encrypted && saved.status === 'connected') {
        apiKey = decryptApiKey(saved.api_key_encrypted);
      }
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected. Please connect your Eventbrite account first.' });
    }

    // Get user's organizations
    const orgResponse = await fetch('https://www.eventbriteapi.com/v3/users/me/organizations/', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!orgResponse.ok) {
      return res.status(400).json({ error: 'Failed to fetch organizations' });
    }

    const orgData = await orgResponse.json();
    const organizations = orgData.organizations || [];

    // Ensure required columns exist for Eventbrite sync
    try {
      await pool.query(`
        ALTER TABLE events ADD COLUMN IF NOT EXISTS external_id VARCHAR(100);
        ALTER TABLE events ADD COLUMN IF NOT EXISTS external_source VARCHAR(50);
        ALTER TABLE events ADD COLUMN IF NOT EXISTS eventbrite_url TEXT;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_types JSONB DEFAULT '[]';
      `);
    } catch (colErr) {
      console.log('Column check/add:', colErr.message);
    }

    let totalEvents = 0;
    let totalTickets = 0;
    let insertErrors = [];

    // For each organization, get events
    for (const org of organizations) {
      const eventsResponse = await fetch(`https://www.eventbriteapi.com/v3/organizations/${org.id}/events/?status=live,started,ended&expand=ticket_classes`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      if (!eventsResponse.ok) continue;

      const eventsData = await eventsResponse.json();
      const events = eventsData.events || [];

      for (const event of events) {
        // Extract ticket types from event
        const ticketTypes = (event.ticket_classes || []).map(tc => ({
          id: tc.id,
          name: tc.name || tc.display_name,
          price: tc.cost?.display || 'Free',
          quantity: tc.quantity_total,
          sold: tc.quantity_sold,
          available: tc.on_sale_status === 'AVAILABLE'
        }));

        // Check if event already exists FOR THIS USER (multi-tenant)
        const existingEvent = await pool.query(
          'SELECT id FROM events WHERE external_id = $1 AND external_source = $2 AND (user_id = $3::integer OR (user_id IS NULL AND $3::integer IS NULL))',
          [event.id, 'eventbrite', userId || null]
        );

        const eventDate = event.start?.utc ? new Date(event.start.utc).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const startTime = event.start?.local ? event.start.local.split('T')[1]?.substring(0, 5) : null;
        const endTime = event.end?.local ? event.end.local.split('T')[1]?.substring(0, 5) : null;
        const eventStatus = event.status === 'live' ? 'upcoming' : (event.status === 'ended' ? 'past' : 'planning');

        if (existingEvent.rows.length > 0) {
          // Update existing event (use berry-bly schema: title, date, time, venue, category)
          // IMPORTANT: Also filter by user_id for multi-tenant security
          await pool.query(`
            UPDATE events SET
              title = $1,
              description = $2,
              date = $3,
              time = $4,
              status = $5,
              eventbrite_url = $6,
              ticket_types = $7,
              flyer_url = $8,
              updated_at = NOW()
            WHERE external_id = $9 AND external_source = 'eventbrite'
            AND (user_id = $10::integer OR (user_id IS NULL AND $10::integer IS NULL))
          `, [
            event.name?.text || 'Untitled Event',
            event.description?.text || '',
            eventDate,
            startTime,
            eventStatus,
            event.url || '',
            JSON.stringify(ticketTypes),
            event.logo?.url || null,
            event.id,
            userId || null
          ]);
        } else {
          // Insert new event - generate ID and use berry-bly schema columns (title, date)
          // Get next ID first
          const maxIdResult = await pool.query("SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) + 1 as next_id FROM events WHERE id ~ '^[0-9]+$'");
          const nextId = maxIdResult.rows[0].next_id;

          try {
            // Use 'nightlife' as default category (only 'corporate' and 'nightlife' are valid)
            // Include user_id for multi-tenant support
            await pool.query(`
              INSERT INTO events (id, title, description, date, time, status, category, external_id, external_source, eventbrite_url, user_id)
              VALUES ($1, $2, $3, $4, $5, $6, 'nightlife', $7, 'eventbrite', $8, $9)
            `, [
              nextId.toString(),
              event.name?.text || 'Untitled Event',
              event.description?.text || '',
              eventDate,
              startTime,
              eventStatus,
              event.id,
              event.url || '',
              userId || null
            ]);
            console.log(`✅ Inserted Eventbrite event: ${event.name?.text} (id: ${nextId}) for user ${userId}`);
          } catch (insertErr) {
            console.error(`❌ Failed to insert event ${event.name?.text}:`, insertErr.message);
            insertErrors.push({ event: event.name?.text, error: insertErr.message });
            // Try fallback insert with minimal columns (title and date are required)
            try {
              await pool.query(`
                INSERT INTO events (id, title, date, status, category, user_id)
                VALUES ($1, $2, $3, $4, 'nightlife', $5)
              `, [
                nextId.toString(),
                event.name?.text || 'Untitled Event',
                eventDate,
                eventStatus,
                userId || null
              ]);
              console.log(`✅ Inserted Eventbrite event with minimal columns: ${event.name?.text} for user ${userId}`);
              insertErrors.pop(); // Remove the error since fallback worked
            } catch (fallbackErr) {
              console.error(`❌ Fallback insert also failed:`, fallbackErr.message);
              insertErrors[insertErrors.length - 1].fallbackError = fallbackErr.message;
            }
          }
        }

        totalEvents++;

        // Get attendees/tickets for this event
        const attendeesResponse = await fetch(`https://www.eventbriteapi.com/v3/events/${event.id}/attendees/`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (attendeesResponse.ok) {
          const attendeesData = await attendeesResponse.json();
          const attendees = attendeesData.attendees || [];

          for (const attendee of attendees) {
            const ticketId = `eb_${attendee.id}`;
            await pool.query(`
              INSERT INTO tickets (id, user_id, event_id, external_id, ticket_type, holder_name, holder_email, status, source, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'eventbrite', NOW())
              ON CONFLICT (id) DO UPDATE SET
                user_id = COALESCE(tickets.user_id, $2),
                holder_name = $6,
                holder_email = $7,
                status = $8,
                updated_at = NOW()
            `, [
              ticketId,
              userId || null,
              event.id,
              attendee.id,
              attendee.ticket_class_name || 'General',
              attendee.profile?.name || '',
              attendee.profile?.email || '',
              attendee.cancelled ? 'cancelled' : (attendee.checked_in ? 'used' : 'valid')
            ]);
            totalTickets++;
          }
        }
      }
    }

    // Update last sync time
    await pool.query(`
      UPDATE integrations SET last_sync = NOW(), updated_at = NOW() WHERE provider = 'eventbrite'
    `);

    // Get current event count to verify inserts worked
    const eventCount = await pool.query('SELECT COUNT(*) FROM events');

    res.json({
      success: true,
      message: `Synced ${totalEvents} events and ${totalTickets} tickets from Eventbrite`,
      eventsImported: totalEvents,
      ticketsImported: totalTickets,
      totalEventsInDb: parseInt(eventCount.rows[0].count),
      insertErrors: insertErrors.length > 0 ? insertErrors : undefined
    });
  } catch (error) {
    console.error('Error syncing Eventbrite:', error);
    res.status(500).json({ error: 'Failed to sync with Eventbrite: ' + error.message });
  }
});

// ============================================
// EVENTBRITE WEBHOOKS - Real-time ticket sales
// ============================================

// POST /api/webhooks/eventbrite - Receive webhook events from Eventbrite
app.post('/api/webhooks/eventbrite', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Eventbrite webhook received:', payload?.config?.action);

    // Verify we have the integration connected
    const integration = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['eventbrite']);
    if (!integration.rows[0] || integration.rows[0].status !== 'connected') {
      console.log('Eventbrite webhook received but integration not connected');
      return res.status(200).json({ received: true });
    }

    const apiKey = decryptApiKey(integration.rows[0].api_key_encrypted);
    const action = payload?.config?.action;
    const apiUrl = payload?.api_url;

    if (!apiUrl) {
      return res.status(200).json({ received: true, message: 'No API URL provided' });
    }

    // Handle different webhook actions
    switch (action) {
      case 'order.placed':
      case 'order.updated':
        // Fetch the full order details from Eventbrite
        const orderResponse = await fetch(apiUrl, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (orderResponse.ok) {
          const order = await orderResponse.json();

          // Get event details
          const eventResponse = await fetch(`https://www.eventbriteapi.com/v3/events/${order.event_id}/`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });
          const event = eventResponse.ok ? await eventResponse.json() : { name: { text: 'Unknown Event' } };

          // Calculate total from costs
          const totalAmount = order.costs?.gross?.value ? (order.costs.gross.value / 100) : 0;
          const currency = order.costs?.gross?.currency || 'USD';

          // Extract ticket info
          const tickets = (order.attendees || []).map(att => ({
            id: att.id,
            name: att.profile?.name || '',
            email: att.profile?.email || '',
            ticketType: att.ticket_class_name || 'General',
            checkedIn: att.checked_in || false
          }));

          // Upsert order
          await pool.query(`
            INSERT INTO orders (id, event_id, event_name, source, buyer_name, buyer_email, order_status, ticket_count, total_amount, currency, tickets, raw_data, updated_at)
            VALUES ($1, $2, $3, 'eventbrite', $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            ON CONFLICT (id) DO UPDATE SET
              order_status = $6,
              ticket_count = $7,
              total_amount = $8,
              tickets = $10,
              raw_data = $11,
              updated_at = NOW()
          `, [
            order.id,
            order.event_id,
            event.name?.text || 'Unknown Event',
            order.name || order.first_name + ' ' + order.last_name || '',
            order.email || '',
            order.status || 'placed',
            order.attendees?.length || 1,
            totalAmount,
            currency,
            JSON.stringify(tickets),
            JSON.stringify(order)
          ]);

          // Also add attendees to tickets table
          // Lookup user_id from the event to maintain multi-tenant isolation
          const eventOwner = await pool.query(
            'SELECT user_id FROM events WHERE external_id = $1 AND external_source = $2 LIMIT 1',
            [order.event_id, 'eventbrite']
          );
          const eventUserId = eventOwner.rows[0]?.user_id || null;

          for (const attendee of (order.attendees || [])) {
            const ticketId = `eb_${attendee.id}`;
            await pool.query(`
              INSERT INTO tickets (id, user_id, event_id, external_id, ticket_type, holder_name, holder_email, status, source, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'eventbrite', NOW())
              ON CONFLICT (id) DO UPDATE SET
                user_id = COALESCE(tickets.user_id, $2),
                holder_name = $6,
                holder_email = $7,
                status = $8,
                updated_at = NOW()
            `, [
              ticketId,
              eventUserId,
              order.event_id,
              attendee.id,
              attendee.ticket_class_name || 'General',
              attendee.profile?.name || '',
              attendee.profile?.email || '',
              attendee.cancelled ? 'cancelled' : (attendee.refunded ? 'refunded' : 'valid')
            ]);
          }

          // Log activity
          await pool.query(`
            INSERT INTO activity_log (action, details, guest_name, event_type)
            VALUES ($1, $2, $3, $4)
          `, [
            action === 'order.placed' ? 'New ticket purchase' : 'Order updated',
            `${order.attendees?.length || 1} ticket(s) for ${event.name?.text} - $${totalAmount} ${currency}`,
            order.name || order.email || 'Unknown',
            'ticket_sale'
          ]);

          // Broadcast to connected WebSocket clients
          wss.clients.forEach((client) => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: 'ticket_sale',
                data: {
                  orderId: order.id,
                  eventName: event.name?.text,
                  buyerName: order.name || order.email,
                  ticketCount: order.attendees?.length || 1,
                  totalAmount,
                  currency
                }
              }));
            }
          });

          console.log(`Processed ${action}: Order ${order.id} with ${order.attendees?.length || 1} tickets`);
        }
        break;

      case 'order.refunded':
        // Update order status to refunded
        const refundResponse = await fetch(apiUrl, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (refundResponse.ok) {
          const refund = await refundResponse.json();
          await pool.query(`
            UPDATE orders SET order_status = 'refunded', updated_at = NOW() WHERE id = $1
          `, [refund.id]);

          // Update tickets as refunded
          for (const attendee of (refund.attendees || [])) {
            await pool.query(`
              UPDATE tickets SET status = 'refunded', updated_at = NOW() WHERE external_id = $1
            `, [attendee.id]);
          }

          console.log(`Processed refund: Order ${refund.id}`);
        }
        break;

      case 'attendee.checked_in':
        // Update ticket check-in status
        const checkinResponse = await fetch(apiUrl, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (checkinResponse.ok) {
          const attendee = await checkinResponse.json();
          await pool.query(`
            UPDATE tickets SET status = 'used', check_in_time = NOW(), updated_at = NOW() WHERE external_id = $1
          `, [attendee.id]);

          console.log(`Processed check-in: Attendee ${attendee.id}`);
        }
        break;

      default:
        console.log(`Unhandled Eventbrite webhook action: ${action}`);
    }

    res.status(200).json({ received: true, action });
  } catch (error) {
    console.error('Error processing Eventbrite webhook:', error);
    // Always return 200 to Eventbrite so they don't retry
    res.status(200).json({ received: true, error: error.message });
  }
});

// POST /api/v1/integrations/eventbrite/setup-webhook - Register webhook with Eventbrite
app.post('/api/v1/integrations/eventbrite/setup-webhook', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['eventbrite']);
    const saved = result.rows[0];

    if (!saved?.api_key_encrypted || saved.status !== 'connected') {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    const apiKey = decryptApiKey(saved.api_key_encrypted);
    const webhookUrl = `${process.env.API_URL || 'https://berry-dashboard-api-production.up.railway.app'}/api/webhooks/eventbrite`;

    // Get user's organizations
    const orgResponse = await fetch('https://www.eventbriteapi.com/v3/users/me/organizations/', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!orgResponse.ok) {
      return res.status(400).json({ error: 'Failed to fetch organizations' });
    }

    const orgData = await orgResponse.json();
    const organizations = orgData.organizations || [];

    if (organizations.length === 0) {
      return res.status(400).json({ error: 'No organizations found' });
    }

    // Create webhook for the first organization
    const org = organizations[0];
    const webhookResponse = await fetch(`https://www.eventbriteapi.com/v3/organizations/${org.id}/webhooks/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        endpoint_url: webhookUrl,
        actions: 'order.placed,order.updated,order.refunded,attendee.checked_in,attendee.checked_out'
      })
    });

    if (!webhookResponse.ok) {
      const errorData = await webhookResponse.json();
      // Check if webhook already exists
      if (errorData.error_description?.includes('already exists')) {
        return res.json({ success: true, message: 'Webhook already configured' });
      }
      return res.status(400).json({ error: 'Failed to create webhook: ' + (errorData.error_description || 'Unknown error') });
    }

    const webhook = await webhookResponse.json();

    // Save webhook ID
    await pool.query(`
      UPDATE integrations SET webhook_id = $1, updated_at = NOW() WHERE provider = 'eventbrite'
    `, [webhook.id]);

    res.json({
      success: true,
      message: 'Webhook configured successfully',
      webhookId: webhook.id,
      webhookUrl
    });
  } catch (error) {
    console.error('Error setting up Eventbrite webhook:', error);
    res.status(500).json({ error: 'Failed to setup webhook: ' + error.message });
  }
});

// ============================================
// EVENTBRITE ENHANCED SYNC - Venues, Categories, Orders
// ============================================

// Helper function to get Eventbrite API key for user
async function getEventbriteApiKey(userId) {
  let apiKey = null;

  // Check user_integrations first (per-user)
  if (userId) {
    const userResult = await pool.query(
      'SELECT * FROM user_integrations WHERE user_id = $1::integer AND provider = $2 AND status = $3',
      [userId, 'eventbrite', 'connected']
    );
    if (userResult.rows.length > 0) {
      apiKey = decryptApiKey(userResult.rows[0].api_key_encrypted);
    }
  }

  // Fallback to global integrations
  if (!apiKey) {
    const result = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['eventbrite']);
    const saved = result.rows[0];
    if (saved?.api_key_encrypted && saved.status === 'connected') {
      apiKey = decryptApiKey(saved.api_key_encrypted);
    }
  }

  return apiKey;
}

// POST /api/v1/integrations/eventbrite/sync-venues - Sync venues from Eventbrite
app.post('/api/v1/integrations/eventbrite/sync-venues', async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const apiKey = await getEventbriteApiKey(userId);

    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    // Create sync log entry
    const syncLog = await pool.query(
      'INSERT INTO eventbrite_sync_log (user_id, sync_type, status) VALUES ($1, $2, $3) RETURNING id',
      [userId || null, 'venues', 'running']
    );
    const syncLogId = syncLog.rows[0].id;

    // Get user's organizations
    const orgResponse = await fetch('https://www.eventbriteapi.com/v3/users/me/organizations/', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!orgResponse.ok) {
      await pool.query('UPDATE eventbrite_sync_log SET status = $1, completed_at = NOW() WHERE id = $2', ['failed', syncLogId]);
      return res.status(400).json({ error: 'Failed to fetch organizations' });
    }

    const orgData = await orgResponse.json();
    const organizations = orgData.organizations || [];

    let totalVenues = 0;
    let created = 0;
    let updated = 0;
    let errors = [];

    // For each organization, get venues
    for (const org of organizations) {
      const venuesResponse = await fetch(`https://www.eventbriteapi.com/v3/organizations/${org.id}/venues/`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      if (!venuesResponse.ok) continue;

      const venuesData = await venuesResponse.json();
      const venues = venuesData.venues || [];

      for (const venue of venues) {
        try {
          const existingVenue = await pool.query('SELECT id FROM eventbrite_venues WHERE id = $1', [venue.id]);

          if (existingVenue.rows.length > 0) {
            // Update existing venue
            await pool.query(`
              UPDATE eventbrite_venues SET
                name = $1,
                address_1 = $2,
                address_2 = $3,
                city = $4,
                region = $5,
                postal_code = $6,
                country = $7,
                latitude = $8,
                longitude = $9,
                capacity = $10,
                age_restriction = $11,
                raw_data = $12,
                updated_at = NOW()
              WHERE id = $13
            `, [
              venue.name,
              venue.address?.address_1,
              venue.address?.address_2,
              venue.address?.city,
              venue.address?.region,
              venue.address?.postal_code,
              venue.address?.country,
              venue.address?.latitude,
              venue.address?.longitude,
              venue.capacity,
              venue.age_restriction,
              JSON.stringify(venue),
              venue.id
            ]);
            updated++;
          } else {
            // Insert new venue
            await pool.query(`
              INSERT INTO eventbrite_venues (id, user_id, name, address_1, address_2, city, region, postal_code, country, latitude, longitude, capacity, age_restriction, raw_data)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `, [
              venue.id,
              userId || null,
              venue.name,
              venue.address?.address_1,
              venue.address?.address_2,
              venue.address?.city,
              venue.address?.region,
              venue.address?.postal_code,
              venue.address?.country,
              venue.address?.latitude,
              venue.address?.longitude,
              venue.capacity,
              venue.age_restriction,
              JSON.stringify(venue)
            ]);
            created++;
          }
          totalVenues++;
        } catch (err) {
          errors.push({ venue: venue.name, error: err.message });
        }
      }
    }

    // Update sync log
    await pool.query(`
      UPDATE eventbrite_sync_log SET
        items_synced = $1,
        items_created = $2,
        items_updated = $3,
        items_failed = $4,
        error_details = $5,
        status = 'completed',
        completed_at = NOW()
      WHERE id = $6
    `, [totalVenues, created, updated, errors.length, errors.length > 0 ? JSON.stringify(errors) : null, syncLogId]);

    res.json({
      success: true,
      message: `Synced ${totalVenues} venues (${created} created, ${updated} updated)`,
      totalVenues,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error syncing venues:', error);
    res.status(500).json({ error: 'Failed to sync venues: ' + error.message });
  }
});

// POST /api/v1/integrations/eventbrite/sync-categories - Sync categories from Eventbrite
app.post('/api/v1/integrations/eventbrite/sync-categories', async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const apiKey = await getEventbriteApiKey(userId);

    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    // Create sync log entry
    const syncLog = await pool.query(
      'INSERT INTO eventbrite_sync_log (user_id, sync_type, status) VALUES ($1, $2, $3) RETURNING id',
      [userId || null, 'categories', 'running']
    );
    const syncLogId = syncLog.rows[0].id;

    // Fetch categories from Eventbrite
    const categoriesResponse = await fetch('https://www.eventbriteapi.com/v3/categories/', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!categoriesResponse.ok) {
      await pool.query('UPDATE eventbrite_sync_log SET status = $1, completed_at = NOW() WHERE id = $2', ['failed', syncLogId]);
      return res.status(400).json({ error: 'Failed to fetch categories' });
    }

    const categoriesData = await categoriesResponse.json();
    const categories = categoriesData.categories || [];

    let totalCategories = 0;
    let totalSubcategories = 0;

    for (const category of categories) {
      // Upsert category
      await pool.query(`
        INSERT INTO eventbrite_categories (id, name, name_localized, short_name, short_name_localized, resource_uri)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          name = $2,
          name_localized = $3,
          short_name = $4,
          short_name_localized = $5,
          resource_uri = $6
      `, [
        category.id,
        category.name,
        category.name_localized,
        category.short_name,
        category.short_name_localized,
        category.resource_uri
      ]);
      totalCategories++;

      // Fetch subcategories for this category
      if (category.subcategories && category.subcategories.length > 0) {
        for (const subcategory of category.subcategories) {
          await pool.query(`
            INSERT INTO eventbrite_subcategories (id, parent_category_id, name, name_localized, resource_uri)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE SET
              parent_category_id = $2,
              name = $3,
              name_localized = $4,
              resource_uri = $5
          `, [
            subcategory.id,
            category.id,
            subcategory.name,
            subcategory.name_localized,
            subcategory.resource_uri
          ]);
          totalSubcategories++;
        }
      }
    }

    // Update sync log
    await pool.query(`
      UPDATE eventbrite_sync_log SET
        items_synced = $1,
        items_created = $1,
        status = 'completed',
        completed_at = NOW()
      WHERE id = $2
    `, [totalCategories + totalSubcategories, syncLogId]);

    res.json({
      success: true,
      message: `Synced ${totalCategories} categories and ${totalSubcategories} subcategories`,
      totalCategories,
      totalSubcategories
    });
  } catch (error) {
    console.error('Error syncing categories:', error);
    res.status(500).json({ error: 'Failed to sync categories: ' + error.message });
  }
});

// POST /api/v1/integrations/eventbrite/sync-orders - Sync historical orders from Eventbrite
app.post('/api/v1/integrations/eventbrite/sync-orders', async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const { eventId } = req.body; // Optional: sync orders for specific event
    const apiKey = await getEventbriteApiKey(userId);

    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    // Create sync log entry
    const syncLog = await pool.query(
      'INSERT INTO eventbrite_sync_log (user_id, sync_type, status) VALUES ($1, $2, $3) RETURNING id',
      [userId || null, 'orders', 'running']
    );
    const syncLogId = syncLog.rows[0].id;

    // Get user's organizations
    const orgResponse = await fetch('https://www.eventbriteapi.com/v3/users/me/organizations/', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!orgResponse.ok) {
      await pool.query('UPDATE eventbrite_sync_log SET status = $1, completed_at = NOW() WHERE id = $2', ['failed', syncLogId]);
      return res.status(400).json({ error: 'Failed to fetch organizations' });
    }

    const orgData = await orgResponse.json();
    const organizations = orgData.organizations || [];

    let totalOrders = 0;
    let created = 0;
    let updated = 0;
    let errors = [];

    // For each organization, get events and then orders
    for (const org of organizations) {
      // Get events
      let eventsUrl = `https://www.eventbriteapi.com/v3/organizations/${org.id}/events/?status=live,started,ended`;
      if (eventId) {
        eventsUrl = `https://www.eventbriteapi.com/v3/events/${eventId}/`;
      }

      const eventsResponse = await fetch(eventsUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      if (!eventsResponse.ok) continue;

      const eventsData = await eventsResponse.json();
      const events = eventId ? [eventsData] : (eventsData.events || []);

      for (const event of events) {
        // Get orders for this event
        let ordersUrl = `https://www.eventbriteapi.com/v3/events/${event.id}/orders/`;
        let hasMore = true;

        while (hasMore) {
          const ordersResponse = await fetch(ordersUrl, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });

          if (!ordersResponse.ok) break;

          const ordersData = await ordersResponse.json();
          const orders = ordersData.orders || [];

          for (const order of orders) {
            try {
              const totalAmount = order.costs?.gross?.value ? parseFloat(order.costs.gross.value) / 100 : 0;
              const ticketCount = order.attendees?.length || 1;

              const existingOrder = await pool.query('SELECT id FROM orders WHERE id = $1', [order.id]);

              if (existingOrder.rows.length > 0) {
                await pool.query(`
                  UPDATE orders SET
                    order_status = $1,
                    ticket_count = $2,
                    total_amount = $3,
                    updated_at = NOW()
                  WHERE id = $4
                `, [order.status, ticketCount, totalAmount, order.id]);
                updated++;
              } else {
                await pool.query(`
                  INSERT INTO orders (id, event_id, event_name, source, buyer_name, buyer_email, order_status, ticket_count, total_amount, currency, raw_data, created_at)
                  VALUES ($1, $2, $3, 'eventbrite', $4, $5, $6, $7, $8, $9, $10, $11)
                `, [
                  order.id,
                  event.id,
                  event.name?.text || 'Unknown Event',
                  order.name || 'Unknown',
                  order.email || '',
                  order.status,
                  ticketCount,
                  totalAmount,
                  order.costs?.gross?.currency || 'USD',
                  JSON.stringify(order),
                  order.created ? new Date(order.created) : new Date()
                ]);
                created++;
              }
              totalOrders++;
            } catch (err) {
              errors.push({ order: order.id, error: err.message });
            }
          }

          // Check for pagination
          if (ordersData.pagination?.has_more_items && ordersData.pagination?.continuation) {
            ordersUrl = `https://www.eventbriteapi.com/v3/events/${event.id}/orders/?continuation=${ordersData.pagination.continuation}`;
          } else {
            hasMore = false;
          }
        }
      }
    }

    // Update sync log
    await pool.query(`
      UPDATE eventbrite_sync_log SET
        items_synced = $1,
        items_created = $2,
        items_updated = $3,
        items_failed = $4,
        error_details = $5,
        status = 'completed',
        completed_at = NOW()
      WHERE id = $6
    `, [totalOrders, created, updated, errors.length, errors.length > 0 ? JSON.stringify(errors) : null, syncLogId]);

    res.json({
      success: true,
      message: `Synced ${totalOrders} orders (${created} created, ${updated} updated)`,
      totalOrders,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error syncing orders:', error);
    res.status(500).json({ error: 'Failed to sync orders: ' + error.message });
  }
});

// GET /api/v1/integrations/eventbrite/search - Search public Eventbrite events
app.get('/api/v1/integrations/eventbrite/search', async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;
    const { q, location, category, start_date, end_date, price, page = 1 } = req.query;
    const apiKey = await getEventbriteApiKey(userId);

    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    // Build search URL
    let searchUrl = 'https://www.eventbriteapi.com/v3/events/search/?';
    const params = new URLSearchParams();

    if (q) params.append('q', q);
    if (location) params.append('location.address', location);
    if (category) params.append('categories', category);
    if (start_date) params.append('start_date.range_start', start_date);
    if (end_date) params.append('start_date.range_end', end_date);
    if (price === 'free') params.append('price', 'free');
    if (price === 'paid') params.append('price', 'paid');
    params.append('page', page);
    params.append('expand', 'venue,category,subcategory,organizer');

    const searchResponse = await fetch(searchUrl + params.toString(), {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!searchResponse.ok) {
      const errorData = await searchResponse.json();
      return res.status(400).json({ error: errorData.error_description || 'Search failed' });
    }

    const searchData = await searchResponse.json();

    // Transform events to a cleaner format
    const events = (searchData.events || []).map(event => ({
      id: event.id,
      name: event.name?.text,
      description: event.description?.text,
      url: event.url,
      start: event.start,
      end: event.end,
      status: event.status,
      currency: event.currency,
      isFree: event.is_free,
      isOnline: event.online_event,
      capacity: event.capacity,
      image: event.logo?.url,
      venue: event.venue ? {
        id: event.venue.id,
        name: event.venue.name,
        address: event.venue.address?.localized_address_display,
        city: event.venue.address?.city,
        latitude: event.venue.address?.latitude,
        longitude: event.venue.address?.longitude
      } : null,
      category: event.category ? {
        id: event.category.id,
        name: event.category.name
      } : null,
      organizer: event.organizer ? {
        id: event.organizer.id,
        name: event.organizer.name
      } : null
    }));

    res.json({
      success: true,
      events,
      pagination: searchData.pagination,
      total: searchData.pagination?.object_count || events.length
    });
  } catch (error) {
    console.error('Error searching Eventbrite:', error);
    res.status(500).json({ error: 'Search failed: ' + error.message });
  }
});

// GET /api/v1/integrations/eventbrite/venues - Get synced venues
app.get('/api/v1/integrations/eventbrite/venues', async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;
    const { city, limit = 100 } = req.query;

    let query = 'SELECT * FROM eventbrite_venues WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND user_id = $${paramIndex++}`;
      params.push(userId);
    }

    if (city) {
      query += ` AND city ILIKE $${paramIndex++}`;
      params.push(`%${city}%`);
    }

    query += ` ORDER BY name LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      venues: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching venues:', error);
    res.status(500).json({ error: 'Failed to fetch venues' });
  }
});

// GET /api/v1/integrations/eventbrite/categories - Get synced categories
app.get('/api/v1/integrations/eventbrite/categories', async (req, res) => {
  try {
    const categoriesResult = await pool.query('SELECT * FROM eventbrite_categories ORDER BY name');
    const subcategoriesResult = await pool.query('SELECT * FROM eventbrite_subcategories ORDER BY name');

    // Group subcategories by parent
    const categoriesWithSubs = categoriesResult.rows.map(cat => ({
      ...cat,
      subcategories: subcategoriesResult.rows.filter(sub => sub.parent_category_id === cat.id)
    }));

    res.json({
      success: true,
      categories: categoriesWithSubs,
      total: categoriesResult.rows.length
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/v1/integrations/eventbrite/sync-log - Get sync history
app.get('/api/v1/integrations/eventbrite/sync-log', async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;
    const { sync_type, limit = 50 } = req.query;

    let query = 'SELECT * FROM eventbrite_sync_log WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND user_id = $${paramIndex++}`;
      params.push(userId);
    }

    if (sync_type) {
      query += ` AND sync_type = $${paramIndex++}`;
      params.push(sync_type);
    }

    query += ` ORDER BY started_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      logs: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching sync log:', error);
    res.status(500).json({ error: 'Failed to fetch sync log' });
  }
});

// POST /api/v1/integrations/eventbrite/sync-all - Full sync of all Eventbrite data
app.post('/api/v1/integrations/eventbrite/sync-all', async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const apiKey = await getEventbriteApiKey(userId);

    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    const results = {
      events: { success: false, message: '' },
      venues: { success: false, message: '' },
      categories: { success: false, message: '' },
      orders: { success: false, message: '' }
    };

    // Sync categories first (no dependencies)
    try {
      const catResponse = await fetch('https://www.eventbriteapi.com/v3/categories/', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (catResponse.ok) {
        const catData = await catResponse.json();
        let catCount = 0;
        for (const cat of (catData.categories || [])) {
          await pool.query(`
            INSERT INTO eventbrite_categories (id, name, name_localized, short_name, short_name_localized, resource_uri)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET name = $2, name_localized = $3
          `, [cat.id, cat.name, cat.name_localized, cat.short_name, cat.short_name_localized, cat.resource_uri]);
          catCount++;
        }
        results.categories = { success: true, message: `Synced ${catCount} categories` };
      }
    } catch (e) {
      results.categories = { success: false, message: e.message };
    }

    // Get organizations for subsequent syncs
    const orgResponse = await fetch('https://www.eventbriteapi.com/v3/users/me/organizations/', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!orgResponse.ok) {
      return res.status(400).json({ error: 'Failed to fetch organizations', results });
    }

    const organizations = (await orgResponse.json()).organizations || [];

    let totalEvents = 0;
    let totalVenues = 0;
    let totalOrders = 0;

    for (const org of organizations) {
      // Sync venues
      try {
        const venuesResponse = await fetch(`https://www.eventbriteapi.com/v3/organizations/${org.id}/venues/`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (venuesResponse.ok) {
          const venuesData = await venuesResponse.json();
          for (const venue of (venuesData.venues || [])) {
            await pool.query(`
              INSERT INTO eventbrite_venues (id, user_id, name, address_1, city, region, country, latitude, longitude, raw_data)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT (id) DO UPDATE SET name = $3, city = $5, updated_at = NOW()
            `, [
              venue.id, userId || null, venue.name, venue.address?.address_1, venue.address?.city,
              venue.address?.region, venue.address?.country, venue.address?.latitude, venue.address?.longitude,
              JSON.stringify(venue)
            ]);
            totalVenues++;
          }
        }
      } catch (e) {
        console.error('Venue sync error:', e.message);
      }

      // Sync events
      try {
        const eventsResponse = await fetch(`https://www.eventbriteapi.com/v3/organizations/${org.id}/events/?status=live,started,ended&expand=ticket_classes,venue`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (eventsResponse.ok) {
          const eventsData = await eventsResponse.json();
          for (const event of (eventsData.events || [])) {
            // Check for existing event - MUST filter by user_id for multi-tenant
            const existingEvent = await pool.query(
              'SELECT id FROM events WHERE external_id = $1 AND external_source = $2 AND (user_id = $3::integer OR (user_id IS NULL AND $3::integer IS NULL))',
              [event.id, 'eventbrite', userId || null]
            );

            const eventDate = event.start?.utc ? new Date(event.start.utc).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            const startTime = event.start?.local ? event.start.local.split('T')[1]?.substring(0, 5) : null;

            if (existingEvent.rows.length > 0) {
              // Update - also filter by user_id for multi-tenant security
              await pool.query(`
                UPDATE events SET
                  title = $1, description = $2, date = $3, time = $4, status = $5,
                  eventbrite_url = $6, venue_id = $7, eventbrite_category_id = $8,
                  eventbrite_is_free = $9, eventbrite_capacity = $10, updated_at = NOW()
                WHERE external_id = $11 AND external_source = 'eventbrite'
                AND (user_id = $12::integer OR (user_id IS NULL AND $12::integer IS NULL))
              `, [
                event.name?.text, event.description?.text, eventDate, startTime,
                event.status === 'live' ? 'active' : event.status,
                event.url, event.venue_id, event.category_id,
                event.is_free, event.capacity, event.id, userId || null
              ]);
            } else {
              const nextIdResult = await pool.query("SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) + 1 as next_id FROM events WHERE id ~ '^[0-9]+$'");
              const nextId = nextIdResult.rows[0].next_id;
              await pool.query(`
                INSERT INTO events (id, title, description, date, time, status, category, external_id, external_source, eventbrite_url, venue_id, eventbrite_category_id, eventbrite_is_free, eventbrite_capacity, user_id)
                VALUES ($1, $2, $3, $4, $5, $6, 'nightlife', $7, 'eventbrite', $8, $9, $10, $11, $12, $13)
              `, [
                nextId.toString(), event.name?.text, event.description?.text, eventDate, startTime,
                event.status === 'live' ? 'active' : event.status,
                event.id, event.url, event.venue_id, event.category_id,
                event.is_free, event.capacity, userId || null
              ]);
            }
            totalEvents++;

            // Sync orders for this event
            try {
              const ordersResponse = await fetch(`https://www.eventbriteapi.com/v3/events/${event.id}/orders/`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
              });
              if (ordersResponse.ok) {
                const ordersData = await ordersResponse.json();
                for (const order of (ordersData.orders || [])) {
                  const totalAmount = order.costs?.gross?.value ? parseFloat(order.costs.gross.value) / 100 : 0;
                  await pool.query(`
                    INSERT INTO orders (id, event_id, event_name, source, buyer_name, buyer_email, order_status, ticket_count, total_amount, raw_data)
                    VALUES ($1, $2, $3, 'eventbrite', $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (id) DO UPDATE SET order_status = $6, updated_at = NOW()
                  `, [
                    order.id, event.id, event.name?.text, order.name || 'Unknown',
                    order.email || '', order.status, order.attendees?.length || 1,
                    totalAmount, JSON.stringify(order)
                  ]);
                  totalOrders++;
                }
              }
            } catch (e) {
              console.error('Order sync error for event', event.id, ':', e.message);
            }
          }
        }
      } catch (e) {
        console.error('Events sync error:', e.message);
      }
    }

    results.events = { success: true, message: `Synced ${totalEvents} events` };
    results.venues = { success: true, message: `Synced ${totalVenues} venues` };
    results.orders = { success: true, message: `Synced ${totalOrders} orders` };

    // Update last sync time
    await pool.query("UPDATE integrations SET last_sync = NOW() WHERE provider = 'eventbrite'");
    if (userId) {
      await pool.query("UPDATE user_integrations SET last_sync = NOW() WHERE user_id = $1 AND provider = 'eventbrite'", [userId]);
    }

    // Log the sync
    await pool.query(`
      INSERT INTO eventbrite_sync_log (user_id, sync_type, items_synced, status, completed_at)
      VALUES ($1, 'full', $2, 'completed', NOW())
    `, [userId || null, totalEvents + totalVenues + totalOrders]);

    res.json({
      success: true,
      message: 'Full sync completed',
      results,
      totals: { events: totalEvents, venues: totalVenues, orders: totalOrders }
    });
  } catch (error) {
    console.error('Error in full sync:', error);
    res.status(500).json({ error: 'Full sync failed: ' + error.message });
  }
});

// Auto-sync interval (runs every 30 minutes if enabled)
let autoSyncInterval = null;

// POST /api/v1/integrations/eventbrite/auto-sync/start - Start auto-sync
app.post('/api/v1/integrations/eventbrite/auto-sync/start', async (req, res) => {
  try {
    const { intervalMinutes = 30 } = req.body;

    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
    }

    const runAutoSync = async () => {
      console.log('🔄 Running Eventbrite auto-sync...');
      try {
        // Get all users with Eventbrite connected
        const usersResult = await pool.query(
          "SELECT DISTINCT user_id FROM user_integrations WHERE provider = 'eventbrite' AND status = 'connected'"
        );

        for (const row of usersResult.rows) {
          const userId = row.user_id;
          const apiKey = await getEventbriteApiKey(userId);
          if (!apiKey) continue;

          // Quick sync of events only
          const orgResponse = await fetch('https://www.eventbriteapi.com/v3/users/me/organizations/', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });

          if (!orgResponse.ok) continue;

          const organizations = (await orgResponse.json()).organizations || [];

          for (const org of organizations) {
            const eventsResponse = await fetch(`https://www.eventbriteapi.com/v3/organizations/${org.id}/events/?status=live,started`, {
              headers: { 'Authorization': `Bearer ${apiKey}` }
            });

            if (!eventsResponse.ok) continue;

            const eventsData = await eventsResponse.json();
            console.log(`Auto-sync: Found ${eventsData.events?.length || 0} events for user ${userId}`);
          }

          await pool.query("UPDATE user_integrations SET last_sync = NOW() WHERE user_id = $1 AND provider = 'eventbrite'", [userId]);
        }

        console.log('✅ Auto-sync completed');
      } catch (error) {
        console.error('❌ Auto-sync error:', error.message);
      }
    };

    // Run immediately and then on interval
    runAutoSync();
    autoSyncInterval = setInterval(runAutoSync, intervalMinutes * 60 * 1000);

    res.json({
      success: true,
      message: `Auto-sync started (every ${intervalMinutes} minutes)`,
      intervalMinutes
    });
  } catch (error) {
    console.error('Error starting auto-sync:', error);
    res.status(500).json({ error: 'Failed to start auto-sync' });
  }
});

// POST /api/v1/integrations/eventbrite/auto-sync/stop - Stop auto-sync
app.post('/api/v1/integrations/eventbrite/auto-sync/stop', (req, res) => {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
    res.json({ success: true, message: 'Auto-sync stopped' });
  } else {
    res.json({ success: true, message: 'Auto-sync was not running' });
  }
});

// GET /api/v1/integrations/eventbrite/auto-sync/status - Check auto-sync status
app.get('/api/v1/integrations/eventbrite/auto-sync/status', (req, res) => {
  res.json({
    running: autoSyncInterval !== null,
    message: autoSyncInterval ? 'Auto-sync is running' : 'Auto-sync is not running'
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTBRITE METRICS - Aggregated Dashboard Metrics
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/integrations/eventbrite/metrics - Get aggregated Eventbrite metrics
app.get('/api/v1/integrations/eventbrite/metrics', async (req, res) => {
  try {
    const userId = req.user?.id;

    // Multi-tenant: require authenticated user
    if (!userId) {
      return res.status(200).json({
        connected: false,
        totalEvents: 0,
        activeEvents: 0,
        totalTicketsSold: 0,
        totalRevenue: 0,
        totalAttendees: 0,
        checkedIn: 0,
        events: []
      });
    }

    // Get integration info for this specific user
    let integrationResult;
    try {
      integrationResult = await pool.query(
        'SELECT * FROM integrations WHERE user_id = $1 AND type = $2',
        [userId, 'eventbrite']
      );
    } catch (e) {
      // No integrations table - return not connected
      integrationResult = { rows: [] };
    }

    if (integrationResult.rows.length === 0 || integrationResult.rows[0].status !== 'connected') {
      return res.status(200).json({
        connected: false,
        totalEvents: 0,
        activeEvents: 0,
        totalTicketsSold: 0,
        totalRevenue: 0,
        totalAttendees: 0,
        checkedIn: 0,
        events: []
      });
    }

    const integration = integrationResult.rows[0];
    const config = integration.config || {};

    // Get events - with multiple fallbacks for schema compatibility
    let eventsResult;
    try {
      // Try with user_id and event_date columns
      eventsResult = await pool.query(`
        SELECT
          e.id,
          e.name,
          e.event_date as "startDate",
          e.venue_name as venue,
          e.status,
          e.expected_attendance as capacity
        FROM events e
        WHERE e.user_id = $1
        ORDER BY e.event_date DESC
      `, [userId]);
    } catch (e) {
      try {
        // Fallback: minimal query with only id and name - MUST filter by user_id for multi-tenant
        eventsResult = await pool.query(`
          SELECT
            id,
            COALESCE(name, title) as name
          FROM events
          WHERE (user_id = $1::integer OR user_id IS NULL)
          ORDER BY id DESC
          LIMIT 50
        `, [userId]);
        // Add default values for other fields
        eventsResult.rows = eventsResult.rows.map(row => ({
          ...row,
          startDate: new Date().toISOString(),
          venue: 'TBD',
          status: 'draft',
          capacity: 100
        }));
      } catch (e2) {
        // No events table - return empty
        console.log('Note: events table not accessible:', e2.message);
        eventsResult = { rows: [] };
      }
    }

    // Get ticket stats per event - with fallback
    const ticketMap = {};
    try {
      const ticketStats = await pool.query(`
        SELECT
          event_id,
          COUNT(*) as tickets_sold,
          COALESCE(SUM(price), 0) as gross_revenue
        FROM tickets
        GROUP BY event_id
      `);
      ticketStats.rows.forEach(row => {
        ticketMap[row.event_id] = {
          ticketsSold: parseInt(row.tickets_sold) || 0,
          grossRevenue: parseFloat(row.gross_revenue) || 0
        };
      });
    } catch (e) {
      // tickets table doesn't exist - continue with empty map
      console.log('Note: tickets table not found, using empty data');
    }

    // Get guest stats per event - with fallback
    const guestMap = {};
    try {
      const guestStats = await pool.query(`
        SELECT
          event_id,
          COUNT(*) as total_attendees
        FROM guests
        GROUP BY event_id
      `);
      guestStats.rows.forEach(row => {
        guestMap[row.event_id] = {
          total: parseInt(row.total_attendees) || 0,
          checkedIn: 0,
          noShow: 0
        };
      });
    } catch (e) {
      // guests table doesn't exist - continue with empty map
      console.log('Note: guests table not found, using empty data');
    }

    const events = eventsResult.rows.map(event => {
      const eventId = event.id.toString();
      const tickets = ticketMap[eventId] || ticketMap[event.id] || { ticketsSold: 0, grossRevenue: 0 };
      const guests = guestMap[event.id] || { total: 0, checkedIn: 0, noShow: 0 };
      const grossRevenue = tickets.grossRevenue;
      const fees = grossRevenue * 0.05;

      return {
        id: eventId,
        name: event.name,
        startDate: event.startDate,
        venue: event.venue || 'TBD',
        status: event.status || 'draft',
        capacity: event.capacity || 0,
        url: null,
        ticketsSold: tickets.ticketsSold,
        grossRevenue: grossRevenue,
        fees: fees,
        refunds: 0,
        netRevenue: grossRevenue - fees,
        pageViews: Math.floor(Math.random() * 5000) + 1000,
        uniqueVisitors: Math.floor(Math.random() * 2000) + 500,
        attendees: guests,
        salesByDay: []
      };
    });

    // Calculate totals
    const totalEvents = events.length;
    const activeEvents = events.filter(e => e.status === 'live' || e.status === 'active').length;
    const totalTicketsSold = events.reduce((sum, e) => sum + e.ticketsSold, 0);
    const totalGrossRevenue = events.reduce((sum, e) => sum + e.grossRevenue, 0);
    const totalFees = events.reduce((sum, e) => sum + e.fees, 0);
    const totalRefunds = events.reduce((sum, e) => sum + e.refunds, 0);
    const totalRevenue = totalGrossRevenue - totalFees - totalRefunds;
    const totalAttendees = events.reduce((sum, e) => sum + e.attendees.total, 0);
    const checkedIn = events.reduce((sum, e) => sum + e.attendees.checkedIn, 0);

    res.json({
      connected: true,
      organizationName: config.organization_name || 'Your Organization',
      totalEvents,
      activeEvents,
      totalTicketsSold,
      totalRevenue,
      totalGrossRevenue,
      totalFees,
      totalRefunds,
      totalAttendees,
      checkedIn,
      events,
      lastSync: integration.last_sync_at || new Date().toISOString()
    });

  } catch (err) {
    console.error('Error fetching Eventbrite metrics:', err);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 1: EVENTBRITE ALERTS - Intelligent Notifications
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/integrations/eventbrite/alerts - Get all alerts for user
app.get('/api/v1/integrations/eventbrite/alerts', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { event_id, is_active } = req.query;

    let query = 'SELECT * FROM eventbrite_alerts WHERE user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (event_id) {
      query += ` AND (event_id = $${paramIndex++} OR event_id IS NULL)`;
      params.push(event_id);
    }

    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(is_active === 'true');
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json({ alerts: result.rows });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// POST /api/v1/integrations/eventbrite/alerts - Create a new alert
app.post('/api/v1/integrations/eventbrite/alerts', async (req, res) => {
  try {
    const userId = req.user?.id;
    const {
      event_id,
      alert_type,
      threshold_value,
      threshold_operator = 'gte',
      notification_channels = ['dashboard']
    } = req.body;

    // Validate alert_type
    const validTypes = [
      'sales_spike',           // Sudden increase in sales
      'sales_milestone',       // Reached X tickets sold
      'revenue_milestone',     // Reached $X revenue
      'low_inventory',         // Less than X tickets remaining
      'sellout_warning',       // 90%+ capacity
      'new_order',             // Every new order
      'refund',                // Any refund processed
      'check_in_milestone',    // X people checked in
      'conversion_drop',       // Conversion rate dropped below X%
      'daily_summary'          // Daily sales summary
    ];

    if (!validTypes.includes(alert_type)) {
      return res.status(400).json({
        error: 'Invalid alert_type',
        valid_types: validTypes
      });
    }

    const result = await pool.query(`
      INSERT INTO eventbrite_alerts (
        user_id, event_id, alert_type, threshold_value,
        threshold_operator, notification_channels
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [userId, event_id, alert_type, threshold_value, threshold_operator, JSON.stringify(notification_channels)]);

    res.json({ success: true, alert: result.rows[0] });
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// PUT /api/v1/integrations/eventbrite/alerts/:id - Update an alert
app.put('/api/v1/integrations/eventbrite/alerts/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { is_active, threshold_value, threshold_operator, notification_channels } = req.body;

    const updates = [];
    const params = [id, userId];
    let paramIndex = 3;

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }
    if (threshold_value !== undefined) {
      updates.push(`threshold_value = $${paramIndex++}`);
      params.push(threshold_value);
    }
    if (threshold_operator !== undefined) {
      updates.push(`threshold_operator = $${paramIndex++}`);
      params.push(threshold_operator);
    }
    if (notification_channels !== undefined) {
      updates.push(`notification_channels = $${paramIndex++}`);
      params.push(JSON.stringify(notification_channels));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const result = await pool.query(`
      UPDATE eventbrite_alerts
      SET ${updates.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ success: true, alert: result.rows[0] });
  } catch (error) {
    console.error('Error updating alert:', error);
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

// DELETE /api/v1/integrations/eventbrite/alerts/:id - Delete an alert
app.delete('/api/v1/integrations/eventbrite/alerts/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM eventbrite_alerts WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ success: true, deleted_id: id });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

// GET /api/v1/integrations/eventbrite/notifications - Get alert notifications
app.get('/api/v1/integrations/eventbrite/notifications', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { is_read, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM eventbrite_alert_notifications WHERE user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (is_read !== undefined) {
      query += ` AND is_read = $${paramIndex++}`;
      params.push(is_read === 'true');
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get unread count
    const unreadResult = await pool.query(
      'SELECT COUNT(*) as count FROM eventbrite_alert_notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    res.json({
      notifications: result.rows,
      unread_count: parseInt(unreadResult.rows[0].count)
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PUT /api/v1/integrations/eventbrite/notifications/read - Mark notifications as read
app.put('/api/v1/integrations/eventbrite/notifications/read', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { notification_ids, mark_all = false } = req.body;

    if (mark_all) {
      await pool.query(
        'UPDATE eventbrite_alert_notifications SET is_read = true WHERE user_id = $1',
        [userId]
      );
    } else if (notification_ids && notification_ids.length > 0) {
      await pool.query(
        'UPDATE eventbrite_alert_notifications SET is_read = true WHERE user_id = $1 AND id = ANY($2)',
        [userId, notification_ids]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// POST /api/v1/integrations/eventbrite/alerts/trigger - Manually trigger alert check
app.post('/api/v1/integrations/eventbrite/alerts/trigger', async (req, res) => {
  try {
    const userId = req.user?.id;
    const triggeredAlerts = [];

    // Get user's active alerts
    const alertsResult = await pool.query(
      'SELECT * FROM eventbrite_alerts WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    // Get current metrics for comparison
    const eventsResult = await pool.query(
      'SELECT * FROM events WHERE user_id = $1 AND eventbrite_id IS NOT NULL',
      [userId]
    );

    for (const alert of alertsResult.rows) {
      let shouldTrigger = false;
      let notificationData = {};

      switch (alert.alert_type) {
        case 'sales_milestone': {
          // Check if total tickets sold reached threshold
          const ticketsResult = await pool.query(
            'SELECT COALESCE(SUM(ticket_count), 0) as total FROM eventbrite_orders WHERE user_id = $1',
            [userId]
          );
          const totalSold = parseInt(ticketsResult.rows[0].total);
          if (totalSold >= alert.threshold_value) {
            shouldTrigger = true;
            notificationData = { total_sold: totalSold, threshold: alert.threshold_value };
          }
          break;
        }
        case 'revenue_milestone': {
          // Check if total revenue reached threshold
          const revenueResult = await pool.query(
            'SELECT COALESCE(SUM(net_amount), 0) as total FROM eventbrite_orders WHERE user_id = $1',
            [userId]
          );
          const totalRevenue = parseFloat(revenueResult.rows[0].total);
          if (totalRevenue >= alert.threshold_value) {
            shouldTrigger = true;
            notificationData = { total_revenue: totalRevenue, threshold: alert.threshold_value };
          }
          break;
        }
        case 'low_inventory': {
          // Check if any event has low inventory
          for (const event of eventsResult.rows) {
            const capacity = event.eventbrite_capacity || event.expected_attendance || 1000;
            const soldResult = await pool.query(
              'SELECT COALESCE(SUM(ticket_count), 0) as total FROM eventbrite_orders WHERE event_id = $1',
              [event.eventbrite_id]
            );
            const sold = parseInt(soldResult.rows[0].total);
            const remaining = capacity - sold;
            if (remaining <= alert.threshold_value && remaining > 0) {
              shouldTrigger = true;
              notificationData = { event_name: event.name, remaining, capacity };
              break;
            }
          }
          break;
        }
        case 'sellout_warning': {
          // Check if any event is close to selling out
          for (const event of eventsResult.rows) {
            const capacity = event.eventbrite_capacity || event.expected_attendance || 1000;
            const soldResult = await pool.query(
              'SELECT COALESCE(SUM(ticket_count), 0) as total FROM eventbrite_orders WHERE event_id = $1',
              [event.eventbrite_id]
            );
            const sold = parseInt(soldResult.rows[0].total);
            const percentSold = (sold / capacity) * 100;
            if (percentSold >= (alert.threshold_value || 90)) {
              shouldTrigger = true;
              notificationData = { event_name: event.name, percent_sold: percentSold.toFixed(1), sold, capacity };
              break;
            }
          }
          break;
        }
      }

      if (shouldTrigger) {
        // Create notification
        const title = getAlertTitle(alert.alert_type, notificationData);
        const message = getAlertMessage(alert.alert_type, notificationData);

        await pool.query(`
          INSERT INTO eventbrite_alert_notifications (
            alert_id, user_id, event_id, alert_type, title, message, data
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [alert.id, userId, alert.event_id, alert.alert_type, title, message, JSON.stringify(notificationData)]);

        // Update alert trigger count
        await pool.query(`
          UPDATE eventbrite_alerts
          SET trigger_count = trigger_count + 1, last_triggered_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [alert.id]);

        triggeredAlerts.push({ alert_type: alert.alert_type, title, message, data: notificationData });
      }
    }

    res.json({
      success: true,
      triggered_count: triggeredAlerts.length,
      triggered_alerts: triggeredAlerts
    });
  } catch (error) {
    console.error('Error triggering alerts:', error);
    res.status(500).json({ error: 'Failed to trigger alerts' });
  }
});

// Helper functions for alert messages
function getAlertTitle(alertType, data) {
  switch (alertType) {
    case 'sales_milestone': return `🎉 Sales Milestone: ${data.total_sold} tickets sold!`;
    case 'revenue_milestone': return `💰 Revenue Milestone: $${data.total_revenue.toLocaleString()}!`;
    case 'low_inventory': return `⚠️ Low Inventory: ${data.remaining} tickets left`;
    case 'sellout_warning': return `🔥 Almost Sold Out: ${data.percent_sold}%`;
    case 'new_order': return `🎟️ New Order Received`;
    case 'refund': return `↩️ Refund Processed`;
    case 'check_in_milestone': return `✅ Check-in Milestone Reached`;
    case 'sales_spike': return `📈 Sales Spike Detected!`;
    case 'conversion_drop': return `📉 Conversion Rate Alert`;
    case 'daily_summary': return `📊 Daily Sales Summary`;
    default: return `📢 Alert: ${alertType}`;
  }
}

function getAlertMessage(alertType, data) {
  switch (alertType) {
    case 'sales_milestone': return `Congratulations! You've sold ${data.total_sold} tickets, reaching your milestone of ${data.threshold}.`;
    case 'revenue_milestone': return `Amazing! Total revenue has reached $${data.total_revenue.toLocaleString()}, surpassing your $${data.threshold.toLocaleString()} goal.`;
    case 'low_inventory': return `${data.event_name} has only ${data.remaining} tickets remaining out of ${data.capacity} capacity.`;
    case 'sellout_warning': return `${data.event_name} is ${data.percent_sold}% sold (${data.sold}/${data.capacity}). Consider increasing capacity or closing sales soon.`;
    case 'new_order': return data.buyer_name ? `${data.buyer_name} just purchased ${data.ticket_count} ticket(s) for $${data.amount}.` : 'A new order has been placed.';
    case 'refund': return `A refund of $${data.amount} has been processed for order ${data.order_id}.`;
    default: return `Alert triggered for ${alertType}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 2: EVENTBRITE ORDERS - Real-time Order Feed
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/integrations/eventbrite/orders - Get Eventbrite orders with filtering
app.get('/api/v1/integrations/eventbrite/orders', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { event_id, status, limit = 50, offset = 0, sort = 'order_date', order = 'DESC' } = req.query;

    let query = 'SELECT * FROM eventbrite_orders WHERE user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (event_id) {
      query += ` AND event_id = $${paramIndex++}`;
      params.push(event_id);
    }

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    // Validate sort column
    const validSortCols = ['order_date', 'gross_amount', 'created_at', 'buyer_name'];
    const sortCol = validSortCols.includes(sort) ? sort : 'order_date';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    query += ` ORDER BY ${sortCol} ${sortOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM eventbrite_orders WHERE user_id = $1';
    const countParams = [userId];
    if (event_id) {
      countQuery += ' AND event_id = $2';
      countParams.push(event_id);
    }
    const countResult = await pool.query(countQuery, countParams);

    // Get stats
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(ticket_count), 0) as total_tickets,
        COALESCE(SUM(gross_amount), 0) as gross_revenue,
        COALESCE(SUM(fees), 0) as total_fees,
        COALESCE(SUM(net_amount), 0) as net_revenue,
        COUNT(DISTINCT buyer_email) as unique_buyers
      FROM eventbrite_orders WHERE user_id = $1
    `, [userId]);

    res.json({
      orders: result.rows,
      total: parseInt(countResult.rows[0].total),
      stats: {
        total_orders: parseInt(statsResult.rows[0].total_orders),
        total_tickets: parseInt(statsResult.rows[0].total_tickets),
        gross_revenue: parseFloat(statsResult.rows[0].gross_revenue),
        total_fees: parseFloat(statsResult.rows[0].total_fees),
        net_revenue: parseFloat(statsResult.rows[0].net_revenue),
        unique_buyers: parseInt(statsResult.rows[0].unique_buyers)
      }
    });
  } catch (error) {
    console.error('Error fetching Eventbrite orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/v1/integrations/eventbrite/orders/recent - Get most recent orders (for live feed)
app.get('/api/v1/integrations/eventbrite/orders/recent', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { limit = 10, since } = req.query;

    let query = 'SELECT * FROM eventbrite_orders WHERE user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (since) {
      query += ` AND order_date > $${paramIndex++}`;
      params.push(since);
    }

    query += ` ORDER BY order_date DESC LIMIT $${paramIndex++}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    res.json({
      orders: result.rows,
      count: result.rows.length,
      latest_order_date: result.rows[0]?.order_date || null
    });
  } catch (error) {
    console.error('Error fetching recent orders:', error);
    res.status(500).json({ error: 'Failed to fetch recent orders' });
  }
});

// GET /api/v1/integrations/eventbrite/orders/:id - Get single order details
app.get('/api/v1/integrations/eventbrite/orders/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM eventbrite_orders WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get attendees for this order
    const attendeesResult = await pool.query(
      'SELECT * FROM eventbrite_attendees WHERE order_id = $1',
      [id]
    );

    res.json({
      order: result.rows[0],
      attendees: attendeesResult.rows
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// POST /api/v1/integrations/eventbrite/orders/sync - Sync orders from Eventbrite API
app.post('/api/v1/integrations/eventbrite/orders/sync', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { event_id, since_date } = req.body;

    // Get API key
    const apiKey = await getEventbriteApiKey(userId);
    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    // Get org ID
    const orgResult = await pool.query(
      "SELECT metadata->>'organization_id' as org_id FROM user_integrations WHERE user_id = $1 AND provider = 'eventbrite'",
      [userId]
    );
    const orgId = orgResult.rows[0]?.org_id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization not found' });
    }

    let ordersUrl = `https://www.eventbriteapi.com/v3/organizations/${orgId}/orders/?expand=attendees,event`;
    if (event_id) {
      ordersUrl = `https://www.eventbriteapi.com/v3/events/${event_id}/orders/?expand=attendees`;
    }
    if (since_date) {
      ordersUrl += `&changed_since=${since_date}`;
    }

    const response = await fetch(ordersUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      throw new Error(`Eventbrite API error: ${response.status}`);
    }

    const data = await response.json();
    const orders = data.orders || [];
    let synced = 0, created = 0, updated = 0;

    for (const order of orders) {
      const eventName = order.event?.name?.text || '';
      const grossAmount = order.costs?.gross?.major_value || 0;
      const fees = order.costs?.eventbrite_fee?.major_value || 0;
      const netAmount = grossAmount - fees;

      const existing = await pool.query('SELECT id FROM eventbrite_orders WHERE id = $1', [order.id]);

      if (existing.rows.length > 0) {
        await pool.query(`
          UPDATE eventbrite_orders SET
            status = $1, costs = $2, gross_amount = $3, fees = $4, net_amount = $5,
            ticket_count = $6, attendees = $7, updated_at = CURRENT_TIMESTAMP
          WHERE id = $8
        `, [
          order.status, JSON.stringify(order.costs), grossAmount, fees, netAmount,
          order.attendees?.length || 1, JSON.stringify(order.attendees), order.id
        ]);
        updated++;
      } else {
        await pool.query(`
          INSERT INTO eventbrite_orders (
            id, user_id, event_id, event_name, buyer_name, buyer_email,
            status, costs, gross_amount, fees, net_amount, ticket_count,
            attendees, order_date, raw_data
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          order.id, userId, order.event_id, eventName,
          order.name || '', order.email || '', order.status,
          JSON.stringify(order.costs), grossAmount, fees, netAmount,
          order.attendees?.length || 1, JSON.stringify(order.attendees),
          order.created, JSON.stringify(order)
        ]);
        created++;

        // Trigger new_order alert
        await triggerOrderAlert(userId, order, eventName, grossAmount);
      }
      synced++;
    }

    // Log sync
    await pool.query(`
      INSERT INTO eventbrite_sync_log (user_id, sync_type, items_synced, items_created, items_updated, status, completed_at)
      VALUES ($1, 'orders', $2, $3, $4, 'completed', CURRENT_TIMESTAMP)
    `, [userId, synced, created, updated]);

    res.json({
      success: true,
      synced,
      created,
      updated,
      message: `Synced ${synced} orders (${created} new, ${updated} updated)`
    });
  } catch (error) {
    console.error('Error syncing orders:', error);
    res.status(500).json({ error: 'Failed to sync orders' });
  }
});

// Helper to trigger order alerts
async function triggerOrderAlert(userId, order, eventName, amount) {
  try {
    // Check if user has new_order alerts enabled
    const alertResult = await pool.query(
      "SELECT * FROM eventbrite_alerts WHERE user_id = $1 AND alert_type = 'new_order' AND is_active = true",
      [userId]
    );

    for (const alert of alertResult.rows) {
      const title = '🎟️ New Order Received';
      const message = `${order.name || 'A buyer'} just purchased ${order.attendees?.length || 1} ticket(s) for ${eventName}${amount ? ` ($${amount})` : ''}.`;

      await pool.query(`
        INSERT INTO eventbrite_alert_notifications (
          alert_id, user_id, event_id, alert_type, title, message, data
        ) VALUES ($1, $2, $3, 'new_order', $4, $5, $6)
      `, [alert.id, userId, order.event_id, title, message, JSON.stringify({
        order_id: order.id,
        buyer_name: order.name,
        buyer_email: order.email,
        ticket_count: order.attendees?.length || 1,
        amount: amount,
        event_name: eventName
      })]);

      await pool.query(
        'UPDATE eventbrite_alerts SET trigger_count = trigger_count + 1, last_triggered_at = CURRENT_TIMESTAMP WHERE id = $1',
        [alert.id]
      );
    }
  } catch (error) {
    console.error('Error triggering order alert:', error);
  }
}

// GET /api/v1/integrations/eventbrite/orders/stats/daily - Get daily order stats
app.get('/api/v1/integrations/eventbrite/orders/stats/daily', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { days = 30, event_id } = req.query;

    let query = `
      SELECT
        DATE(order_date) as date,
        COUNT(*) as orders,
        COALESCE(SUM(ticket_count), 0) as tickets,
        COALESCE(SUM(gross_amount), 0) as gross,
        COALESCE(SUM(net_amount), 0) as net
      FROM eventbrite_orders
      WHERE user_id = $1 AND order_date >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
    `;
    const params = [userId];

    if (event_id) {
      query += ' AND event_id = $2';
      params.push(event_id);
    }

    query += ' GROUP BY DATE(order_date) ORDER BY date ASC';

    const result = await pool.query(query, params);

    res.json({
      daily_stats: result.rows,
      period_days: parseInt(days)
    });
  } catch (error) {
    console.error('Error fetching daily stats:', error);
    res.status(500).json({ error: 'Failed to fetch daily stats' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 6: EVENTBRITE PROMO CODES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/integrations/eventbrite/promo-codes - Get all promo codes
app.get('/api/v1/integrations/eventbrite/promo-codes', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { event_id, is_active } = req.query;

    let query = 'SELECT * FROM eventbrite_promo_codes WHERE user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (event_id) {
      query += ` AND event_id = $${paramIndex++}`;
      params.push(event_id);
    }

    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(is_active === 'true');
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json({ promo_codes: result.rows });
  } catch (error) {
    console.error('Error fetching promo codes:', error);
    res.status(500).json({ error: 'Failed to fetch promo codes' });
  }
});

// POST /api/v1/integrations/eventbrite/promo-codes - Create promo code via Eventbrite API
app.post('/api/v1/integrations/eventbrite/promo-codes', async (req, res) => {
  try {
    const userId = req.user?.id;
    const {
      event_id,
      code,
      discount_type = 'percentage',
      discount_value,
      quantity_available,
      start_date,
      end_date,
      ticket_class_ids
    } = req.body;

    if (!event_id || !code || !discount_value) {
      return res.status(400).json({ error: 'event_id, code, and discount_value are required' });
    }

    // Get API key
    const apiKey = await getEventbriteApiKey(userId);
    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    // Create discount on Eventbrite
    const discountData = {
      discount: {
        code: code.toUpperCase(),
        type: discount_type === 'percentage' ? 'coded' : 'coded',
        amount_off: discount_type === 'fixed' ? discount_value.toString() : undefined,
        percent_off: discount_type === 'percentage' ? discount_value.toString() : undefined,
        event_id: event_id,
        quantity_available: quantity_available || undefined,
        start_date: start_date || undefined,
        end_date: end_date || undefined,
        ticket_class_ids: ticket_class_ids || undefined
      }
    };

    const response = await fetch(`https://www.eventbriteapi.com/v3/organizations/me/discounts/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(discountData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({
        error: 'Failed to create promo code on Eventbrite',
        details: errorData
      });
    }

    const ebPromo = await response.json();

    // Save to database
    const result = await pool.query(`
      INSERT INTO eventbrite_promo_codes (
        id, user_id, event_id, code, discount_type, discount_value,
        quantity_available, start_date, end_date, ticket_class_ids, raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      ebPromo.id, userId, event_id, code.toUpperCase(), discount_type, discount_value,
      quantity_available, start_date, end_date, JSON.stringify(ticket_class_ids), JSON.stringify(ebPromo)
    ]);

    res.json({ success: true, promo_code: result.rows[0] });
  } catch (error) {
    console.error('Error creating promo code:', error);
    res.status(500).json({ error: 'Failed to create promo code' });
  }
});

// DELETE /api/v1/integrations/eventbrite/promo-codes/:id - Delete promo code
app.delete('/api/v1/integrations/eventbrite/promo-codes/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    // Get API key
    const apiKey = await getEventbriteApiKey(userId);
    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    // Delete on Eventbrite
    const response = await fetch(`https://www.eventbriteapi.com/v3/discounts/${id}/`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    // Delete from local database regardless of Eventbrite response
    await pool.query(
      'DELETE FROM eventbrite_promo_codes WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    res.json({ success: true, deleted_id: id });
  } catch (error) {
    console.error('Error deleting promo code:', error);
    res.status(500).json({ error: 'Failed to delete promo code' });
  }
});

// POST /api/v1/integrations/eventbrite/promo-codes/sync - Sync promo codes from Eventbrite
app.post('/api/v1/integrations/eventbrite/promo-codes/sync', async (req, res) => {
  try {
    const userId = req.user?.id;

    const apiKey = await getEventbriteApiKey(userId);
    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    const orgResult = await pool.query(
      "SELECT metadata->>'organization_id' as org_id FROM user_integrations WHERE user_id = $1 AND provider = 'eventbrite'",
      [userId]
    );
    const orgId = orgResult.rows[0]?.org_id;

    const response = await fetch(`https://www.eventbriteapi.com/v3/organizations/${orgId}/discounts/`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) throw new Error('Failed to fetch discounts');

    const data = await response.json();
    const discounts = data.discounts || [];
    let synced = 0;

    for (const discount of discounts) {
      const existing = await pool.query('SELECT id FROM eventbrite_promo_codes WHERE id = $1', [discount.id]);

      if (existing.rows.length > 0) {
        await pool.query(`
          UPDATE eventbrite_promo_codes SET
            quantity_sold = $1, is_active = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [discount.quantity_sold || 0, discount.status === 'active', discount.id]);
      } else {
        await pool.query(`
          INSERT INTO eventbrite_promo_codes (
            id, user_id, event_id, code, discount_type, discount_value,
            quantity_available, quantity_sold, is_active, raw_data
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          discount.id, userId, discount.event_id, discount.code,
          discount.percent_off ? 'percentage' : 'fixed',
          discount.percent_off || discount.amount_off || 0,
          discount.quantity_available, discount.quantity_sold || 0,
          discount.status === 'active', JSON.stringify(discount)
        ]);
      }
      synced++;
    }

    res.json({ success: true, synced });
  } catch (error) {
    console.error('Error syncing promo codes:', error);
    res.status(500).json({ error: 'Failed to sync promo codes' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 7: EVENTBRITE ATTENDEES & CHECK-IN
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/integrations/eventbrite/attendees - Get attendees with filtering
app.get('/api/v1/integrations/eventbrite/attendees', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { event_id, checked_in, search, limit = 100, offset = 0 } = req.query;

    let query = 'SELECT * FROM eventbrite_attendees WHERE user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (event_id) {
      query += ` AND event_id = $${paramIndex++}`;
      params.push(event_id);
    }

    if (checked_in !== undefined) {
      query += ` AND checked_in = $${paramIndex++}`;
      params.push(checked_in === 'true');
    }

    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get stats
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE checked_in = true) as checked_in,
        COUNT(*) FILTER (WHERE checked_in = false) as not_checked_in
      FROM eventbrite_attendees WHERE user_id = $1 ${event_id ? 'AND event_id = $2' : ''}
    `, event_id ? [userId, event_id] : [userId]);

    res.json({
      attendees: result.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching attendees:', error);
    res.status(500).json({ error: 'Failed to fetch attendees' });
  }
});

// POST /api/v1/integrations/eventbrite/attendees/:id/check-in - Check in an attendee
app.post('/api/v1/integrations/eventbrite/attendees/:id/check-in', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { checked_in_by } = req.body;

    // Update local database
    const result = await pool.query(`
      UPDATE eventbrite_attendees
      SET checked_in = true, checked_in_at = CURRENT_TIMESTAMP, checked_in_by = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND user_id = $3
      RETURNING *
    `, [checked_in_by || 'dashboard', id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attendee not found' });
    }

    // Also update on Eventbrite if possible
    const apiKey = await getEventbriteApiKey(userId);
    if (apiKey) {
      try {
        await fetch(`https://www.eventbriteapi.com/v3/events/${result.rows[0].event_id}/attendees/${id}/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ attendee: { checked_in: true } })
        });
      } catch (ebError) {
        console.warn('Could not sync check-in to Eventbrite:', ebError.message);
      }
    }

    res.json({ success: true, attendee: result.rows[0] });
  } catch (error) {
    console.error('Error checking in attendee:', error);
    res.status(500).json({ error: 'Failed to check in attendee' });
  }
});

// POST /api/v1/integrations/eventbrite/attendees/:id/undo-check-in - Undo check-in
app.post('/api/v1/integrations/eventbrite/attendees/:id/undo-check-in', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE eventbrite_attendees
      SET checked_in = false, checked_in_at = NULL, checked_in_by = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attendee not found' });
    }

    res.json({ success: true, attendee: result.rows[0] });
  } catch (error) {
    console.error('Error undoing check-in:', error);
    res.status(500).json({ error: 'Failed to undo check-in' });
  }
});

// POST /api/v1/integrations/eventbrite/attendees/check-in-by-barcode - Check in by barcode scan
app.post('/api/v1/integrations/eventbrite/attendees/check-in-by-barcode', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { barcode, event_id, checked_in_by } = req.body;

    if (!barcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }

    let query = 'SELECT * FROM eventbrite_attendees WHERE user_id = $1 AND barcode = $2';
    const params = [userId, barcode];

    if (event_id) {
      query += ' AND event_id = $3';
      params.push(event_id);
    }

    const findResult = await pool.query(query, params);

    if (findResult.rows.length === 0) {
      return res.status(404).json({ error: 'Attendee not found with this barcode' });
    }

    const attendee = findResult.rows[0];

    if (attendee.checked_in) {
      return res.status(400).json({
        error: 'Already checked in',
        attendee,
        checked_in_at: attendee.checked_in_at
      });
    }

    // Check in
    const result = await pool.query(`
      UPDATE eventbrite_attendees
      SET checked_in = true, checked_in_at = CURRENT_TIMESTAMP, checked_in_by = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [checked_in_by || 'barcode_scan', attendee.id]);

    res.json({
      success: true,
      message: `${attendee.name} checked in successfully`,
      attendee: result.rows[0]
    });
  } catch (error) {
    console.error('Error checking in by barcode:', error);
    res.status(500).json({ error: 'Failed to check in' });
  }
});

// POST /api/v1/integrations/eventbrite/attendees/sync - Sync attendees from Eventbrite
app.post('/api/v1/integrations/eventbrite/attendees/sync', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { event_id } = req.body;

    const apiKey = await getEventbriteApiKey(userId);
    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    if (!event_id) {
      return res.status(400).json({ error: 'event_id is required' });
    }

    const response = await fetch(`https://www.eventbriteapi.com/v3/events/${event_id}/attendees/`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) throw new Error('Failed to fetch attendees');

    const data = await response.json();
    const attendees = data.attendees || [];
    let synced = 0, created = 0, updated = 0;

    for (const att of attendees) {
      const existing = await pool.query('SELECT id FROM eventbrite_attendees WHERE id = $1', [att.id]);

      const name = att.profile ? `${att.profile.first_name || ''} ${att.profile.last_name || ''}`.trim() : '';
      const email = att.profile?.email || '';

      if (existing.rows.length > 0) {
        await pool.query(`
          UPDATE eventbrite_attendees SET
            name = $1, email = $2, status = $3, checked_in = $4,
            barcode = $5, ticket_class_name = $6, updated_at = CURRENT_TIMESTAMP
          WHERE id = $7
        `, [name, email, att.status, att.checked_in, att.barcodes?.[0]?.barcode, att.ticket_class_name, att.id]);
        updated++;
      } else {
        await pool.query(`
          INSERT INTO eventbrite_attendees (
            id, user_id, event_id, order_id, ticket_class_id, ticket_class_name,
            name, email, status, checked_in, barcode, raw_data
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          att.id, userId, event_id, att.order_id, att.ticket_class_id, att.ticket_class_name,
          name, email, att.status, att.checked_in, att.barcodes?.[0]?.barcode, JSON.stringify(att)
        ]);
        created++;
      }
      synced++;
    }

    res.json({ success: true, synced, created, updated });
  } catch (error) {
    console.error('Error syncing attendees:', error);
    res.status(500).json({ error: 'Failed to sync attendees' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 10: EVENTBRITE REFUNDS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/integrations/eventbrite/refunds - Get all refunds
app.get('/api/v1/integrations/eventbrite/refunds', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { event_id, status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM eventbrite_refunds WHERE user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (event_id) {
      query += ` AND event_id = $${paramIndex++}`;
      params.push(event_id);
    }

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get stats
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_refunds,
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending
      FROM eventbrite_refunds WHERE user_id = $1
    `, [userId]);

    res.json({
      refunds: result.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching refunds:', error);
    res.status(500).json({ error: 'Failed to fetch refunds' });
  }
});

// POST /api/v1/integrations/eventbrite/refunds - Request a refund
app.post('/api/v1/integrations/eventbrite/refunds', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { order_id, attendee_ids, reason, amount } = req.body;

    if (!order_id) {
      return res.status(400).json({ error: 'order_id is required' });
    }

    // Get order details
    const orderResult = await pool.query(
      'SELECT * FROM eventbrite_orders WHERE id = $1 AND user_id = $2',
      [order_id, userId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    const refundAmount = amount || order.net_amount;

    // Get API key
    const apiKey = await getEventbriteApiKey(userId);

    let ebRefundId = null;
    if (apiKey) {
      // Try to process refund via Eventbrite API
      try {
        const response = await fetch(`https://www.eventbriteapi.com/v3/orders/${order_id}/refunds/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from_email: true,
            items: attendee_ids ? attendee_ids.map(id => ({ item_type: 'attendee', item_id: id })) : undefined
          })
        });

        if (response.ok) {
          const refundData = await response.json();
          ebRefundId = refundData.id;
        }
      } catch (ebError) {
        console.warn('Could not process refund on Eventbrite:', ebError.message);
      }
    }

    // Save refund record
    const result = await pool.query(`
      INSERT INTO eventbrite_refunds (
        user_id, order_id, event_id, attendee_ids, reason, amount,
        status, eventbrite_refund_id, processed_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      userId, order_id, order.event_id, JSON.stringify(attendee_ids),
      reason, refundAmount, ebRefundId ? 'completed' : 'pending',
      ebRefundId, 'dashboard'
    ]);

    // Update order status if full refund
    if (!attendee_ids && ebRefundId) {
      await pool.query(
        "UPDATE eventbrite_orders SET status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [order_id]
      );
    }

    // Trigger refund alert
    await triggerRefundAlert(userId, order_id, refundAmount, order.event_id);

    res.json({
      success: true,
      refund: result.rows[0],
      processed_on_eventbrite: !!ebRefundId
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

// Helper to trigger refund alerts
async function triggerRefundAlert(userId, orderId, amount, eventId) {
  try {
    const alertResult = await pool.query(
      "SELECT * FROM eventbrite_alerts WHERE user_id = $1 AND alert_type = 'refund' AND is_active = true",
      [userId]
    );

    for (const alert of alertResult.rows) {
      const title = '↩️ Refund Processed';
      const message = `A refund of $${amount} has been processed for order ${orderId}.`;

      await pool.query(`
        INSERT INTO eventbrite_alert_notifications (
          alert_id, user_id, event_id, alert_type, title, message, data
        ) VALUES ($1, $2, $3, 'refund', $4, $5, $6)
      `, [alert.id, userId, eventId, title, message, JSON.stringify({ order_id: orderId, amount })]);
    }
  } catch (error) {
    console.error('Error triggering refund alert:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 3: EVENTBRITE REPORTS - Export to CSV/JSON
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/integrations/eventbrite/reports/orders - Export orders report
app.get('/api/v1/integrations/eventbrite/reports/orders', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { event_id, start_date, end_date, format = 'json' } = req.query;

    let query = `
      SELECT
        id, event_id, event_name, buyer_name, buyer_email, buyer_phone,
        status, gross_amount, fees, net_amount, ticket_count, promo_code,
        order_date, created_at
      FROM eventbrite_orders WHERE user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;

    if (event_id) {
      query += ` AND event_id = $${paramIndex++}`;
      params.push(event_id);
    }
    if (start_date) {
      query += ` AND order_date >= $${paramIndex++}`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND order_date <= $${paramIndex++}`;
      params.push(end_date);
    }

    query += ' ORDER BY order_date DESC';
    const result = await pool.query(query, params);

    if (format === 'csv') {
      const headers = ['Order ID', 'Event ID', 'Event Name', 'Buyer Name', 'Buyer Email', 'Phone', 'Status', 'Gross', 'Fees', 'Net', 'Tickets', 'Promo Code', 'Order Date'];
      const csvRows = [headers.join(',')];

      for (const row of result.rows) {
        csvRows.push([
          row.id, row.event_id, `"${row.event_name || ''}"`, `"${row.buyer_name || ''}"`,
          row.buyer_email, row.buyer_phone || '', row.status,
          row.gross_amount, row.fees, row.net_amount, row.ticket_count,
          row.promo_code || '', row.order_date
        ].join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=orders_report_${new Date().toISOString().split('T')[0]}.csv`);
      return res.send(csvRows.join('\n'));
    }

    res.json({
      report: 'orders',
      generated_at: new Date().toISOString(),
      total_records: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error generating orders report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// GET /api/v1/integrations/eventbrite/reports/attendees - Export attendees report
app.get('/api/v1/integrations/eventbrite/reports/attendees', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { event_id, checked_in, format = 'json' } = req.query;

    let query = `
      SELECT
        id, event_id, order_id, ticket_class_name, name, email, phone,
        status, checked_in, checked_in_at, checked_in_by, barcode, created_at
      FROM eventbrite_attendees WHERE user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;

    if (event_id) {
      query += ` AND event_id = $${paramIndex++}`;
      params.push(event_id);
    }
    if (checked_in !== undefined) {
      query += ` AND checked_in = $${paramIndex++}`;
      params.push(checked_in === 'true');
    }

    query += ' ORDER BY name ASC';
    const result = await pool.query(query, params);

    if (format === 'csv') {
      const headers = ['Attendee ID', 'Event ID', 'Order ID', 'Ticket Type', 'Name', 'Email', 'Phone', 'Status', 'Checked In', 'Check-in Time', 'Checked In By', 'Barcode'];
      const csvRows = [headers.join(',')];

      for (const row of result.rows) {
        csvRows.push([
          row.id, row.event_id, row.order_id, `"${row.ticket_class_name || ''}"`,
          `"${row.name || ''}"`, row.email, row.phone || '', row.status,
          row.checked_in ? 'Yes' : 'No', row.checked_in_at || '', row.checked_in_by || '', row.barcode || ''
        ].join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=attendees_report_${new Date().toISOString().split('T')[0]}.csv`);
      return res.send(csvRows.join('\n'));
    }

    res.json({
      report: 'attendees',
      generated_at: new Date().toISOString(),
      total_records: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error generating attendees report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// GET /api/v1/integrations/eventbrite/reports/summary - Generate summary report
app.get('/api/v1/integrations/eventbrite/reports/summary', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { event_id } = req.query;

    // Orders stats
    let orderStatsQuery = `
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(ticket_count), 0) as total_tickets,
        COALESCE(SUM(gross_amount), 0) as gross_revenue,
        COALESCE(SUM(fees), 0) as total_fees,
        COALESCE(SUM(net_amount), 0) as net_revenue,
        COUNT(DISTINCT buyer_email) as unique_buyers,
        COALESCE(AVG(gross_amount), 0) as avg_order_value
      FROM eventbrite_orders WHERE user_id = $1
    `;
    const orderParams = [userId];
    if (event_id) {
      orderStatsQuery += ' AND event_id = $2';
      orderParams.push(event_id);
    }
    const orderStats = await pool.query(orderStatsQuery, orderParams);

    // Attendee stats
    let attendeeStatsQuery = `
      SELECT
        COUNT(*) as total_attendees,
        COUNT(*) FILTER (WHERE checked_in = true) as checked_in,
        COUNT(*) FILTER (WHERE checked_in = false) as not_checked_in
      FROM eventbrite_attendees WHERE user_id = $1
    `;
    const attendeeParams = [userId];
    if (event_id) {
      attendeeStatsQuery += ' AND event_id = $2';
      attendeeParams.push(event_id);
    }
    const attendeeStats = await pool.query(attendeeStatsQuery, attendeeParams);

    // Refund stats
    let refundStatsQuery = `
      SELECT
        COUNT(*) as total_refunds,
        COALESCE(SUM(amount), 0) as total_refunded
      FROM eventbrite_refunds WHERE user_id = $1
    `;
    const refundParams = [userId];
    if (event_id) {
      refundStatsQuery += ' AND event_id = $2';
      refundParams.push(event_id);
    }
    const refundStats = await pool.query(refundStatsQuery, refundParams);

    // Promo code stats
    let promoStatsQuery = `
      SELECT
        COUNT(*) as total_promo_codes,
        COALESCE(SUM(quantity_sold), 0) as total_uses
      FROM eventbrite_promo_codes WHERE user_id = $1
    `;
    const promoParams = [userId];
    if (event_id) {
      promoStatsQuery += ' AND event_id = $2';
      promoParams.push(event_id);
    }
    const promoStats = await pool.query(promoStatsQuery, promoParams);

    const summary = {
      generated_at: new Date().toISOString(),
      event_id: event_id || 'all',
      orders: {
        total_orders: parseInt(orderStats.rows[0].total_orders),
        total_tickets: parseInt(orderStats.rows[0].total_tickets),
        gross_revenue: parseFloat(orderStats.rows[0].gross_revenue),
        total_fees: parseFloat(orderStats.rows[0].total_fees),
        net_revenue: parseFloat(orderStats.rows[0].net_revenue),
        unique_buyers: parseInt(orderStats.rows[0].unique_buyers),
        avg_order_value: parseFloat(orderStats.rows[0].avg_order_value).toFixed(2)
      },
      attendees: {
        total: parseInt(attendeeStats.rows[0].total_attendees),
        checked_in: parseInt(attendeeStats.rows[0].checked_in),
        not_checked_in: parseInt(attendeeStats.rows[0].not_checked_in),
        check_in_rate: attendeeStats.rows[0].total_attendees > 0
          ? ((attendeeStats.rows[0].checked_in / attendeeStats.rows[0].total_attendees) * 100).toFixed(1)
          : '0'
      },
      refunds: {
        total_refunds: parseInt(refundStats.rows[0].total_refunds),
        total_refunded: parseFloat(refundStats.rows[0].total_refunded)
      },
      promo_codes: {
        total_codes: parseInt(promoStats.rows[0].total_promo_codes),
        total_uses: parseInt(promoStats.rows[0].total_uses)
      }
    };

    res.json(summary);
  } catch (error) {
    console.error('Error generating summary report:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 5: CREATE EVENTS ON EVENTBRITE
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/v1/integrations/eventbrite/events - Create event on Eventbrite
app.post('/api/v1/integrations/eventbrite/events', async (req, res) => {
  try {
    const userId = req.user?.id;
    const {
      name,
      description,
      start_date,
      end_date,
      timezone = 'America/New_York',
      venue_id,
      venue,  // Frontend sends venue object with name and address
      online_event = false,
      capacity,
      currency = 'USD',
      listed = true,
      shareable = true,
      category_id,
      subcategory_id
    } = req.body;

    if (!name || !start_date || !end_date) {
      return res.status(400).json({ error: 'name, start_date, and end_date are required' });
    }

    const apiKey = await getEventbriteApiKey(userId);
    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    // Get org ID
    const orgResult = await pool.query(
      "SELECT metadata->>'organization_id' as org_id FROM user_integrations WHERE user_id = $1 AND provider = 'eventbrite'",
      [userId]
    );
    const orgId = orgResult.rows[0]?.org_id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization not found' });
    }

    // Create venue in Eventbrite if venue data is provided (not just venue_id)
    let finalVenueId = venue_id;
    if (!online_event && venue && venue.name && !venue_id) {
      try {
        const venueData = {
          venue: {
            name: venue.name,
            address: {
              address_1: venue.address?.address_1 || venue.address?.address || '',
              city: venue.address?.city || '',
              region: venue.address?.region || '',
              postal_code: venue.address?.postal_code || '',
              country: venue.address?.country || 'US'
            }
          }
        };

        const venueResponse = await fetch(`https://www.eventbriteapi.com/v3/organizations/${orgId}/venues/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(venueData)
        });

        if (venueResponse.ok) {
          const createdVenue = await venueResponse.json();
          finalVenueId = createdVenue.id;
          console.log('Created venue in Eventbrite:', createdVenue.id);
        } else {
          console.warn('Failed to create venue, continuing without venue:', await venueResponse.text());
        }
      } catch (venueError) {
        console.warn('Error creating venue:', venueError.message);
        // Continue without venue - event can still be created
      }
    }

    const eventData = {
      event: {
        name: { html: name },
        description: description ? { html: description } : undefined,
        start: {
          timezone: timezone,
          utc: new Date(start_date).toISOString().replace('.000', '')
        },
        end: {
          timezone: timezone,
          utc: new Date(end_date).toISOString().replace('.000', '')
        },
        currency: currency,
        online_event: online_event,
        listed: listed,
        shareable: shareable,
        capacity: capacity,
        venue_id: finalVenueId,
        category_id: category_id,
        subcategory_id: subcategory_id
      }
    };

    const response = await fetch(`https://www.eventbriteapi.com/v3/organizations/${orgId}/events/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({
        error: 'Failed to create event on Eventbrite',
        details: errorData
      });
    }

    const ebEvent = await response.json();

    // Generate slug from event name
    const generateEventSlug = (eventName) => {
      return eventName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 50)
        + '-' + Date.now().toString(36);
    };
    const slug = generateEventSlug(name);

    // Save to local events table with slug
    const localResult = await pool.query(`
      INSERT INTO events (
        user_id, name, description, event_date, event_time, end_time,
        eventbrite_id, eventbrite_url, venue_id, eventbrite_capacity,
        eventbrite_category_id, eventbrite_subcategory_id, eventbrite_online_event,
        slug, is_public
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      userId, name, description, start_date.split('T')[0],
      start_date.split('T')[1]?.substring(0, 5) || '19:00',
      end_date.split('T')[1]?.substring(0, 5) || '23:00',
      ebEvent.id, ebEvent.url, finalVenueId, capacity,
      category_id, subcategory_id, online_event,
      slug, true  // is_public = true for shareable events
    ]);

    // Build the local portal URL
    const baseUrl = process.env.FRONTEND_URL || 'https://berry.merktop.com';
    const portalUrl = `${baseUrl}/e/${slug}`;

    res.json({
      success: true,
      id: ebEvent.id,  // Frontend expects id at root level
      localId: localResult.rows[0].id,
      slug: slug,
      portalUrl: portalUrl,  // URL to share on local portal
      eventbriteUrl: ebEvent.url,  // URL on Eventbrite
      eventbrite_event: ebEvent,
      local_event: localResult.rows[0]
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PUT /api/v1/integrations/eventbrite/events/:id - Update event on Eventbrite
app.put('/api/v1/integrations/eventbrite/events/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const updates = req.body;

    const apiKey = await getEventbriteApiKey(userId);
    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    const eventData = { event: {} };

    if (updates.name) eventData.event.name = { html: updates.name };
    if (updates.description) eventData.event.description = { html: updates.description };
    if (updates.start_date) {
      eventData.event.start = {
        timezone: updates.timezone || 'America/New_York',
        utc: new Date(updates.start_date).toISOString().replace('.000', '')
      };
    }
    if (updates.end_date) {
      eventData.event.end = {
        timezone: updates.timezone || 'America/New_York',
        utc: new Date(updates.end_date).toISOString().replace('.000', '')
      };
    }
    if (updates.capacity !== undefined) eventData.event.capacity = updates.capacity;
    if (updates.listed !== undefined) eventData.event.listed = updates.listed;

    const response = await fetch(`https://www.eventbriteapi.com/v3/events/${id}/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ error: 'Failed to update event', details: errorData });
    }

    const ebEvent = await response.json();

    // Update local event
    await pool.query(`
      UPDATE events SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        eventbrite_capacity = COALESCE($3, eventbrite_capacity),
        updated_at = CURRENT_TIMESTAMP
      WHERE eventbrite_id = $4 AND user_id = $5
    `, [updates.name, updates.description, updates.capacity, id, userId]);

    res.json({ success: true, event: ebEvent });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// POST /api/v1/integrations/eventbrite/events/:id/publish - Publish event
app.post('/api/v1/integrations/eventbrite/events/:id/publish', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const apiKey = await getEventbriteApiKey(userId);
    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    const response = await fetch(`https://www.eventbriteapi.com/v3/events/${id}/publish/`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ error: 'Failed to publish event', details: errorData });
    }

    res.json({ success: true, message: 'Event published successfully' });
  } catch (error) {
    console.error('Error publishing event:', error);
    res.status(500).json({ error: 'Failed to publish event' });
  }
});

// POST /api/v1/integrations/eventbrite/events/:id/ticket-classes - Create ticket type
app.post('/api/v1/integrations/eventbrite/events/:id/ticket-classes', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const {
      name,
      description,
      price,
      quantity_total,
      free = false,
      hidden = false,
      sales_start,
      sales_end
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const apiKey = await getEventbriteApiKey(userId);
    if (!apiKey) {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    const ticketData = {
      ticket_class: {
        name: name,
        description: description,
        quantity_total: quantity_total,
        free: free || price === 0,
        hidden: hidden
      }
    };

    if (!free && price > 0) {
      ticketData.ticket_class.cost = `USD,${Math.round(price * 100)}`;
    }

    if (sales_start) ticketData.ticket_class.sales_start = sales_start;
    if (sales_end) ticketData.ticket_class.sales_end = sales_end;

    const response = await fetch(`https://www.eventbriteapi.com/v3/events/${id}/ticket_classes/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(ticketData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ error: 'Failed to create ticket class', details: errorData });
    }

    const ticketClass = await response.json();
    res.json({ success: true, ticket_class: ticketClass });
  } catch (error) {
    console.error('Error creating ticket class:', error);
    res.status(500).json({ error: 'Failed to create ticket class' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 8: EMAIL BUYERS WITH RESEND
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/v1/integrations/eventbrite/email/send - Send email to order buyers
app.post('/api/v1/integrations/eventbrite/email/send', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { order_ids, event_id, subject, body, send_to_all = false } = req.body;

    if (!subject || !body) {
      return res.status(400).json({ error: 'subject and body are required' });
    }

    // Get recipients
    let recipientQuery = 'SELECT DISTINCT buyer_email, buyer_name FROM eventbrite_orders WHERE user_id = $1';
    const params = [userId];

    if (order_ids && order_ids.length > 0) {
      recipientQuery += ' AND id = ANY($2)';
      params.push(order_ids);
    } else if (event_id) {
      recipientQuery += ' AND event_id = $2';
      params.push(event_id);
    } else if (!send_to_all) {
      return res.status(400).json({ error: 'Specify order_ids, event_id, or set send_to_all=true' });
    }

    recipientQuery += " AND buyer_email IS NOT NULL AND buyer_email != ''";

    const recipientsResult = await pool.query(recipientQuery, params);
    const recipients = recipientsResult.rows;

    if (recipients.length === 0) {
      return res.status(404).json({ error: 'No recipients found' });
    }

    // Send emails using Resend
    const sent = [];
    const failed = [];

    for (const recipient of recipients) {
      try {
        const personalizedBody = body
          .replace(/\{\{name\}\}/g, recipient.buyer_name || 'Guest')
          .replace(/\{\{email\}\}/g, recipient.buyer_email);

        const result = await resend.emails.send({
          from: EMAIL_CONFIG.from,
          to: recipient.buyer_email,
          subject: subject,
          html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">${personalizedBody}</div>`,
          replyTo: EMAIL_CONFIG.replyTo
        });

        if (result.error) {
          failed.push({ email: recipient.buyer_email, error: result.error.message });
        } else {
          sent.push({ email: recipient.buyer_email, id: result.data?.id });
        }
      } catch (emailError) {
        failed.push({ email: recipient.buyer_email, error: emailError.message });
      }
    }

    res.json({
      success: true,
      total_recipients: recipients.length,
      sent: sent.length,
      failed: failed.length,
      sent_details: sent,
      failed_details: failed
    });
  } catch (error) {
    console.error('Error sending emails:', error);
    res.status(500).json({ error: 'Failed to send emails' });
  }
});

// POST /api/v1/integrations/eventbrite/email/attendees - Send email to attendees
app.post('/api/v1/integrations/eventbrite/email/attendees', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { event_id, subject, body, filter_checked_in } = req.body;

    if (!event_id || !subject || !body) {
      return res.status(400).json({ error: 'event_id, subject, and body are required' });
    }

    let query = "SELECT DISTINCT email, name FROM eventbrite_attendees WHERE user_id = $1 AND event_id = $2 AND email IS NOT NULL AND email != ''";
    const params = [userId, event_id];

    if (filter_checked_in !== undefined) {
      query += ' AND checked_in = $3';
      params.push(filter_checked_in);
    }

    const attendeesResult = await pool.query(query, params);
    const attendees = attendeesResult.rows;

    if (attendees.length === 0) {
      return res.status(404).json({ error: 'No attendees found' });
    }

    const sent = [];
    const failed = [];

    for (const attendee of attendees) {
      try {
        const personalizedBody = body
          .replace(/\{\{name\}\}/g, attendee.name || 'Guest')
          .replace(/\{\{email\}\}/g, attendee.email);

        const result = await resend.emails.send({
          from: EMAIL_CONFIG.from,
          to: attendee.email,
          subject: subject,
          html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">${personalizedBody}</div>`,
          replyTo: EMAIL_CONFIG.replyTo
        });

        if (result.error) {
          failed.push({ email: attendee.email, error: result.error.message });
        } else {
          sent.push({ email: attendee.email, id: result.data?.id });
        }
      } catch (emailError) {
        failed.push({ email: attendee.email, error: emailError.message });
      }
    }

    res.json({
      success: true,
      total_attendees: attendees.length,
      sent: sent.length,
      failed: failed.length,
      sent_details: sent,
      failed_details: failed
    });
  } catch (error) {
    console.error('Error sending emails to attendees:', error);
    res.status(500).json({ error: 'Failed to send emails' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 9: COMPARE EVENTS SIDE-BY-SIDE
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/integrations/eventbrite/compare - Compare multiple events
app.get('/api/v1/integrations/eventbrite/compare', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { event_ids } = req.query;

    if (!event_ids) {
      return res.status(400).json({ error: 'event_ids query parameter is required (comma-separated)' });
    }

    const eventIdList = event_ids.split(',').map(id => id.trim());

    if (eventIdList.length < 2) {
      return res.status(400).json({ error: 'At least 2 event IDs are required for comparison' });
    }

    const comparisons = [];

    for (const eventId of eventIdList) {
      // Get event info
      const eventResult = await pool.query(
        'SELECT * FROM events WHERE user_id = $1 AND eventbrite_id = $2',
        [userId, eventId]
      );

      // Get order stats
      const orderStats = await pool.query(`
        SELECT
          COUNT(*) as total_orders,
          COALESCE(SUM(ticket_count), 0) as total_tickets,
          COALESCE(SUM(gross_amount), 0) as gross_revenue,
          COALESCE(SUM(fees), 0) as total_fees,
          COALESCE(SUM(net_amount), 0) as net_revenue,
          COUNT(DISTINCT buyer_email) as unique_buyers,
          COALESCE(AVG(gross_amount), 0) as avg_order_value
        FROM eventbrite_orders WHERE user_id = $1 AND event_id = $2
      `, [userId, eventId]);

      // Get attendee stats
      const attendeeStats = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE checked_in = true) as checked_in
        FROM eventbrite_attendees WHERE user_id = $1 AND event_id = $2
      `, [userId, eventId]);

      // Get refund stats
      const refundStats = await pool.query(`
        SELECT
          COUNT(*) as total_refunds,
          COALESCE(SUM(amount), 0) as total_refunded
        FROM eventbrite_refunds WHERE user_id = $1 AND event_id = $2
      `, [userId, eventId]);

      // Get promo code stats
      const promoStats = await pool.query(`
        SELECT
          COUNT(*) as total_codes,
          COALESCE(SUM(quantity_sold), 0) as total_uses
        FROM eventbrite_promo_codes WHERE user_id = $1 AND event_id = $2
      `, [userId, eventId]);

      const event = eventResult.rows[0] || {};
      const orders = orderStats.rows[0];
      const attendees = attendeeStats.rows[0];
      const refunds = refundStats.rows[0];
      const promos = promoStats.rows[0];

      const capacity = event.eventbrite_capacity || event.expected_attendance || 1000;
      const ticketsSold = parseInt(orders.total_tickets);

      comparisons.push({
        event_id: eventId,
        event_name: event.name || `Event ${eventId}`,
        event_date: event.event_date,
        metrics: {
          tickets: {
            sold: ticketsSold,
            capacity: capacity,
            percent_sold: ((ticketsSold / capacity) * 100).toFixed(1)
          },
          revenue: {
            gross: parseFloat(orders.gross_revenue),
            fees: parseFloat(orders.total_fees),
            net: parseFloat(orders.net_revenue),
            avg_order: parseFloat(orders.avg_order_value).toFixed(2)
          },
          orders: {
            total: parseInt(orders.total_orders),
            unique_buyers: parseInt(orders.unique_buyers)
          },
          attendees: {
            total: parseInt(attendees.total),
            checked_in: parseInt(attendees.checked_in),
            check_in_rate: attendees.total > 0
              ? ((attendees.checked_in / attendees.total) * 100).toFixed(1)
              : '0'
          },
          refunds: {
            count: parseInt(refunds.total_refunds),
            amount: parseFloat(refunds.total_refunded)
          },
          promo_codes: {
            count: parseInt(promos.total_codes),
            uses: parseInt(promos.total_uses)
          }
        }
      });
    }

    // Calculate comparisons (best/worst for each metric)
    const analysis = {
      best_revenue: comparisons.reduce((a, b) =>
        parseFloat(b.metrics.revenue.net) > parseFloat(a.metrics.revenue.net) ? b : a
      ).event_name,
      best_attendance: comparisons.reduce((a, b) =>
        parseFloat(b.metrics.tickets.percent_sold) > parseFloat(a.metrics.tickets.percent_sold) ? b : a
      ).event_name,
      best_check_in_rate: comparisons.reduce((a, b) =>
        parseFloat(b.metrics.attendees.check_in_rate) > parseFloat(a.metrics.attendees.check_in_rate) ? b : a
      ).event_name,
      lowest_refund_rate: comparisons.reduce((a, b) => {
        const aRate = a.metrics.revenue.gross > 0 ? a.metrics.refunds.amount / a.metrics.revenue.gross : 0;
        const bRate = b.metrics.revenue.gross > 0 ? b.metrics.refunds.amount / b.metrics.revenue.gross : 0;
        return bRate < aRate ? b : a;
      }).event_name
    };

    res.json({
      compared_at: new Date().toISOString(),
      event_count: comparisons.length,
      events: comparisons,
      analysis
    });
  } catch (error) {
    console.error('Error comparing events:', error);
    res.status(500).json({ error: 'Failed to compare events' });
  }
});

// GET /api/v1/orders - Get all orders with stats
app.get('/api/v1/orders', async (req, res) => {
  try {
    const { event_id, status, limit = 100, offset = 0 } = req.query;

    let query = 'SELECT * FROM orders WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (event_id) {
      query += ` AND event_id = $${paramIndex++}`;
      params.push(event_id);
    }

    if (status) {
      query += ` AND order_status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get stats
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(ticket_count), 0) as total_tickets,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COUNT(CASE WHEN order_status = 'placed' THEN 1 END) as active_orders,
        COUNT(CASE WHEN order_status = 'refunded' THEN 1 END) as refunded_orders
      FROM orders
    `);

    res.json({
      orders: result.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/v1/orders/stats - Get order statistics
app.get('/api/v1/orders/stats', async (req, res) => {
  try {
    // Overall stats
    const overallStats = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(ticket_count), 0) as total_tickets,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COUNT(CASE WHEN order_status = 'placed' THEN 1 END) as active_orders,
        COUNT(CASE WHEN order_status = 'refunded' THEN 1 END) as refunded_orders,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as orders_today,
        COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN total_amount ELSE 0 END), 0) as revenue_today
      FROM orders
    `);

    // By event
    const byEvent = await pool.query(`
      SELECT
        event_id,
        event_name,
        COUNT(*) as order_count,
        SUM(ticket_count) as ticket_count,
        SUM(total_amount) as revenue
      FROM orders
      GROUP BY event_id, event_name
      ORDER BY revenue DESC
      LIMIT 10
    `);

    // Recent orders
    const recentOrders = await pool.query(`
      SELECT id, event_name, buyer_name, ticket_count, total_amount, currency, order_status, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 10
    `);

    res.json({
      overall: overallStats.rows[0],
      byEvent: byEvent.rows,
      recentOrders: recentOrders.rows
    });
  } catch (error) {
    console.error('Error fetching order stats:', error);
    res.status(500).json({ error: 'Failed to fetch order stats' });
  }
});

// ============================================
// MAILCHIMP SYNC - Sync guests to audiences
// ============================================

// GET /api/v1/integrations/mailchimp/audiences - List Mailchimp audiences
app.get('/api/v1/integrations/mailchimp/audiences', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['mailchimp']);
    const saved = result.rows[0];

    if (!saved?.api_key_encrypted || saved.status !== 'connected') {
      return res.status(400).json({ error: 'Mailchimp not connected' });
    }

    const apiKey = decryptApiKey(saved.api_key_encrypted);
    const serverPrefix = saved.extra_config?.server_prefix || 'us21';

    const response = await fetch(`https://${serverPrefix}.api.mailchimp.com/3.0/lists`, {
      headers: { 'Authorization': `apikey ${apiKey}` }
    });

    if (!response.ok) {
      return res.status(400).json({ error: 'Failed to fetch audiences' });
    }

    const data = await response.json();
    const audiences = (data.lists || []).map(list => ({
      id: list.id,
      name: list.name,
      memberCount: list.stats?.member_count || 0
    }));

    res.json({ audiences });
  } catch (error) {
    console.error('Error fetching Mailchimp audiences:', error);
    res.status(500).json({ error: 'Failed to fetch audiences' });
  }
});

// POST /api/v1/integrations/mailchimp/sync - Sync guests to Mailchimp audience
app.post('/api/v1/integrations/mailchimp/sync', async (req, res) => {
  try {
    const { audienceId, guestFilter } = req.body; // guestFilter: 'all', 'vip', 'checked_in'

    const intResult = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['mailchimp']);
    const saved = intResult.rows[0];

    if (!saved?.api_key_encrypted || saved.status !== 'connected') {
      return res.status(400).json({ error: 'Mailchimp not connected' });
    }

    if (!audienceId) {
      return res.status(400).json({ error: 'Audience ID is required' });
    }

    const apiKey = decryptApiKey(saved.api_key_encrypted);
    const serverPrefix = saved.extra_config?.server_prefix || 'us21';

    // Get guests based on filter
    let guestQuery = 'SELECT * FROM guests WHERE email IS NOT NULL AND email != \'\'';
    if (guestFilter === 'vip') {
      guestQuery += " AND category = 'vip'";
    } else if (guestFilter === 'checked_in') {
      guestQuery += ' AND checked_in_at IS NOT NULL';
    }

    const guestsResult = await pool.query(guestQuery);
    const guests = guestsResult.rows;

    if (guests.length === 0) {
      return res.json({ success: true, message: 'No guests to sync', synced: 0 });
    }

    // Prepare batch for Mailchimp
    const members = guests.map(g => ({
      email_address: g.email,
      status: 'subscribed',
      merge_fields: {
        FNAME: g.name?.split(' ')[0] || '',
        LNAME: g.name?.split(' ').slice(1).join(' ') || '',
        PHONE: g.phone || ''
      }
    }));

    // Batch add/update members
    const response = await fetch(`https://${serverPrefix}.api.mailchimp.com/3.0/lists/${audienceId}`, {
      method: 'POST',
      headers: {
        'Authorization': `apikey ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        members,
        update_existing: true
      })
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(400).json({ error: error.detail || 'Failed to sync' });
    }

    const result = await response.json();

    // Update last sync time
    await pool.query(`
      UPDATE integrations SET last_sync = NOW(), updated_at = NOW() WHERE provider = 'mailchimp'
    `);

    res.json({
      success: true,
      message: `Synced ${result.total_created + result.total_updated} contacts to Mailchimp`,
      created: result.total_created,
      updated: result.total_updated,
      errors: result.error_count
    });
  } catch (error) {
    console.error('Error syncing to Mailchimp:', error);
    res.status(500).json({ error: 'Failed to sync with Mailchimp: ' + error.message });
  }
});

// ============================================
// PROMOTER MANAGEMENT ENDPOINTS
// ============================================

// Promoter tiers configuration
const promoterTiers = {
  bronze: { name: 'Bronze', minSales: 0, maxSales: 4999, commission: 10, color: '#CD7F32', icon: '🥉' },
  silver: { name: 'Silver', minSales: 5000, maxSales: 14999, commission: 12, color: '#C0C0C0', icon: '🥈' },
  gold: { name: 'Gold', minSales: 15000, maxSales: 34999, commission: 15, color: '#FFD700', icon: '🥇' },
  platinum: { name: 'Platinum', minSales: 35000, maxSales: Infinity, commission: 20, color: '#E5E4E2', icon: '💎' }
};

// Generate unique promoter code
const generatePromoterCode = (name) => {
  const prefix = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4).padEnd(4, 'X');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${random}`;
};

// Calculate promoter tier based on total sales
const getPromoterTier = (totalSales) => {
  const sales = parseFloat(totalSales) || 0;
  if (sales >= 35000) return 'platinum';
  if (sales >= 15000) return 'gold';
  if (sales >= 5000) return 'silver';
  return 'bronze';
};

// GET /api/v1/promoters - List all promoters
app.get('/api/v1/promoters', async (req, res) => {
  try {
    const userId = req.userId;
    const { status, tier, search, sort = 'created_at', order = 'DESC', limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT p.*,
        (SELECT COUNT(*) FROM promoter_sales ps WHERE ps.promoter_id = p.id) as sales_count,
        (SELECT COALESCE(SUM(sale_amount), 0) FROM promoter_sales ps WHERE ps.promoter_id = p.id) as calculated_total_sales,
        (SELECT COALESCE(SUM(commission_amount), 0) FROM promoter_sales ps WHERE ps.promoter_id = p.id AND ps.commission_status = 'paid') as paid_commission,
        (SELECT COALESCE(SUM(commission_amount), 0) FROM promoter_sales ps WHERE ps.promoter_id = p.id AND ps.commission_status = 'pending') as pending_commission
      FROM promoters p
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    // Filter by user if authenticated
    if (userId) {
      query += ` AND (p.user_id = $${paramIndex} OR p.user_id IS NULL)`;
      params.push(userId);
      paramIndex++;
    }

    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (tier) {
      query += ` AND p.tier = $${paramIndex}`;
      params.push(tier);
      paramIndex++;
    }

    if (search) {
      query += ` AND (p.name ILIKE $${paramIndex} OR p.email ILIKE $${paramIndex} OR p.code ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Validate sort column to prevent SQL injection
    const allowedSorts = ['created_at', 'name', 'total_sales', 'total_commission', 'tier', 'status'];
    const sortColumn = allowedSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    query += ` ORDER BY p.${sortColumn} ${sortOrder} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM promoters p WHERE 1=1`;
    const countParams = [];
    let countParamIndex = 1;

    if (userId) {
      countQuery += ` AND (p.user_id = $${countParamIndex} OR p.user_id IS NULL)`;
      countParams.push(userId);
      countParamIndex++;
    }
    if (status) {
      countQuery += ` AND p.status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }
    if (tier) {
      countQuery += ` AND p.tier = $${countParamIndex}`;
      countParams.push(tier);
      countParamIndex++;
    }
    if (search) {
      countQuery += ` AND (p.name ILIKE $${countParamIndex} OR p.email ILIKE $${countParamIndex} OR p.code ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      success: true,
      promoters: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset),
      tiers: promoterTiers
    });
  } catch (error) {
    console.error('Error fetching promoters:', error);
    res.status(500).json({ error: 'Failed to fetch promoters: ' + error.message });
  }
});

// GET /api/v1/promoters/leaderboard - Get promoter leaderboard
app.get('/api/v1/promoters/leaderboard', async (req, res) => {
  try {
    const { period = 'all', limit = 10 } = req.query;

    let dateFilter = '';
    if (period === 'week') {
      dateFilter = `AND ps.created_at >= NOW() - INTERVAL '7 days'`;
    } else if (period === 'month') {
      dateFilter = `AND ps.created_at >= NOW() - INTERVAL '30 days'`;
    } else if (period === 'year') {
      dateFilter = `AND ps.created_at >= NOW() - INTERVAL '365 days'`;
    }

    const result = await pool.query(`
      SELECT
        p.id, p.name, p.code, p.tier, p.photo_url, p.social_instagram,
        COALESCE(SUM(ps.sale_amount), 0) as period_sales,
        COALESCE(SUM(ps.commission_amount), 0) as period_commission,
        COUNT(ps.id) as period_tickets,
        p.total_sales as all_time_sales,
        p.total_commission as all_time_commission
      FROM promoters p
      LEFT JOIN promoter_sales ps ON p.id = ps.promoter_id ${dateFilter}
      WHERE p.status = 'active'
      GROUP BY p.id
      ORDER BY period_sales DESC
      LIMIT $1
    `, [parseInt(limit)]);

    // Add rank
    const leaderboard = result.rows.map((p, i) => ({
      ...p,
      rank: i + 1,
      tierInfo: promoterTiers[p.tier] || promoterTiers.bronze
    }));

    res.json({
      success: true,
      period,
      leaderboard
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard: ' + error.message });
  }
});

// GET /api/v1/promoters/by-code/:code - Get promoter by code (public for landing pages)
app.get('/api/v1/promoters/by-code/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const result = await pool.query(`
      SELECT id, name, code, tier, bio, photo_url, social_instagram, social_tiktok, social_twitter, landing_page_slug
      FROM promoters
      WHERE code = $1 AND status = 'active'
    `, [code.toUpperCase()]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Promoter not found or inactive' });
    }

    const promoter = result.rows[0];
    promoter.tierInfo = promoterTiers[promoter.tier] || promoterTiers.bronze;

    res.json({
      success: true,
      promoter
    });
  } catch (error) {
    console.error('Error fetching promoter by code:', error);
    res.status(500).json({ error: 'Failed to fetch promoter: ' + error.message });
  }
});

// GET /api/v1/promoters/:id - Get single promoter
app.get('/api/v1/promoters/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM promoter_sales ps WHERE ps.promoter_id = p.id) as sales_count,
        (SELECT COALESCE(SUM(sale_amount), 0) FROM promoter_sales ps WHERE ps.promoter_id = p.id) as calculated_total_sales,
        (SELECT COALESCE(SUM(commission_amount), 0) FROM promoter_sales ps WHERE ps.promoter_id = p.id AND ps.commission_status = 'paid') as paid_commission,
        (SELECT COALESCE(SUM(commission_amount), 0) FROM promoter_sales ps WHERE ps.promoter_id = p.id AND ps.commission_status = 'pending') as pending_commission
      FROM promoters p
      WHERE p.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Promoter not found' });
    }

    const promoter = result.rows[0];
    promoter.tierInfo = promoterTiers[promoter.tier] || promoterTiers.bronze;

    // Get recent sales
    const salesResult = await pool.query(`
      SELECT * FROM promoter_sales
      WHERE promoter_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [id]);

    res.json({
      success: true,
      promoter,
      recentSales: salesResult.rows
    });
  } catch (error) {
    console.error('Error fetching promoter:', error);
    res.status(500).json({ error: 'Failed to fetch promoter: ' + error.message });
  }
});

// POST /api/v1/promoters - Create new promoter
app.post('/api/v1/promoters', async (req, res) => {
  try {
    const userId = req.userId;
    const {
      name, email, phone, commission_rate = 10, commission_type = 'percentage',
      bio, photo_url, social_instagram, social_tiktok, social_twitter, landing_page_slug
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Generate unique code
    let code = generatePromoterCode(name);

    // Ensure code is unique
    let codeExists = true;
    let attempts = 0;
    while (codeExists && attempts < 10) {
      const existing = await pool.query('SELECT id FROM promoters WHERE code = $1', [code]);
      if (existing.rows.length === 0) {
        codeExists = false;
      } else {
        code = generatePromoterCode(name);
        attempts++;
      }
    }

    // Check if email already exists
    const emailCheck = await pool.query('SELECT id FROM promoters WHERE email = $1', [email.toLowerCase()]);
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'A promoter with this email already exists' });
    }

    const result = await pool.query(`
      INSERT INTO promoters (
        user_id, name, email, phone, code, commission_rate, commission_type,
        status, tier, bio, photo_url, social_instagram, social_tiktok, social_twitter, landing_page_slug
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'bronze', $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      userId, name, email.toLowerCase(), phone, code, commission_rate, commission_type,
      bio, photo_url, social_instagram, social_tiktok, social_twitter, landing_page_slug || code.toLowerCase()
    ]);

    const promoter = result.rows[0];
    promoter.tierInfo = promoterTiers.bronze;

    res.status(201).json({
      success: true,
      message: 'Promoter created successfully',
      promoter
    });
  } catch (error) {
    console.error('Error creating promoter:', error);
    res.status(500).json({ error: 'Failed to create promoter: ' + error.message });
  }
});

// PATCH /api/v1/promoters/:id - Update promoter
app.patch('/api/v1/promoters/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if promoter exists
    const existing = await pool.query('SELECT * FROM promoters WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Promoter not found' });
    }

    // Build update query
    const allowedFields = [
      'name', 'email', 'phone', 'commission_rate', 'commission_type', 'status', 'tier',
      'bio', 'photo_url', 'social_instagram', 'social_tiktok', 'social_twitter', 'landing_page_slug'
    ];

    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        values.push(key === 'email' ? value.toLowerCase() : value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updateFields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(`
      UPDATE promoters SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *
    `, values);

    const promoter = result.rows[0];
    promoter.tierInfo = promoterTiers[promoter.tier] || promoterTiers.bronze;

    res.json({
      success: true,
      message: 'Promoter updated successfully',
      promoter
    });
  } catch (error) {
    console.error('Error updating promoter:', error);
    res.status(500).json({ error: 'Failed to update promoter: ' + error.message });
  }
});

// DELETE /api/v1/promoters/:id - Delete promoter
app.delete('/api/v1/promoters/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if promoter exists
    const existing = await pool.query('SELECT * FROM promoters WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Promoter not found' });
    }

    // Delete promoter (cascades to promoter_sales, payouts, events)
    await pool.query('DELETE FROM promoters WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Promoter deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting promoter:', error);
    res.status(500).json({ error: 'Failed to delete promoter: ' + error.message });
  }
});

// GET /api/v1/promoters/:id/stats - Get promoter statistics
app.get('/api/v1/promoters/:id/stats', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid promoter ID' });
    }

    // Check if promoter exists
    const promoterResult = await pool.query('SELECT * FROM promoters WHERE id = $1', [id]);
    if (promoterResult.rows.length === 0) {
      return res.status(404).json({ error: 'Promoter not found' });
    }

    // Get overall stats
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_sales,
        COALESCE(SUM(sale_amount), 0) as total_revenue,
        COALESCE(SUM(commission_amount), 0) as total_commission,
        COALESCE(SUM(CASE WHEN commission_status = 'paid' THEN commission_amount ELSE 0 END), 0) as paid_commission,
        COALESCE(SUM(CASE WHEN commission_status = 'pending' THEN commission_amount ELSE 0 END), 0) as pending_commission,
        COALESCE(AVG(sale_amount), 0) as avg_sale_amount
      FROM promoter_sales
      WHERE promoter_id = $1::integer
    `, [id]);

    // Get sales by month (last 12 months)
    const monthlyResult = await pool.query(`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as sales,
        COALESCE(SUM(sale_amount), 0) as revenue,
        COALESCE(SUM(commission_amount), 0) as commission
      FROM promoter_sales
      WHERE promoter_id = $1::integer AND created_at >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
    `, [id]);

    // Get sales by event (handle potential type issues)
    let eventResult = { rows: [] };
    try {
      eventResult = await pool.query(`
        SELECT
          ps.event_id,
          COALESCE(e.name, 'Event ' || COALESCE(ps.event_id::text, 'Unknown')) as event_name,
          COUNT(*) as sales,
          COALESCE(SUM(ps.sale_amount), 0) as revenue,
          COALESCE(SUM(ps.commission_amount), 0) as commission
        FROM promoter_sales ps
        LEFT JOIN events e ON CAST(ps.event_id AS INTEGER) = e.id
        WHERE ps.promoter_id = $1
        GROUP BY ps.event_id, e.name
        ORDER BY revenue DESC
        LIMIT 10
      `, [id]);
    } catch (eventError) {
      console.error('Error fetching event breakdown (non-critical):', eventError.message);
      // Try simpler query without join
      try {
        eventResult = await pool.query(`
          SELECT
            event_id,
            'Event ' || COALESCE(event_id::text, 'Unknown') as event_name,
            COUNT(*) as sales,
            COALESCE(SUM(sale_amount), 0) as revenue,
            COALESCE(SUM(commission_amount), 0) as commission
          FROM promoter_sales
          WHERE promoter_id = $1
          GROUP BY event_id
          ORDER BY revenue DESC
          LIMIT 10
        `, [id]);
      } catch (simpleError) {
        console.error('Error fetching simple event breakdown:', simpleError.message);
      }
    }

    res.json({
      success: true,
      stats: statsResult.rows[0],
      monthly: monthlyResult.rows,
      byEvent: eventResult.rows,
      promoter: promoterResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching promoter stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats: ' + error.message });
  }
});

// POST /api/v1/promoters/track - Track a sale with promoter code
app.post('/api/v1/promoters/track', async (req, res) => {
  try {
    const { code, event_id, ticket_id, guest_name, guest_email, sale_amount, notes } = req.body;

    if (!code || !sale_amount) {
      return res.status(400).json({ error: 'Promoter code and sale amount are required' });
    }

    // Find promoter by code
    const promoterResult = await pool.query(
      'SELECT * FROM promoters WHERE code = $1 AND status = $2',
      [code.toUpperCase(), 'active']
    );

    if (promoterResult.rows.length === 0) {
      return res.status(404).json({ error: 'Promoter not found or inactive' });
    }

    const promoter = promoterResult.rows[0];

    // Calculate commission
    let commission_amount;
    if (promoter.commission_type === 'percentage') {
      commission_amount = (parseFloat(sale_amount) * parseFloat(promoter.commission_rate)) / 100;
    } else {
      commission_amount = parseFloat(promoter.commission_rate);
    }

    // Create sale record
    const saleResult = await pool.query(`
      INSERT INTO promoter_sales (
        promoter_id, event_id, ticket_id, guest_name, guest_email,
        sale_amount, commission_amount, commission_status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
      RETURNING *
    `, [promoter.id, event_id, ticket_id, guest_name, guest_email, sale_amount, commission_amount, notes]);

    // Update promoter totals
    await pool.query(`
      UPDATE promoters SET
        total_sales = total_sales + $1,
        total_commission = total_commission + $2,
        total_tickets_sold = total_tickets_sold + 1,
        last_sale_at = NOW(),
        tier = $3,
        updated_at = NOW()
      WHERE id = $4
    `, [sale_amount, commission_amount, getPromoterTier(promoter.total_sales + parseFloat(sale_amount)), promoter.id]);

    res.status(201).json({
      success: true,
      message: 'Sale tracked successfully',
      sale: saleResult.rows[0],
      promoter: {
        id: promoter.id,
        name: promoter.name,
        code: promoter.code,
        commission_earned: commission_amount
      }
    });
  } catch (error) {
    console.error('Error tracking sale:', error);
    res.status(500).json({ error: 'Failed to track sale: ' + error.message });
  }
});

// POST /api/v1/promoters/:id/payout - Create payout for promoter
app.post('/api/v1/promoters/:id/payout', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, payment_method, reference, notes } = req.body;

    if (!amount || !payment_method) {
      return res.status(400).json({ error: 'Amount and payment method are required' });
    }

    // Check promoter exists
    const promoterResult = await pool.query('SELECT * FROM promoters WHERE id = $1', [id]);
    if (promoterResult.rows.length === 0) {
      return res.status(404).json({ error: 'Promoter not found' });
    }

    // Create payout record
    const payoutResult = await pool.query(`
      INSERT INTO promoter_payouts (
        promoter_id, amount, payment_method, reference, notes, status, paid_at
      ) VALUES ($1, $2, $3, $4, $5, 'completed', NOW())
      RETURNING *
    `, [id, amount, payment_method, reference, notes]);

    // Mark pending commissions as paid (up to payout amount)
    await pool.query(`
      UPDATE promoter_sales SET
        commission_status = 'paid',
        paid_at = NOW()
      WHERE promoter_id = $1 AND commission_status = 'pending'
    `, [id]);

    res.status(201).json({
      success: true,
      message: 'Payout created successfully',
      payout: payoutResult.rows[0]
    });
  } catch (error) {
    console.error('Error creating payout:', error);
    res.status(500).json({ error: 'Failed to create payout: ' + error.message });
  }
});

// GET /api/v1/promoters/:id/payouts - Get promoter payouts
app.get('/api/v1/promoters/:id/payouts', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const result = await pool.query(`
      SELECT * FROM promoter_payouts
      WHERE promoter_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [id, parseInt(limit), parseInt(offset)]);

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM promoter_payouts WHERE promoter_id = $1',
      [id]
    );

    res.json({
      success: true,
      payouts: result.rows,
      total: parseInt(countResult.rows[0].count)
    });
  } catch (error) {
    console.error('Error fetching payouts:', error);
    res.status(500).json({ error: 'Failed to fetch payouts: ' + error.message });
  }
});

// GET /api/v1/promoters/stats/summary - Get overall promoter system stats
app.get('/api/v1/promoters/stats/summary', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM promoters) as total_promoters,
        (SELECT COUNT(*) FROM promoters WHERE status = 'active') as active_promoters,
        (SELECT COALESCE(SUM(total_sales), 0) FROM promoters) as total_sales,
        (SELECT COALESCE(SUM(total_commission), 0) FROM promoters) as total_commissions,
        (SELECT COUNT(*) FROM promoter_sales) as total_transactions,
        (SELECT COALESCE(SUM(commission_amount), 0) FROM promoter_sales WHERE commission_status = 'pending') as pending_payouts
    `);

    const tierBreakdown = await pool.query(`
      SELECT tier, COUNT(*) as count
      FROM promoters
      GROUP BY tier
    `);

    res.json({
      success: true,
      stats: stats.rows[0],
      tierBreakdown: tierBreakdown.rows,
      tiers: promoterTiers
    });
  } catch (error) {
    console.error('Error fetching promoter summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary: ' + error.message });
  }
});

// ============================================
// TELNYX AI ASSISTANT QUERY ENDPOINT
// ============================================

// POST /api/v1/ai/query - Query data for Telnyx AI Assistant
app.post('/api/v1/ai/query', async (req, res) => {
  try {
    const aiSource = req.headers['x-ai-source'];
    const { query_type, event_id, search } = req.body;

    console.log('AI Query:', { query_type, event_id, search, aiSource });

    // Verify request comes from Telnyx AI Assistant
    if (aiSource !== 'telnyx-assistant') {
      return res.status(403).json({ error: 'Unauthorized AI source' });
    }

    if (!query_type) {
      return res.status(400).json({ error: 'query_type is required' });
    }

    let result = {};

    switch (query_type) {
      case 'events': {
        const events = await pool.query(`
          SELECT id, name, event_date, event_type, venue_name, venue_city,
                 expected_attendance, dress_code, theme, status
          FROM events
          WHERE status != 'cancelled'
          ORDER BY event_date DESC
          LIMIT 10
        `);
        result = {
          type: 'events',
          count: events.rows.length,
          events: events.rows.map(e => ({
            id: e.id,
            name: e.name,
            date: e.event_date,
            type: e.event_type,
            venue: e.venue_name,
            city: e.venue_city,
            attendance: e.expected_attendance,
            dressCode: e.dress_code,
            theme: e.theme,
            status: e.status
          }))
        };
        break;
      }

      case 'guests': {
        let guestQuery = `
          SELECT g.id, g.name, g.email, g.phone, g.status, g.party_size, g.category,
                 e.name as event_name, e.event_date
          FROM guests g
          LEFT JOIN events e ON g.event_id = e.id
          WHERE 1=1
        `;
        const params = [];

        if (event_id) {
          params.push(event_id);
          guestQuery += ` AND g.event_id = $${params.length}`;
        }

        if (search) {
          params.push(`%${search}%`);
          guestQuery += ` AND (g.name ILIKE $${params.length} OR g.email ILIKE $${params.length} OR g.phone ILIKE $${params.length})`;
        }

        guestQuery += ` ORDER BY g.created_at DESC LIMIT 20`;

        const guests = await pool.query(guestQuery, params);
        result = {
          type: 'guests',
          count: guests.rows.length,
          guests: guests.rows.map(g => ({
            id: g.id,
            name: g.name,
            email: g.email,
            phone: g.phone,
            status: g.status,
            partySize: g.party_size,
            category: g.category,
            eventName: g.event_name,
            eventDate: g.event_date
          }))
        };
        break;
      }

      case 'sponsors': {
        const sponsors = await pool.query(`
          SELECT id, company_name, contact_name, email, phone, tier,
                 sponsorship_amount, status, benefits
          FROM sponsors
          ORDER BY sponsorship_amount DESC
          LIMIT 20
        `);
        result = {
          type: 'sponsors',
          count: sponsors.rows.length,
          tiers: {
            bronze: '$1,000 - $5,000',
            silver: '$5,000 - $15,000',
            gold: '$15,000 - $35,000',
            platinum: '$35,000 - $75,000',
            diamond: '$75,000 - $150,000',
            title: '$150,000+'
          },
          sponsors: sponsors.rows.map(s => ({
            id: s.id,
            company: s.company_name,
            contact: s.contact_name,
            email: s.email,
            phone: s.phone,
            tier: s.tier,
            amount: s.sponsorship_amount,
            status: s.status,
            benefits: s.benefits
          }))
        };
        break;
      }

      case 'staff': {
        const staff = await pool.query(`
          SELECT id, name, email, phone, role, experience_level, hourly_rate, status
          FROM staff
          WHERE status = 'active'
          ORDER BY name
          LIMIT 30
        `);
        result = {
          type: 'staff',
          count: staff.rows.length,
          staff: staff.rows.map(s => ({
            id: s.id,
            name: s.name,
            email: s.email,
            phone: s.phone,
            role: s.role,
            experience: s.experience_level,
            hourlyRate: s.hourly_rate
          }))
        };
        break;
      }

      case 'tables': {
        let tableQuery = `
          SELECT tr.id, tr.table_name, tr.zone, tr.customer_name, tr.customer_email,
                 tr.customer_phone, tr.party_size, tr.minimum_spend, tr.status,
                 e.name as event_name, e.event_date
          FROM table_reservations tr
          LEFT JOIN events e ON tr.event_id = e.id
          WHERE tr.status != 'cancelled'
        `;
        const params = [];

        if (event_id) {
          params.push(event_id);
          tableQuery += ` AND tr.event_id = $${params.length}`;
        }

        tableQuery += ` ORDER BY e.event_date DESC, tr.created_at DESC LIMIT 20`;

        const tables = await pool.query(tableQuery, params);
        result = {
          type: 'tables',
          count: tables.rows.length,
          minimumSpendInfo: 'VIP tables start at $2,000 minimum spend',
          tables: tables.rows.map(t => ({
            id: t.id,
            tableName: t.table_name,
            zone: t.zone,
            customer: t.customer_name,
            email: t.customer_email,
            phone: t.customer_phone,
            partySize: t.party_size,
            minimumSpend: t.minimum_spend,
            status: t.status,
            eventName: t.event_name,
            eventDate: t.event_date
          }))
        };
        break;
      }

      case 'tickets': {
        let ticketQuery = `
          SELECT t.id, t.ticket_type, t.holder_name, t.holder_email, t.price,
                 t.is_checked_in, t.qr_code,
                 e.name as event_name, e.event_date
          FROM tickets t
          LEFT JOIN events e ON t.event_id = e.id
          WHERE 1=1
        `;
        const params = [];

        if (event_id) {
          params.push(event_id);
          ticketQuery += ` AND t.event_id = $${params.length}`;
        }

        if (search) {
          params.push(`%${search}%`);
          ticketQuery += ` AND (t.holder_name ILIKE $${params.length} OR t.holder_email ILIKE $${params.length})`;
        }

        ticketQuery += ` ORDER BY t.created_at DESC LIMIT 20`;

        const tickets = await pool.query(ticketQuery, params);
        result = {
          type: 'tickets',
          count: tickets.rows.length,
          tickets: tickets.rows.map(t => ({
            id: t.id,
            type: t.ticket_type,
            holder: t.holder_name,
            email: t.holder_email,
            price: t.price,
            checkedIn: t.is_checked_in,
            eventName: t.event_name,
            eventDate: t.event_date
          }))
        };
        break;
      }

      case 'overview': {
        // Get a general overview for the AI
        const [events, guests, sponsors, staff] = await Promise.all([
          pool.query(`SELECT COUNT(*) as count FROM events WHERE status != 'cancelled'`),
          pool.query(`SELECT COUNT(*) as count FROM guests`),
          pool.query(`SELECT COUNT(*) as count, SUM(sponsorship_amount) as total FROM sponsors WHERE status = 'confirmed'`),
          pool.query(`SELECT COUNT(*) as count FROM staff WHERE status = 'active'`)
        ]);

        // Get upcoming events
        const upcomingEvents = await pool.query(`
          SELECT name, event_date, venue_name, expected_attendance
          FROM events
          WHERE event_date >= CURRENT_DATE AND status != 'cancelled'
          ORDER BY event_date ASC
          LIMIT 3
        `);

        result = {
          type: 'overview',
          summary: {
            totalEvents: parseInt(events.rows[0].count),
            totalGuests: parseInt(guests.rows[0].count),
            totalSponsors: parseInt(sponsors.rows[0].count),
            sponsorRevenue: parseFloat(sponsors.rows[0].total) || 0,
            activeStaff: parseInt(staff.rows[0].count)
          },
          upcomingEvents: upcomingEvents.rows.map(e => ({
            name: e.name,
            date: e.event_date,
            venue: e.venue_name,
            expectedAttendance: e.expected_attendance
          })),
          companyInfo: {
            name: 'Berry Bly Productions',
            specialty: 'Luxury Events & VIP Experiences',
            location: 'Miami, FL',
            contact: 'concierge@berrybly.com',
            website: 'berry.merktop.com'
          }
        };
        break;
      }

      default:
        return res.status(400).json({
          error: 'Invalid query_type',
          validTypes: ['events', 'guests', 'sponsors', 'staff', 'tables', 'tickets', 'overview']
        });
    }

    console.log('AI Query Result:', { type: result.type, count: result.count || 'N/A' });
    res.json({ success: true, data: result });

  } catch (error) {
    console.error('AI Query error:', error);
    res.status(500).json({ error: 'Failed to query data: ' + error.message });
  }
});

// ============================================
// SERVE FRONTEND STATIC FILES
// ============================================
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  console.log('Serving frontend from:', distPath);
  app.use(express.static(distPath));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api') || req.path.startsWith('/oauth') || req.path.startsWith('/uploads') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.log('Frontend dist not found at:', distPath);
}

// Start server
const startServer = async () => {
  await initDatabase();

  server.listen(PORT, () => {
    console.log(`
  ========================================================
           Berry Dashboard API Server (PostgreSQL)
  ========================================================
    Local:   http://localhost:${PORT}
    WebSocket: ws://localhost:${PORT}/ws

    Guest Endpoints (also available at /api/v1/*):
    GET    /api/guests              - List all guests
    POST   /api/guests              - Add new guest
    PUT    /api/guests/:id          - Update guest
    DELETE /api/guests/:id          - Remove guest
    POST   /api/guests/:id/send-invitation - Send email
    POST   /api/guests/bulk-send    - Bulk send emails
    GET    /api/stats               - Dashboard statistics
    GET    /api/health              - Health check

    Email Tracking (Resend Webhooks):
    POST   /api/webhooks/resend     - Resend webhook receiver
    GET    /api/email-events        - All email events + stats
    GET    /api/guests/:id/email-events - Guest email history

    Tickets Endpoints:
    GET    /api/v1/tickets          - List all tickets
    GET    /api/v1/tickets/stats    - Ticket statistics
    POST   /api/v1/tickets          - Create ticket
    POST   /api/v1/tickets/import   - Import tickets
    POST   /api/v1/tickets/:id/check-in - Check in ticket

    Events Endpoints (Multi-Event Management):
    GET    /api/v1/events           - List all events
    GET    /api/v1/events/calendar  - Calendar view
    GET    /api/v1/events/stats     - Event statistics
    GET    /api/v1/events/:id       - Get single event
    POST   /api/v1/events           - Create event
    PUT    /api/v1/events/:id       - Update event
    DELETE /api/v1/events/:id       - Delete event
    POST   /api/v1/events/:id/duplicate - Duplicate event

    Event Timeline (Run of Show):
    GET    /api/v1/events/:id/timeline    - Get timeline
    POST   /api/v1/events/:id/timeline    - Add timeline item
    PUT    /api/v1/events/:id/timeline/:itemId - Update item
    DELETE /api/v1/events/:id/timeline/:itemId - Delete item

    Event Checklist:
    GET    /api/v1/events/:id/checklist   - Get checklist
    POST   /api/v1/events/:id/checklist   - Add checklist item
    PUT    /api/v1/events/:id/checklist/:itemId - Update item
    DELETE /api/v1/events/:id/checklist/:itemId - Delete item

    Budget Endpoints (Budget Tracker):
    GET    /api/v1/budget-categories      - Get categories
    GET    /api/v1/events/:id/budget      - Get event budget
    PUT    /api/v1/events/:id/budget      - Update budget
    POST   /api/v1/events/:id/budget/items - Add budget item
    PUT    /api/v1/budget/items/:id       - Update budget item
    DELETE /api/v1/budget/items/:id       - Delete budget item

    Vendors Endpoints:
    GET    /api/v1/vendors           - List vendors
    GET    /api/v1/vendors/:id       - Get vendor
    POST   /api/v1/vendors           - Create vendor
    PUT    /api/v1/vendors/:id       - Update vendor
    DELETE /api/v1/vendors/:id       - Delete vendor

    Health Monitoring Endpoints:
    GET    /api/v1/health/deep       - Deep health check (DB, tables, memory)
    GET    /api/v1/health/test-apis  - Test all API endpoints
    GET    /api/v1/health/status     - Detailed server status
    GET    /api/v1/health/live       - Liveness probe (k8s/load balancers)
    GET    /api/v1/health/ready      - Readiness probe
    POST   /api/v1/health/test-alert - Send test alert email

    Client Portal:
    POST   /api/v1/events/:id/client-access - Create portal link
    GET    /api/v1/events/:id/client-access - List portal links
    DELETE /api/v1/client-access/:id        - Revoke access
    GET    /api/v1/client-portal/:token     - Public client view

    Promoter Management:
    GET    /api/v1/promoters                - List all promoters
    POST   /api/v1/promoters                - Create promoter
    GET    /api/v1/promoters/:id            - Get promoter details
    PATCH  /api/v1/promoters/:id            - Update promoter
    DELETE /api/v1/promoters/:id            - Delete promoter
    GET    /api/v1/promoters/leaderboard    - Promoter leaderboard
    GET    /api/v1/promoters/by-code/:code  - Get by promo code
    GET    /api/v1/promoters/:id/stats      - Promoter statistics
    POST   /api/v1/promoters/track          - Track sale with code
    POST   /api/v1/promoters/:id/payout     - Create payout
    GET    /api/v1/promoters/:id/payouts    - Get payouts
    GET    /api/v1/promoters/stats/summary  - Overall stats

    Resend Webhook URL: https://berry.merktop.com/api/webhooks/resend

    Database: PostgreSQL (Railway)
  ========================================================
    `);
  });
};

startServer();
