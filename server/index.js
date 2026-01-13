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

// API Version - for tracking deployments
const API_VERSION = '3.1.0-websocket';

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
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_oauth_tokens_access ON oauth_tokens(access_token);
      CREATE INDEX IF NOT EXISTS idx_oauth_tokens_code ON oauth_tokens(code);
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
        event_id VARCHAR(50) NOT NULL,
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
      CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
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

    dbInitStatus.completed = true;
    console.log('Database tables initialized successfully (guests, email_events, tickets, activity_log, sponsors, events, budgets, vendors, staff, contracts, client_access, integrations)');
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

// CORS configuration - Allow dashboard and landing domains
const allowedOrigins = [
  'https://berrydashboard.merktop.com',
  'https://berry-dashboard.up.railway.app',
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

// Middleware - CORS with specific origins
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, true); // Allow all for now, log blocked
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
      await pool.query('DELETE FROM oauth_tokens WHERE user_id = $1', [user.rows[0].id]);
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
    const result = await pool.query('SELECT * FROM guests ORDER BY created_at DESC');
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

  try {
    const result = await pool.query(
      `INSERT INTO guests (name, email, phone, instagram, party_size, event_date, notes, category, email_sent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', false, CURRENT_TIMESTAMP)
       RETURNING *`,
      [name, email, phone || '', instagram || '', normalizedPartySize, eventDate || null,
       normalizedEventId ? `Event: ${normalizedEventId}\n${normalizedNotes}` : normalizedNotes]
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
    const query = `UPDATE guests SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
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
  try {
    const result = await pool.query('DELETE FROM guests WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting guest:', error);
    res.status(500).json({ error: 'Failed to delete guest' });
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

// Helper to transform guest to guest-list format (for frontend compatibility)
const transformToGuestList = (row) => ({
  id: String(row.id),
  eventId: (row.notes && row.notes.match(/Event: (\S+)/)?.[1]) || 'default',
  name: row.name,
  email: row.email,
  phone: row.phone || '',
  instagram: row.instagram || '',
  numberOfGuests: row.party_size,
  vipPreferences: row.notes?.includes('VIP:') ? row.notes.split('VIP:')[1]?.split('\n')[0]?.trim() : '',
  status: row.category === 'pending' ? 'pending' : row.category === 'A' || row.category === 'B' ? 'approved' : 'declined',
  notes: row.notes || '',
  emailSent: row.email_sent,
  emailSentAt: row.email_sent_at ? row.email_sent_at.toISOString() : null,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.created_at.toISOString(),
});

// GET /api/v1/guest-lists - List all guests (LOCAL)
app.get('/api/v1/guest-lists', async (req, res) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query;

    let queryText = 'SELECT * FROM guests WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Map status to category
    if (status) {
      if (status === 'pending') {
        queryText += ` AND category = $${paramIndex++}`;
        params.push('pending');
      } else if (status === 'approved') {
        queryText += ` AND category IN ('A', 'B')`;
      } else if (status === 'declined') {
        queryText += ` AND category = $${paramIndex++}`;
        params.push('C');
      }
    }

    queryText += ' ORDER BY created_at DESC';
    queryText += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(queryText, params);
    const entries = result.rows.map(transformToGuestList);

    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) as total FROM guests');
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

// GET /api/v1/guest-lists/stats - Get statistics (LOCAL)
app.get('/api/v1/guest-lists/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE category = 'pending') as pending,
        COUNT(*) FILTER (WHERE category IN ('A', 'B')) as approved,
        COUNT(*) FILTER (WHERE category = 'C') as declined,
        COALESCE(SUM(party_size), 0) as total_guests
      FROM guests
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

// GET /api/v1/guest-lists/:id - Get single guest (LOCAL)
app.get('/api/v1/guest-lists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM guests WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Guest not found' });
    }

    res.json(transformToGuestList(result.rows[0]));
  } catch (error) {
    console.error('Error fetching guest:', error);
    res.status(500).json({ error: 'Failed to fetch guest' });
  }
});

// POST /api/v1/guest-lists - Create guest (LOCAL)
app.post('/api/v1/guest-lists', async (req, res) => {
  const { name, email, phone, instagram, numberOfGuests, vipPreferences, eventId } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  try {
    const notes = [
      eventId ? `Event: ${eventId}` : '',
      vipPreferences ? `VIP: ${vipPreferences}` : ''
    ].filter(Boolean).join('\n');

    const result = await pool.query(
      `INSERT INTO guests (name, email, phone, instagram, party_size, notes, category, email_sent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', false, CURRENT_TIMESTAMP)
       RETURNING *`,
      [name, email, phone || '', instagram || '', numberOfGuests || 1, notes]
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

// PATCH /api/v1/guest-lists/:id - Update guest (LOCAL)
app.patch('/api/v1/guest-lists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    // Map status to category
    let category = null;
    if (status === 'approved') category = 'A';
    else if (status === 'pending') category = 'pending';
    else if (status === 'declined' || status === 'rejected') category = 'C';

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (category) {
      updates.push(`category = $${paramIndex++}`);
      params.push(category);
    }
    if (notes !== undefined) {
      updates.push(`notes = COALESCE(notes, '') || $${paramIndex++}`);
      params.push('\n' + notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE guests SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
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

// DELETE /api/v1/guest-lists/:id - Delete guest (LOCAL)
app.delete('/api/v1/guest-lists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM guests WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Guest not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting guest:', error);
    res.status(500).json({ error: 'Failed to delete guest' });
  }
});

// POST /api/v1/guest-lists/:id/send-invitation - Send invitation email (LOCAL)
app.post('/api/v1/guest-lists/:id/send-invitation', async (req, res) => {
  const { id } = req.params;
  const { category, customMessage, emailOnly } = req.body;

  try {
    // 1. Fetch guest from LOCAL database
    const result = await pool.query('SELECT * FROM guests WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Guest not found' });
    }

    const guestRow = result.rows[0];
    const guest = transformGuest(guestRow);
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

    // 4. Update guest status in LOCAL database
    const newCategory = category === 'C' || category === 'rejected' ? 'C' : guestCategory;
    await pool.query(
      `UPDATE guests SET category = $1, email_sent = true, email_sent_at = CURRENT_TIMESTAMP,
       notes = COALESCE(notes, '') || $2 WHERE id = $3`,
      [emailOnly ? guestRow.category : newCategory, `\n📧 Email sent: ${new Date().toISOString()}`, id]
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

// POST /api/v1/guest-lists/bulk-send - Send invitations to multiple guests (LOCAL)
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
      // Fetch guest from LOCAL database
      const result = await pool.query('SELECT * FROM guests WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        errors.push({ id, error: 'Guest not found' });
        continue;
      }

      const guest = transformGuest(result.rows[0]);
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

      // Update guest status in LOCAL database
      await pool.query(
        `UPDATE guests SET category = $1, email_sent = true, email_sent_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [guestCategory, id]
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
    let queryText = 'SELECT * FROM tickets WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (eventId) {
      queryText += ` AND event_id = $${paramIndex++}`;
      params.push(eventId);
    }
    if (status) {
      queryText += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    queryText += ' ORDER BY created_at DESC';
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
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'valid') as valid,
        COUNT(*) FILTER (WHERE status = 'used') as used,
        COALESCE(SUM(price), 0) as revenue
      FROM tickets
    `);

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
    const { eventId, ticketType, holderName, holderEmail, price, source } = req.body;
    const ticketId = generateTicketId();

    const result = await pool.query(
      `INSERT INTO tickets (id, event_id, ticket_type, holder_name, holder_email, price, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [ticketId, eventId || 'default', ticketType || 'General', holderName, holderEmail, price || 0, source || 'manual']
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
    const { tickets, eventId } = req.body;

    if (!Array.isArray(tickets)) {
      return res.status(400).json({ error: 'tickets must be an array' });
    }

    const imported = [];
    for (const ticket of tickets) {
      const ticketId = generateTicketId();
      await pool.query(
        `INSERT INTO tickets (id, event_id, ticket_type, holder_name, holder_email, external_id, price)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          ticketId,
          eventId || 'default',
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

// Activity Log endpoints removed for simplification

// ============================================
// SPONSORS ENDPOINTS
// ============================================

// Sponsorship tier details
const sponsorshipTiers = {
  bronze: { name: 'Bronze Partner', price: '$5,000' },
  silver: { name: 'Silver Partner', price: '$15,000' },
  gold: { name: 'Gold Partner', price: '$35,000' },
  platinum: { name: 'Platinum Partner', price: '$75,000' },
  title: { name: 'Title Sponsor', price: '$150,000+' },
  custom: { name: 'Custom Partnership', price: 'TBD' },
};

// Helper to generate sponsor ID
const generateSponsorId = () => `spo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// GET /api/v1/sponsors/tiers - Get sponsorship tier information
app.get('/api/v1/sponsors/tiers', async (req, res) => {
  res.json({
    tiers: Object.entries(sponsorshipTiers).map(([value, details]) => ({
      value,
      ...details,
    })),
  });
});

// GET /api/v1/sponsors/stats - Get sponsor statistics
app.get('/api/v1/sponsors/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as active,
        COUNT(*) FILTER (WHERE status = 'contacted') as contacted
      FROM sponsors
    `);

    const stats = result.rows[0];
    res.json({
      total: parseInt(stats.total || 0),
      pending: parseInt(stats.pending || 0),
      active: parseInt(stats.active || 0),
      contacted: parseInt(stats.contacted || 0),
      revenue: 0, // Calculate based on approved sponsors
    });
  } catch (error) {
    console.error('Error fetching sponsor stats:', error);
    res.status(500).json({ error: 'Failed to fetch sponsor stats' });
  }
});

// POST /api/v1/sponsors - Submit sponsor inquiry (public)
app.post('/api/v1/sponsors', async (req, res) => {
  try {
    const { companyName, contactName, email, phone, website, sponsorshipTier, message } = req.body;

    if (!companyName || !contactName || !email || !message) {
      return res.status(400).json({ error: 'Company name, contact name, email and message are required' });
    }

    const sponsorId = generateSponsorId();
    const tier = sponsorshipTier || 'custom';
    const tierInfo = sponsorshipTiers[tier] || sponsorshipTiers.custom;

    const result = await pool.query(
      `INSERT INTO sponsors (id, company_name, contact_name, email, phone, website, sponsorship_tier, tier_name, tier_price, message, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
       RETURNING *`,
      [sponsorId, companyName, contactName, email, phone || '', website || '', tier, tierInfo.name, tierInfo.price, message]
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
    const { status, notes, logoUrl } = req.body;

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
        let query = 'SELECT * FROM events WHERE (user_id = $1 OR user_id IS NULL)';
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
        const result = await pool.query('SELECT * FROM events WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [eventId, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
        return res.json({ success: true, event: mapEventRow(result.rows[0]) });
      }

      case 'getFull': {
        if (!eventId) return res.status(400).json({ error: 'eventId required' });
        // Reuse the full event logic
        const eventResult = await pool.query('SELECT * FROM events WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [eventId, userId]);
        if (eventResult.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
        const event = mapEventRow(eventResult.rows[0]);

        let guests = { total: 0, list: [] };
        const guestsCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'guests')`);
        if (guestsCheck.rows[0].exists) {
          const guestsResult = await pool.query('SELECT * FROM guests WHERE (user_id = $1 OR user_id IS NULL)', [userId]);
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
        const checkUpdate = await pool.query('SELECT * FROM events WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [eventId, userId]);
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
        const checkDel = await pool.query('SELECT * FROM events WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [eventId, userId]);
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
    const { action, guestId, eventId, data, filters } = req.body;
    const userId = req.user?.id;

    switch (action) {
      case 'list': {
        const { category, search, limit = 100 } = filters || {};
        let query = 'SELECT * FROM guests WHERE (user_id = $1 OR user_id IS NULL)';
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
        const result = await pool.query('SELECT * FROM guests WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [guestId, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
        return res.json({ success: true, guest: result.rows[0] });
      }

      case 'add': {
        const { name, email, phone, instagram, partySize, category, notes } = data || {};
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
        const checkUpd = await pool.query('SELECT * FROM guests WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [guestId, userId]);
        if (checkUpd.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
        const fields = [];
        const values = [];
        let idx = 1;
        const allowedFields = ['name', 'email', 'phone', 'instagram', 'party_size', 'status', 'notes'];
        const fieldMap = { partySize: 'party_size', category: 'status' };
        for (const [key, value] of Object.entries(data || {})) {
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
        emitNotification(userId, 'updated', 'guest', { id: guestId, name: checkUpd.rows[0].name, ...data });
        return res.json({ success: true, message: 'Guest updated' });
      }

      case 'delete': {
        if (!guestId) return res.status(400).json({ error: 'guestId required' });
        // Verify ownership
        const checkDel = await pool.query('SELECT * FROM guests WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [guestId, userId]);
        if (checkDel.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
        const deletedGuest = checkDel.rows[0];
        await pool.query('DELETE FROM guests WHERE id = $1', [guestId]);
        // Emit WebSocket notification
        emitNotification(userId, 'deleted', 'guest', deletedGuest);
        return res.json({ success: true, message: 'Guest removed' });
      }

      case 'approve': {
        if (!guestId) return res.status(400).json({ error: 'guestId required' });
        const checkAppr = await pool.query('SELECT * FROM guests WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [guestId, userId]);
        if (checkAppr.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
        await pool.query('UPDATE guests SET status = $1 WHERE id = $2', ['approved', guestId]);
        // Emit WebSocket notification
        emitNotification(userId, 'approved', 'guest', { id: guestId, name: checkAppr.rows[0].name });
        return res.json({ success: true, message: 'Guest approved' });
      }

      case 'reject': {
        if (!guestId) return res.status(400).json({ error: 'guestId required' });
        const checkRej = await pool.query('SELECT * FROM guests WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [guestId, userId]);
        if (checkRej.rows.length === 0) return res.status(404).json({ error: 'Guest not found' });
        await pool.query('UPDATE guests SET status = $1 WHERE id = $2', ['rejected', guestId]);
        // Emit WebSocket notification
        emitNotification(userId, 'rejected', 'guest', { id: guestId, name: checkRej.rows[0].name });
        return res.json({ success: true, message: 'Guest rejected' });
      }

      case 'checkIn': {
        if (!guestId) return res.status(400).json({ error: 'guestId required' });
        const checkIn = await pool.query('SELECT * FROM guests WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [guestId, userId]);
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
          FROM guests WHERE (user_id = $1 OR user_id IS NULL)
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
        const result = await pool.query('SELECT * FROM staff WHERE (user_id = $1 OR user_id IS NULL) ORDER BY name', [userId]);
        return res.json({ success: true, staff: result.rows });
      }

      case 'get': {
        if (!staffId) return res.status(400).json({ error: 'staffId required' });
        const result = await pool.query('SELECT * FROM staff WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [staffId, userId]);
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
        const check = await pool.query('SELECT id FROM staff WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [staffId, userId]);
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
        await pool.query('DELETE FROM staff WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [staffId, userId]);
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
        let query = 'SELECT * FROM vendors WHERE (user_id = $1 OR user_id IS NULL)';
        const values = [userId];
        if (category) { query += ` AND category = $${values.length + 1}`; values.push(category); }
        if (isPreferred !== undefined) { query += ` AND is_preferred = $${values.length + 1}`; values.push(isPreferred); }
        query += ' ORDER BY name';
        const result = await pool.query(query, values);
        return res.json({ success: true, vendors: result.rows });
      }

      case 'get': {
        if (!vendorId) return res.status(400).json({ error: 'vendorId required' });
        const result = await pool.query('SELECT * FROM vendors WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [vendorId, userId]);
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
        const checkVUpd = await pool.query('SELECT * FROM vendors WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [vendorId, userId]);
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
        const checkVDel = await pool.query('SELECT * FROM vendors WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [vendorId, userId]);
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
        let query = 'SELECT * FROM models WHERE (user_id = $1 OR user_id IS NULL)';
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
        const result = await pool.query('SELECT * FROM models WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [modelId, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Model not found' });
        return res.json({ success: true, model: result.rows[0] });
      }

      case 'updateStatus': {
        if (!modelId) return res.status(400).json({ error: 'modelId required' });
        const { status } = data || {};
        if (!['pending', 'approved', 'declined', 'assigned'].includes(status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }
        await pool.query('UPDATE models SET status = $1 WHERE id = $2 AND (user_id = $3 OR user_id IS NULL)', [status, modelId, userId]);
        return res.json({ success: true, message: `Model ${status}` });
      }

      case 'stats': {
        const result = await pool.query(`
          SELECT COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'pending') as pending,
            COUNT(*) FILTER (WHERE status = 'approved') as approved,
            COUNT(*) FILTER (WHERE status = 'assigned') as assigned
          FROM models WHERE (user_id = $1 OR user_id IS NULL)
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
        const { ticketType, holderName, holderEmail, price } = data || {};
        if (!eventId || !ticketType) return res.status(400).json({ error: 'eventId and ticketType required' });
        const ticketCode = crypto.randomBytes(8).toString('hex').toUpperCase();
        const result = await pool.query(`
          INSERT INTO tickets (event_id, ticket_type, holder_name, holder_email, price, ticket_code, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'valid') RETURNING *
        `, [eventId, ticketType, holderName, holderEmail, price || 0, ticketCode]);
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
        const result = await pool.query('SELECT * FROM sponsors WHERE (user_id = $1 OR user_id IS NULL) ORDER BY created_at DESC', [userId]);
        return res.json({ success: true, sponsors: result.rows });
      }

      case 'get': {
        if (!sponsorId) return res.status(400).json({ error: 'sponsorId required' });
        const result = await pool.query('SELECT * FROM sponsors WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [sponsorId, userId]);
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
        const checkSUpd = await pool.query('SELECT * FROM sponsors WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [sponsorId, userId]);
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
          FROM sponsors WHERE (user_id = $1 OR user_id IS NULL)
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
    eventId, guestId, staffId, vendorId, modelId, sponsorId, reservationId, ticketId, itemId, assignmentId,
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
      validEndpoints: ['manageEvents', 'manageGuests', 'manageBudget', 'manageStaff', 'manageVendors', 'manageModels', 'manageTables', 'manageTickets', 'manageSponsors', 'getDashboard']
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
    eventId, guestId, staffId, vendorId, modelId, sponsorId, reservationId, ticketId, itemId, assignmentId,
    filters,
    data: Object.keys(mergedData).length > 0 ? mergedData : undefined
  };

  // Clean undefined values
  Object.keys(req.body).forEach(key => req.body[key] === undefined && delete req.body[key]);

  return app._router.handle(req, res, () => {});
});

// ============================================
// EVENTS ENDPOINTS
// ============================================

// GET /api/v1/events - Get all events with optional filters
app.get('/api/v1/events', async (req, res) => {
  try {
    const { status, upcoming, featured, limit = 50 } = req.query;
    let query = 'SELECT * FROM events';
    const conditions = [];
    const values = [];
    let paramCount = 1;

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
    const currentYear = year || new Date().getFullYear();
    const currentMonth = month || new Date().getMonth() + 1;

    const result = await pool.query(
      `SELECT id, title, date, status, venue
       FROM events
       WHERE EXTRACT(YEAR FROM date) = $1
       AND EXTRACT(MONTH FROM date) = $2
       ORDER BY date`,
      [currentYear, currentMonth]
    );

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
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'upcoming') as upcoming,
        COUNT(*) FILTER (WHERE status = 'ongoing') as ongoing,
        COUNT(*) FILTER (WHERE status = 'past') as past,
        COUNT(*) FILTER (WHERE date >= CURRENT_DATE) as upcoming_by_date,
        COUNT(*) FILTER (WHERE date < CURRENT_DATE) as past_by_date
      FROM events
    `);

    const thisMonth = await pool.query(`
      SELECT COUNT(*) as count FROM events
      WHERE EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)
      AND EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)
    `);

    // Try to get category stats if column exists
    let categoryStats = {};
    try {
      const byCategory = await pool.query(`
        SELECT category, COUNT(*) as count FROM events WHERE category IS NOT NULL GROUP BY category
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

// GET /api/v1/events/:id - Get single event with details
app.get('/api/v1/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM events WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

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
      queries.push(pool.query('SELECT COUNT(*) FROM guest_lists WHERE event_id = $1', [id]).then(r => { guestsCount = parseInt(r.rows[0].count); }));
    } else if (existingTables.includes('guests')) {
      queries.push(pool.query('SELECT COUNT(*) FROM guests WHERE event_id = $1', [id]).then(r => { guestsCount = parseInt(r.rows[0].count); }));
    }

    if (existingTables.includes('tickets')) {
      // Try event_ref_id first, fallback to event_id
      queries.push(
        pool.query('SELECT COUNT(*) FROM tickets WHERE event_ref_id = $1 OR event_id::text = $1', [id])
          .then(r => { ticketsCount = parseInt(r.rows[0].count); })
          .catch(() => { ticketsCount = 0; })
      );
    }

    if (existingTables.includes('sponsors')) {
      queries.push(
        pool.query('SELECT COUNT(*) FROM sponsors WHERE event_id = $1', [id])
          .then(r => { sponsorsCount = parseInt(r.rows[0].count); })
          .catch(() => { sponsorsCount = 0; })
      );
    }

    if (existingTables.includes('budgets')) {
      queries.push(
        pool.query('SELECT COALESCE(SUM(total_budget), 0) as budget FROM budgets WHERE event_id = $1', [id])
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

    // Generate next ID
    const maxIdResult = await pool.query('SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) + 1 as next_id FROM events');
    const nextId = maxIdResult.rows[0].next_id;

    // Use actual database columns: title, date, venue, category, status
    const result = await pool.query(
      `INSERT INTO events (id, title, date, venue, category, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [nextId.toString(), name, eventDate, venue, category, status || 'planning']
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

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
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
    const userId = req.user?.id;

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
           JOIN events e ON sa.event_id = e.id
           WHERE sa.staff_id = s.id AND e.date >= CURRENT_DATE) as upcoming_events
        FROM staff s
        WHERE (s.user_id = $1 OR s.user_id IS NULL)
        ORDER BY s.created_at DESC
      `, [userId]);
    } else {
      result = await pool.query(`SELECT * FROM staff WHERE (user_id = $1 OR user_id IS NULL) ORDER BY created_at DESC`, [userId]);
    }

    // Get stats
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive,
        COUNT(*) as total,
        COALESCE(AVG(rating), 0) as avg_rating
      FROM staff WHERE (user_id = $1 OR user_id IS NULL)
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
      AND (s.user_id = $1 OR s.user_id IS NULL)
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

    const staffResult = await pool.query('SELECT * FROM staff WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [id, userId]);
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
      WHERE id = $18 AND (user_id = $19 OR user_id IS NULL)
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
    await pool.query('DELETE FROM staff WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [id, userId]);
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
    let query = 'SELECT * FROM models WHERE (user_id = $1 OR user_id IS NULL)';
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
      FROM models WHERE (user_id = $1 OR user_id IS NULL)
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
    const result = await pool.query('SELECT * FROM models WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [req.params.id, userId]);
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
    await pool.query('DELETE FROM models WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [req.params.id, userId]);
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
// EVENTBRITE SYNC - Import events and tickets
// ============================================

// POST /api/v1/integrations/eventbrite/sync - Sync events from Eventbrite
app.post('/api/v1/integrations/eventbrite/sync', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM integrations WHERE provider = $1', ['eventbrite']);
    const saved = result.rows[0];

    if (!saved?.api_key_encrypted || saved.status !== 'connected') {
      return res.status(400).json({ error: 'Eventbrite not connected' });
    }

    const apiKey = decryptApiKey(saved.api_key_encrypted);

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

        // Check if event already exists
        const existingEvent = await pool.query(
          'SELECT id FROM events WHERE external_id = $1 AND external_source = $2',
          [event.id, 'eventbrite']
        );

        const eventDate = event.start?.utc ? new Date(event.start.utc).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const startTime = event.start?.local ? event.start.local.split('T')[1]?.substring(0, 5) : null;
        const endTime = event.end?.local ? event.end.local.split('T')[1]?.substring(0, 5) : null;
        const eventStatus = event.status === 'live' ? 'upcoming' : (event.status === 'ended' ? 'past' : 'planning');

        if (existingEvent.rows.length > 0) {
          // Update existing event (use berry-bly schema: title, date, time, venue, category)
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
          `, [
            event.name?.text || 'Untitled Event',
            event.description?.text || '',
            eventDate,
            startTime,
            eventStatus,
            event.url || '',
            JSON.stringify(ticketTypes),
            event.logo?.url || null,
            event.id
          ]);
        } else {
          // Insert new event - use only core columns that definitely exist
          try {
            await pool.query(`
              INSERT INTO events (title, description, date, time, status, category, external_id, external_source, eventbrite_url)
              VALUES ($1, $2, $3, $4, $5, 'eventbrite', $6, 'eventbrite', $7)
            `, [
              event.name?.text || 'Untitled Event',
              event.description?.text || '',
              eventDate,
              startTime,
              eventStatus,
              event.id,
              event.url || ''
            ]);
            console.log(`✅ Inserted Eventbrite event: ${event.name?.text}`);
          } catch (insertErr) {
            console.error(`❌ Failed to insert event ${event.name?.text}:`, insertErr.message);
            insertErrors.push({ event: event.name?.text, error: insertErr.message });
            // Try fallback insert with minimal columns (name and event_date are required per schema)
            try {
              await pool.query(`
                INSERT INTO events (name, event_date, status)
                VALUES ($1, $2, $3)
              `, [
                event.name?.text || 'Untitled Event',
                eventDate,
                eventStatus
              ]);
              console.log(`✅ Inserted Eventbrite event with minimal columns: ${event.name?.text}`);
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
              INSERT INTO tickets (id, event_id, external_id, ticket_type, holder_name, holder_email, status, source, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, 'eventbrite', NOW())
              ON CONFLICT (id) DO UPDATE SET
                holder_name = $5,
                holder_email = $6,
                status = $7,
                updated_at = NOW()
            `, [
              ticketId,
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
          for (const attendee of (order.attendees || [])) {
            const ticketId = `eb_${attendee.id}`;
            await pool.query(`
              INSERT INTO tickets (id, event_id, external_id, ticket_type, holder_name, holder_email, status, source, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, 'eventbrite', NOW())
              ON CONFLICT (id) DO UPDATE SET
                holder_name = $5,
                holder_email = $6,
                status = $7,
                updated_at = NOW()
            `, [
              ticketId,
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

    Resend Webhook URL: https://berry.merktop.com/api/webhooks/resend

    Database: PostgreSQL (Railway)
  ========================================================
    `);
  });
};

startServer();
