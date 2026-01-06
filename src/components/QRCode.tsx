// Simple QR Code component using Google Charts API
// For production, consider using a library like qrcode.react

interface QRCodeProps {
  data: string;
  size?: number;
}

export function QRCode({ data, size = 150 }: QRCodeProps) {
  const encodedData = encodeURIComponent(data);
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedData}&bgcolor=0a0a0a&color=ffffff`;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
    }}>
      <img
        src={url}
        alt="QR Code"
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          border: '2px solid #1a1a1a',
        }}
      />
      <span style={{ fontSize: 11, color: '#666', maxWidth: size, textAlign: 'center', wordBreak: 'break-all' }}>
        {data.length > 30 ? data.slice(0, 30) + '...' : data}
      </span>
    </div>
  );
}

// Generate check-in URL for a guest
export function generateCheckInUrl(guestId: string | number, eventId?: number): string {
  const baseUrl = window.location.origin;
  const params = new URLSearchParams({
    guest: String(guestId),
    ...(eventId && { event: String(eventId) }),
  });
  return `${baseUrl}/check-in?${params}`;
}

// Generate QR data for a guest (JSON format for scanning apps)
export function generateGuestQRData(guest: {
  id: string | number;
  name: string;
  partySize: number;
  eventId?: number;
}): string {
  return JSON.stringify({
    type: 'berry-checkin',
    guestId: guest.id,
    name: guest.name,
    partySize: guest.partySize,
    eventId: guest.eventId,
    timestamp: Date.now(),
  });
}
