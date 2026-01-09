import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { Resend } from 'resend';
import pg from 'pg';

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 8080;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Initialize database tables
const initDatabase = async () => {
  const client = await pool.connect();
  try {
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create email_events table for Resend webhook tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_events (
        id SERIAL PRIMARY KEY,
        email_id VARCHAR(255),
        guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
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

    console.log('Database tables initialized successfully (guests, email_events, tickets, activity_log)');
  } catch (error) {
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

// PUT /api/guests/:id - Update guest (change category, check-in, etc.)
app.put('/api/guests/:id', async (req, res) => {
  const { id } = req.params;
  const { category, checkedInAt, emailSent, emailSentAt, notes, partySize, phone, instagram } = req.body;

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
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (error) {
    res.json({ status: 'error', database: 'disconnected', timestamp: new Date().toISOString() });
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

// ============================================
// ACTIVITY LOG ENDPOINTS
// ============================================

// POST /api/v1/activity - Log an activity
app.post('/api/v1/activity', async (req, res) => {
  try {
    const { action, details, guestName, guestId, eventType } = req.body;

    const result = await pool.query(
      `INSERT INTO activity_log (action, details, guest_name, guest_id, event_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [action, details, guestName || null, guestId || null, eventType || 'system']
    );

    res.status(201).json({
      id: result.rows[0].id.toString(),
      action: result.rows[0].action,
      details: result.rows[0].details,
      guestName: result.rows[0].guest_name,
      type: result.rows[0].event_type,
      timestamp: result.rows[0].created_at,
    });
  } catch (error) {
    console.error('Error logging activity:', error);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

// GET /api/v1/activity - Get activity log
app.get('/api/v1/activity', async (req, res) => {
  try {
    const { limit = 100, type } = req.query;

    let queryText = 'SELECT * FROM activity_log';
    const params = [];

    if (type) {
      queryText += ' WHERE event_type = $1';
      params.push(type);
    }

    queryText += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(parseInt(limit));

    const result = await pool.query(queryText, params);

    const activities = result.rows.map(row => ({
      id: row.id.toString(),
      action: row.action,
      details: row.details,
      guestName: row.guest_name,
      type: row.event_type,
      timestamp: row.created_at,
    }));

    res.json(activities);
  } catch (error) {
    console.error('Error fetching activity log:', error);
    res.status(500).json({ error: 'Failed to fetch activity log' });
  }
});

// DELETE /api/v1/activity - Clear activity log
app.delete('/api/v1/activity', async (req, res) => {
  try {
    await pool.query('DELETE FROM activity_log');
    res.json({ success: true, message: 'Activity log cleared' });
  } catch (error) {
    console.error('Error clearing activity log:', error);
    res.status(500).json({ error: 'Failed to clear activity log' });
  }
});

// Start server
const startServer = async () => {
  await initDatabase();

  app.listen(PORT, () => {
    console.log(`
  ========================================================
           Berry Dashboard API Server (PostgreSQL)
  ========================================================
    Local:   http://localhost:${PORT}

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

    Activity Log Endpoints:
    GET    /api/v1/activity         - Get activity log
    POST   /api/v1/activity         - Log activity
    DELETE /api/v1/activity         - Clear activity log

    Resend Webhook URL: https://berry.merktop.com/api/webhooks/resend

    Database: PostgreSQL (Railway)
  ========================================================
    `);
  });
};

startServer();
