import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Resend } from 'resend';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const GUESTS_FILE = join(__dirname, 'guests.json');

// Resend setup - uses RESEND_API_KEY from .env
const resend = new Resend(process.env.RESEND_API_KEY);

// Email configuration
const EMAIL_CONFIG = {
  from: 'Berry Bly <onboarding@resend.dev>', // Change to your verified domain
  replyTo: 'berrybly@gmail.com',
  adminEmail: 'berrybly@gmail.com', // Admin confirmation email
};

// CORS configuration - Allow dashboard domains
const allowedOrigins = [
  'https://berrydashboard.merktop.com',
  'https://berry-dashboard.up.railway.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

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
          <h1 style="color: #d4af37; font-size: 28px; margin: 0;">✨ Berry Bly Dashboard</h1>
          <p style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-top: 8px;">Admin Notification</p>
        </div>

        <!-- Success Message -->
        <div style="background: linear-gradient(180deg, rgba(34, 197, 94, 0.1) 0%, transparent 100%); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 16px; padding: 30px; margin-bottom: 30px; text-align: center;">
          <div style="width: 60px; height: 60px; background: rgba(34, 197, 94, 0.2); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 30px;">✓</span>
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
          <p style="margin: 10px 0 0 0; color: #444;">© ${new Date().getFullYear()} Berry Bly Events Dashboard</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: EMAIL_CONFIG.adminEmail,
      subject: `✓ ${sentGuests.length} Invitation${sentGuests.length > 1 ? 's' : ''} Sent Successfully - Berry Bly`,
      html,
    });
    console.log(`📬 Admin confirmation sent to ${EMAIL_CONFIG.adminEmail}`);
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

// Helper functions
const readGuests = () => {
  try {
    const data = readFileSync(GUESTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
};

const writeGuests = (guests) => {
  writeFileSync(GUESTS_FILE, JSON.stringify(guests, null, 2));
};

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
            <h1 style="color: #d4af37; font-size: 32px; margin: 0;">✨ Berry Bly</h1>
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
                  <td style="padding: 8px 0; color: #ffffff; text-align: right;">${guest.partySize} ${guest.partySize > 1 ? 'guests' : 'guest'}</td>
                </tr>
                ${guest.eventDate ? `
                <tr>
                  <td style="padding: 8px 0; color: #666;">Event Date</td>
                  <td style="padding: 8px 0; color: #ffffff; text-align: right;">${new Date(guest.eventDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                </tr>
                ` : ''}
              </table>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; color: #666; font-size: 12px;">
            <p style="margin: 0 0 10px 0;">Questions? Reply to this email or contact us directly.</p>
            <p style="margin: 0; color: #444;">© ${new Date().getFullYear()} Berry Bly Events. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };
};

// GET /api/guests - Get all guests
app.get('/api/guests', (req, res) => {
  const guests = readGuests();
  res.json(guests);
});

// POST /api/guests - Add new guest (from landing page)
app.post('/api/guests', (req, res) => {
  const { name, email, phone, instagram, partySize, eventDate, notes } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const guests = readGuests();

  const newGuest = {
    id: Date.now().toString(),
    name,
    email,
    phone: phone || '',
    instagram: instagram || '',
    partySize: partySize || 1,
    eventDate: eventDate || '',
    notes: notes || '',
    category: 'pending',
    emailSent: false,
    createdAt: new Date().toISOString(),
  };

  guests.unshift(newGuest);
  writeGuests(guests);

  console.log(`✨ New guest added: ${name} (@${instagram || 'no instagram'})`);

  res.status(201).json(newGuest);
});

// PUT /api/guests/:id - Update guest (change category)
app.put('/api/guests/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const guests = readGuests();
  const index = guests.findIndex((g) => g.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  guests[index] = { ...guests[index], ...updates };
  writeGuests(guests);

  res.json(guests[index]);
});

// POST /api/guests/:id/send-invitation - Send invitation email
app.post('/api/guests/:id/send-invitation', async (req, res) => {
  const { id } = req.params;
  const { category, customMessage, emailOnly } = req.body;

  const guests = readGuests();
  const guest = guests.find((g) => g.id === id);

  if (!guest) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  const emailContent = generateInvitationEmail(guest, category, customMessage);

  try {
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
    const index = guests.findIndex((g) => g.id === id);
    if (emailOnly) {
      // Email only - don't change category
      guests[index] = { ...guests[index], emailSent: true, emailSentAt: new Date().toISOString() };
      console.log(`📧 Email only sent to ${guest.name} (${guest.email}) - Category unchanged`);
    } else {
      guests[index] = { ...guests[index], category, emailSent: true, emailSentAt: new Date().toISOString() };
      console.log(`📧 Invitation sent to ${guest.name} (${guest.email}) - Category: ${category}`);
    }
    writeGuests(guests);

    // Send confirmation to admin
    await sendAdminConfirmation([guest], emailOnly ? 'Email Only' : category);

    res.json({ success: true, emailId: data?.id, guest: guests[index] });
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

  const guests = readGuests();
  const results = [];
  const errors = [];

  for (const id of guestIds) {
    const guest = guests.find((g) => g.id === id);

    if (!guest) {
      errors.push({ id, error: 'Guest not found' });
      continue;
    }

    const guestCategory = category || guest.category || 'C';
    const customMessage = customMessages?.[id] || '';
    const emailContent = generateInvitationEmail(guest, guestCategory, customMessage);

    try {
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
      const index = guests.findIndex((g) => g.id === id);
      guests[index] = { ...guests[index], category: guestCategory, emailSent: true, emailSentAt: new Date().toISOString() };

      results.push({ id, email: guest.email, emailId: data?.id });
      console.log(`📧 Bulk send: ${guest.name} (${guest.email}) - Category: ${guestCategory}`);
    } catch (error) {
      errors.push({ id, email: guest.email, error: error.message });
    }
  }

  writeGuests(guests);

  // Send confirmation to admin with all successfully sent guests
  if (results.length > 0) {
    const sentGuestsList = results.map(r => {
      const g = guests.find(guest => guest.id === r.id);
      return g ? { name: g.name, email: g.email } : { name: 'Unknown', email: r.email };
    });
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
app.delete('/api/guests/:id', (req, res) => {
  const { id } = req.params;

  const guests = readGuests();
  const filtered = guests.filter((g) => g.id !== id);

  if (filtered.length === guests.length) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  writeGuests(filtered);
  res.json({ success: true });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════╗
  ║         Berry Dashboard API Server                    ║
  ╠═══════════════════════════════════════════════════════╣
  ║  Local:   http://localhost:${PORT}                       ║
  ║                                                       ║
  ║  Endpoints:                                           ║
  ║  GET    /api/guests              - List all           ║
  ║  POST   /api/guests              - Add new guest      ║
  ║  PUT    /api/guests/:id          - Update guest       ║
  ║  DELETE /api/guests/:id          - Remove guest       ║
  ║  POST   /api/guests/:id/send-invitation - Send email  ║
  ╚═══════════════════════════════════════════════════════╝
  `);
});
