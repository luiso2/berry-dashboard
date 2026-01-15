// ChatGPTView - ChatGPT integration page

export function ChatGPTView() {
  const features = [
    { icon: '📅', title: 'Manage Events', desc: 'Create, update, and track all your events' },
    { icon: '👥', title: 'Guest Lists', desc: 'Add guests, send invitations, track RSVPs' },
    { icon: '🎫', title: 'Tickets & Sales', desc: 'Monitor ticket sales and check-ins' },
    { icon: '💎', title: 'Sponsors', desc: 'Track sponsorships and send portal emails' },
    { icon: '👔', title: 'Staff Management', desc: 'Assign staff and manage schedules' },
    { icon: '💰', title: 'Budget Tracking', desc: 'Monitor expenses and financial health' },
    { icon: '🔌', title: 'Integrations', desc: 'Sync with Eventbrite, Mailchimp, Telnyx' },
    { icon: '💻', title: 'Code Access', desc: 'Read and write project code files' },
  ];

  const exampleCommands = [
    '"Show me the dashboard overview"',
    '"Create a new event called NYE Gala 2025 on December 31st"',
    '"Add John Smith to the guest list for the next event"',
    '"How many tickets have been sold this month?"',
    '"Send invitation emails to all pending guests"',
    '"Show me the project code structure"',
    '"Search for useState in the codebase"',
  ];

  return (
    <div className="page-content" style={{ padding: 32, animation: 'fadeIn 0.3s ease' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>ChatGPT Integration</h2>
        <p style={{ color: '#666', margin: '8px 0 0', fontSize: 14 }}>
          Connect your dashboard to ChatGPT for AI-powered management
        </p>
      </div>

      {/* Connection Status Card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16,163,127,0.1) 0%, rgba(16,163,127,0.05) 100%)',
        border: '1px solid rgba(16,163,127,0.3)',
        borderRadius: 16,
        padding: 24,
        marginBottom: 24
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56,
              height: 56,
              background: '#10a37f',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 10
            }}>
              <svg viewBox="0 0 24 24" fill="white" style={{ width: '100%', height: '100%' }}>
                <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4006-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Berry Bly Event Manager</h3>
              <p style={{ margin: '4px 0 0', color: '#10a37f', fontSize: 14 }}>Your AI Event Assistant</p>
            </div>
          </div>
          <a
            href="https://chatgpt.com/g/g-69648e5d8138819190a936f054f6dba6-berry-bly-event-manager"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#10a37f',
              color: '#fff',
              padding: '12px 24px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            Open in ChatGPT →
          </a>
        </div>
      </div>

      {/* What ChatGPT Can Do */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>What ChatGPT Can Do</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {features.map((item, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: 16
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
              <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>{item.title}</h4>
              <p style={{ margin: 0, fontSize: 13, color: '#888' }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How to Use */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>How to Use</h3>
        <div style={{ background: '#111', borderRadius: 12, padding: 20 }}>
          <ol style={{ margin: 0, paddingLeft: 20, color: '#ccc', lineHeight: 2 }}>
            <li>Click "Open in ChatGPT" to access your assistant</li>
            <li>Authenticate with your Berry Dashboard account when prompted</li>
            <li>Start managing your events with natural language commands</li>
          </ol>
        </div>
      </div>

      {/* Example Commands */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>Example Commands</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {exampleCommands.map((cmd, i) => (
            <div key={i} style={{
              background: '#0a0a0a',
              border: '1px solid #222',
              borderRadius: 8,
              padding: '12px 16px',
              fontFamily: 'monospace',
              fontSize: 13,
              color: '#10a37f'
            }}>
              {cmd}
            </div>
          ))}
        </div>
      </div>

      {/* API Endpoint Info */}
      <div style={{
        background: 'rgba(59,130,246,0.1)',
        border: '1px solid rgba(59,130,246,0.3)',
        borderRadius: 12,
        padding: 20
      }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#3b82f6' }}>Developer Info</h4>
        <div style={{ fontSize: 13, color: '#888' }}>
          <p style={{ margin: '0 0 8px' }}>
            <strong>API Endpoint:</strong>{' '}
            <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 4 }}>POST /api/v1/gpt/session</code>
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <strong>Code Access:</strong>{' '}
            <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 4 }}>POST /api/v1/gpt/code</code>
          </p>
          <p style={{ margin: 0 }}>
            <strong>OpenAPI Spec:</strong>{' '}
            <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 4 }}>/server/openapi-gpt.yaml</code>
          </p>
        </div>
      </div>
    </div>
  );
}
