export const config = {
  // API Version
  apiVersion: '3.15.2-refactored',

  // Database
  database: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },

  // Email Configuration
  email: {
    from: process.env.RESEND_FROM_EMAIL || 'Berry Bly <noreply@merktop.com>',
    replyTo: process.env.RESEND_REPLY_TO || 'berrybly@gmail.com',
    adminEmail: process.env.ADMIN_EMAIL || 'berrybly@gmail.com',
  },

  // SMS Configuration
  sms: {
    apiKey: process.env.TELNYX_API_KEY,
    phoneNumber: process.env.TELNYX_PHONE_NUMBER || '+19858539097',
  },

  // Server Configuration
  server: {
    port: process.env.PORT || 8080,
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  // CORS Configuration
  cors: {
    allowedOrigins: [
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
    ],
  },

  // OAuth Configuration
  oauth: {
    bcryptRounds: 12,
    tokenExpiryHours: 24,
    codeTTLMinutes: 10,
    allowedRedirectUris: [
      'https://chat.openai.com/aip/g-faca3a52350bea551c80533e84c5eff01cc9dbcd/oauth/callback',
      'https://chat.openai.com',
      'https://chatgpt.com',
    ],
  },
};
