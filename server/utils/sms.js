const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_PHONE_NUMBER = process.env.TELNYX_PHONE_NUMBER || '+19858539097';

export const sendSMS = async (to, message) => {
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
};
