import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (options) => {
  try {
    const response = await resend.emails.send({
      from: options.from || 'noreply@berrydashboard.com',
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
    });

    if (!response.data?.id) {
      throw new Error('Failed to send email');
    }

    return {
      success: true,
      emailId: response.data.id,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
};

export const getEmailStatus = async (emailId) => {
  try {
    const response = await resend.emails.get(emailId);
    return response;
  } catch (error) {
    console.error('Failed to get email status:', error);
    throw error;
  }
};

export const sendAdminConfirmation = async (sentGuests, category) => {
  const guestsList = sentGuests
    .map(g => `<li>${g.name} (${g.email}) - ${g.status}</li>`)
    .join('');

  await sendEmail({
    to: process.env.ADMIN_EMAIL,
    subject: `Invitations Sent - ${category}`,
    html: `
      <h2>Invitations Summary</h2>
      <p>Category: <strong>${category}</strong></p>
      <p>Total Invitations Sent: <strong>${sentGuests.length}</strong></p>
      <ul>${guestsList}</ul>
    `,
  });
};
