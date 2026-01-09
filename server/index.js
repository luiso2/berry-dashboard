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

    console.log('Database tables initialized successfully');
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

// CORS configuration - Allow dashboard domains
const allowedOrigins = [
  'https://berrydashboard.merktop.com',
  'https://berry-dashboard.up.railway.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

// Backend API del monorepo (source of truth para guest data)
const MONOREPO_API_URL = 'https://backend-production-b84e.up.railway.app/api/v1';

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

// POST /api/guests - Add new guest (from landing page)
app.post('/api/guests', async (req, res) => {
  const { name, email, phone, instagram, partySize, eventDate, notes } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO guests (name, email, phone, instagram, party_size, event_date, notes, category, email_sent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', false, CURRENT_TIMESTAMP)
       RETURNING *`,
      [name, email, phone || '', instagram || '', partySize || 1, eventDate || null, notes || '']
    );

    const newGuest = transformGuest(result.rows[0]);
    console.log(`New guest added: ${name} (@${instagram || 'no instagram'})`);
    res.status(201).json(newGuest);
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

app.post('/api/v1/guests', async (req, res) => {
  const { name, email, phone, instagram, partySize, eventDate, notes } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO guests (name, email, phone, instagram, party_size, event_date, notes, category, email_sent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', false, CURRENT_TIMESTAMP)
       RETURNING *`,
      [name, email, phone || '', instagram || '', partySize || 1, eventDate || null, notes || '']
    );
    const newGuest = transformGuest(result.rows[0]);
    console.log(`New guest added: ${name}`);
    res.status(201).json(newGuest);
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
// PROXY ROUTES TO MONOREPO BACKEND
// These routes fetch data from the monorepo backend
// and handle email sending via Resend
// ============================================

// GET /api/v1/guest-lists - Proxy to monorepo backend
app.get('/api/v1/guest-lists', async (req, res) => {
  try {
    const queryParams = new URLSearchParams(req.query).toString();
    const url = `${MONOREPO_API_URL}/guest-lists${queryParams ? '?' + queryParams : ''}`;
    const response = await fetch(url);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error proxying guest-lists:', error);
    res.status(500).json({ error: 'Failed to fetch guest lists' });
  }
});

// GET /api/v1/guest-lists/stats - Proxy stats
app.get('/api/v1/guest-lists/stats', async (req, res) => {
  try {
    const queryParams = new URLSearchParams(req.query).toString();
    const url = `${MONOREPO_API_URL}/guest-lists/stats${queryParams ? '?' + queryParams : ''}`;
    const response = await fetch(url);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error proxying stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/v1/guest-lists/:id - Get single guest from monorepo
app.get('/api/v1/guest-lists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await fetch(`${MONOREPO_API_URL}/guest-lists/${id}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error proxying guest:', error);
    res.status(500).json({ error: 'Failed to fetch guest' });
  }
});

// POST /api/v1/guest-lists - Create guest in monorepo
app.post('/api/v1/guest-lists', async (req, res) => {
  try {
    const response = await fetch(`${MONOREPO_API_URL}/guest-lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error creating guest:', error);
    res.status(500).json({ error: 'Failed to create guest' });
  }
});

// PATCH /api/v1/guest-lists/:id - Update guest in monorepo
app.patch('/api/v1/guest-lists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await fetch(`${MONOREPO_API_URL}/guest-lists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error updating guest:', error);
    res.status(500).json({ error: 'Failed to update guest' });
  }
});

// DELETE /api/v1/guest-lists/:id - Delete guest in monorepo
app.delete('/api/v1/guest-lists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await fetch(`${MONOREPO_API_URL}/guest-lists/${id}`, {
      method: 'DELETE',
    });
    if (response.status === 204) {
      return res.status(204).send();
    }
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error deleting guest:', error);
    res.status(500).json({ error: 'Failed to delete guest' });
  }
});

// POST /api/v1/guest-lists/:id/send-invitation - Send invitation email
// This is the main endpoint that fetches guest from monorepo and sends email via Resend
app.post('/api/v1/guest-lists/:id/send-invitation', async (req, res) => {
  const { id } = req.params;
  const { category, customMessage, emailOnly } = req.body;

  try {
    // 1. Fetch guest data from monorepo backend
    const guestResponse = await fetch(`${MONOREPO_API_URL}/guest-lists/${id}`);

    if (!guestResponse.ok) {
      const errorData = await guestResponse.json();
      return res.status(guestResponse.status).json(errorData);
    }

    const guest = await guestResponse.json();
    console.log(`Sending invitation to: ${guest.name} (${guest.email})`);

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
                  <td style="padding: 8px 0; color: #ffffff; text-align: right;">${guest.numberOfGuests || 1} ${(guest.numberOfGuests || 1) > 1 ? 'guests' : 'guest'}</td>
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
        hint: 'If using onboarding@resend.dev, you can only send to verified emails. Verify a domain at resend.com/domains'
      });
    }

    console.log(`✅ Email sent to ${guest.email} - Email ID: ${emailData?.id}`);

    // 4. Update guest status in monorepo (optional, if not emailOnly)
    if (!emailOnly) {
      try {
        await fetch(`${MONOREPO_API_URL}/guest-lists/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: category === 'rejected' ? 'rejected' : 'approved',
            notes: `Email sent: ${new Date().toISOString()}`
          }),
        });
      } catch (updateError) {
        console.error('Failed to update guest status:', updateError);
      }
    }

    // 5. Send admin confirmation
    await sendAdminConfirmation([{ name: guest.name, email: guest.email }], guestCategory);

    res.json({
      success: true,
      emailId: emailData?.id,
      guest: {
        id: guest.id,
        name: guest.name,
        email: guest.email,
        status: emailOnly ? guest.status : 'approved',
      }
    });

  } catch (error) {
    console.error('Send invitation error:', error);
    res.status(500).json({ error: 'Failed to send invitation', details: error.message });
  }
});

// POST /api/v1/guest-lists/bulk-send - Send invitations to multiple guests
app.post('/api/v1/guest-lists/bulk-send', async (req, res) => {
  const { guestIds, category, customMessages } = req.body;

  if (!guestIds || !Array.isArray(guestIds) || guestIds.length === 0) {
    return res.status(400).json({ error: 'guestIds array is required' });
  }

  const results = [];
  const errors = [];

  for (const id of guestIds) {
    try {
      // Fetch guest from monorepo
      const guestResponse = await fetch(`${MONOREPO_API_URL}/guest-lists/${id}`);
      if (!guestResponse.ok) {
        errors.push({ id, error: 'Guest not found' });
        continue;
      }

      const guest = await guestResponse.json();
      const customMessage = customMessages?.[id] || '';
      const guestCategory = category || 'A';
      const categoryNames = { A: 'VIP', B: 'Priority', C: 'Standard' };

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

      // Update guest status
      await fetch(`${MONOREPO_API_URL}/guest-lists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });

      results.push({ id, email: guest.email, emailId: data?.id, name: guest.name });
      console.log(`Bulk send: ${guest.name} (${guest.email})`);
    } catch (error) {
      errors.push({ id, error: error.message });
    }
  }

  // Send admin confirmation
  if (results.length > 0) {
    await sendAdminConfirmation(results.map(r => ({ name: r.name, email: r.email })), category || 'A');
  }

  res.json({
    success: true,
    sent: results.length,
    failed: errors.length,
    results,
    errors
  });
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

    Resend Webhook URL: https://berry.merktop.com/api/webhooks/resend

    Database: PostgreSQL (Railway)
  ========================================================
    `);
  });
};

startServer();
