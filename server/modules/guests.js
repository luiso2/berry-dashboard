import express from 'express';
import { sendEmail } from '../utils/email.js';

const router = express.Router();

const transformGuest = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  category: row.category,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createGuestRoutes = (pool) => {
  // Get all guests
  router.get('/', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM guests ORDER BY created_at DESC`
      );

      res.json({
        success: true,
        guests: result.rows.map(transformGuest),
        total: result.rows.length
      });
    } catch (error) {
      console.error('Error fetching guests:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch guests' });
    }
  });

  // Create guest
  router.post('/', async (req, res) => {
    const { name, email, phone, category } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email required' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO guests (name, email, phone, category)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name, email, phone, category || 'C']
      );

      res.json({
        success: true,
        guest: transformGuest(result.rows[0])
      });
    } catch (error) {
      console.error('Error creating guest:', error);
      res.status(500).json({ success: false, message: 'Failed to create guest' });
    }
  });

  // Update guest
  router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, category, status } = req.body;

    try {
      const result = await pool.query(
        `UPDATE guests 
         SET name = COALESCE($1, name),
             email = COALESCE($2, email),
             phone = COALESCE($3, phone),
             category = COALESCE($4, category),
             status = COALESCE($5, status),
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [name, email, phone, category, status, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Guest not found' });
      }

      res.json({
        success: true,
        guest: transformGuest(result.rows[0])
      });
    } catch (error) {
      console.error('Error updating guest:', error);
      res.status(500).json({ success: false, message: 'Failed to update guest' });
    }
  });

  // Delete guest
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        `DELETE FROM guests WHERE id = $1 RETURNING id`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Guest not found' });
      }

      res.json({ success: true, message: 'Guest deleted' });
    } catch (error) {
      console.error('Error deleting guest:', error);
      res.status(500).json({ success: false, message: 'Failed to delete guest' });
    }
  });

  // Send invitation
  router.post('/:id/send-invitation', async (req, res) => {
    const { id } = req.params;
    const { message } = req.body;

    try {
      const result = await pool.query(
        `SELECT * FROM guests WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Guest not found' });
      }

      const guest = result.rows[0];

      const emailResult = await sendEmail({
        to: guest.email,
        subject: 'You\'re invited!',
        html: `
          <h1>You're Invited!</h1>
          <p>${message || 'Join us for an amazing event!'}</p>
        `,
        emailType: 'invitation',
        relatedId: guest.id
      });

      res.json({
        success: emailResult.success,
        emailId: emailResult.emailId,
        message: emailResult.error || 'Invitation sent'
      });
    } catch (error) {
      console.error('Error sending invitation:', error);
      res.status(500).json({ success: false, message: 'Failed to send invitation' });
    }
  });

  return router;
};
