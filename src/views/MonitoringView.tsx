// MonitoringView - System health monitoring dashboard

import { useState, useCallback, useEffect } from 'react';
import type { HealthStatus, ServerStatus } from '../types';
import { API_URL } from '../constants';

interface MonitoringViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function MonitoringView({ onToast }: MonitoringViewProps) {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const fetchHealthStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const [healthRes, statusRes] = await Promise.all([
        fetch(`${API_URL}/health/deep`),
        fetch(`${API_URL}/health/status`),
      ]);

      if (healthRes.ok) {
        const health = await healthRes.json();
        setHealthStatus(health);
      }
      if (statusRes.ok) {
        const status = await statusRes.json();
        setServerStatus(status);
      }
      setLastCheck(new Date());
    } catch (error) {
      console.error('Error fetching health:', error);
      onToast('Error checking system health', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [onToast]);

  const sendTestAlert = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/health/test-alert`, { method: 'POST' });
      if (res.ok) {
        onToast('Test alert sent to admin email', 'success');
      } else {
        onToast('Failed to send test alert', 'error');
      }
    } catch (error) {
      onToast('Error sending test alert', 'error');
    }
  }, [onToast]);

  useEffect(() => {
    fetchHealthStatus();
  }, [fetchHealthStatus]);

  const statusColor = healthStatus?.status === 'healthy' ? '#22c55e'
    : healthStatus?.status === 'degraded' ? '#f59e0b' : '#ef4444';
  const statusBg = healthStatus?.status === 'healthy' ? '#22c55e20'
    : healthStatus?.status === 'degraded' ? '#f59e0b20' : '#ef444420';
  const statusBorder = healthStatus?.status === 'healthy' ? '#22c55e40'
    : healthStatus?.status === 'degraded' ? '#f59e0b40' : '#ef444440';

  return (
    <div className="page-content" style={{ padding: 32, animation: 'fadeIn 0.3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>System Monitoring</h2>
          <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0' }}>
            {lastCheck ? `Last check: ${lastCheck.toLocaleTimeString()}` : 'No health check yet'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={fetchHealthStatus}
            disabled={isLoading}
            className="btn-hover"
            style={{
              background: '#3b82f6', color: '#fff', border: 'none',
              padding: '10px 20px', borderRadius: 8, fontWeight: 600,
              cursor: 'pointer', opacity: isLoading ? 0.6 : 1
            }}
          >
            {isLoading ? 'Checking...' : 'Refresh Status'}
          </button>
          <button
            onClick={sendTestAlert}
            className="btn-hover"
            style={{
              background: '#f59e0b', color: '#000', border: 'none',
              padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer'
            }}
          >
            Send Test Alert
          </button>
        </div>
      </div>

      {/* Overall Status */}
      <div style={{
        background: statusBg,
        border: `1px solid ${statusBorder}`,
        borderRadius: 12,
        padding: 24,
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 16
      }}>
        <div style={{
          fontSize: 48,
          width: 80, height: 80,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0a0a0a',
          borderRadius: 12
        }}>
          {healthStatus?.status === 'healthy' ? '✅' : healthStatus?.status === 'degraded' ? '⚠️' : '❌'}
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, textTransform: 'capitalize', color: statusColor }}>
            {healthStatus?.status || 'Unknown'}
          </div>
          <div style={{ fontSize: 14, color: '#888', marginTop: 4 }}>
            {healthStatus
              ? `Response time: ${healthStatus.responseTime}ms • Uptime: ${Math.floor(healthStatus.uptime / 60)} minutes`
              : 'Click "Refresh Status" to check system health'}
          </div>
        </div>
      </div>

      {/* Issues Alert */}
      {healthStatus?.issues && healthStatus.issues.length > 0 && (
        <div style={{ background: '#ef444420', border: '1px solid #ef444440', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#ef4444', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚠️</span> Issues Detected ({healthStatus.issues.length})
          </h3>
          <ul style={{ margin: 0, paddingLeft: 20, color: '#fca5a5' }}>
            {healthStatus.issues.map((issue, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Component Status Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {/* Database */}
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, color: '#666' }}>Database</span>
            <span style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 4,
              background: healthStatus?.components?.database?.status === 'healthy' ? '#22c55e20' : '#ef444420',
              color: healthStatus?.components?.database?.status === 'healthy' ? '#22c55e' : '#ef4444'
            }}>
              {healthStatus?.components?.database?.status?.toUpperCase() || 'UNKNOWN'}
            </span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            {healthStatus?.components?.database?.responseTime ? `${healthStatus.components.database.responseTime}ms` : '--'}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {healthStatus?.components?.database?.message || healthStatus?.components?.database?.error || 'No data'}
          </div>
        </div>

        {/* Tables */}
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, color: '#666' }}>Tables</span>
            <span style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 4,
              background: healthStatus?.components?.tables?.status === 'healthy' ? '#22c55e20' : '#f59e0b20',
              color: healthStatus?.components?.tables?.status === 'healthy' ? '#22c55e' : '#f59e0b'
            }}>
              {healthStatus?.components?.tables?.status?.toUpperCase() || 'UNKNOWN'}
            </span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            {healthStatus?.components?.tables?.existing || 0} / {healthStatus?.components?.tables?.total || 0}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {healthStatus?.components?.tables?.missing?.length
              ? `Missing: ${healthStatus.components.tables.missing.join(', ')}`
              : 'All tables present'}
          </div>
        </div>

        {/* Memory */}
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, color: '#666' }}>Memory</span>
            <span style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 4,
              background: healthStatus?.components?.memory?.status === 'healthy' ? '#22c55e20' : '#f59e0b20',
              color: healthStatus?.components?.memory?.status === 'healthy' ? '#22c55e' : '#f59e0b'
            }}>
              {healthStatus?.components?.memory?.percentage || 0}%
            </span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            {healthStatus?.components?.memory?.heapUsed || '--'}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>
            of {healthStatus?.components?.memory?.heapTotal || '--'} total
          </div>
        </div>
      </div>

      {/* Server Info & Data Counts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Server Info */}
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Server Info</h3>
          {serverStatus ? (
            <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Node Version</span>
                <span>{serverStatus.server?.nodeVersion || '--'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Platform</span>
                <span>{serverStatus.server?.platform || '--'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Uptime</span>
                <span>
                  {serverStatus.server?.uptime
                    ? `${serverStatus.server.uptime.days}d ${serverStatus.server.uptime.hours}h ${serverStatus.server.uptime.minutes}m`
                    : '--'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Environment</span>
                <span style={{ textTransform: 'capitalize' }}>{serverStatus.config?.environment || '--'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Port</span>
                <span>{serverStatus.config?.port || '--'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Email Service</span>
                <span style={{ color: serverStatus.config?.emailConfigured ? '#22c55e' : '#ef4444' }}>
                  {serverStatus.config?.emailConfigured ? 'Configured' : 'Not Configured'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>DB Connections</span>
                <span>{serverStatus.database?.totalConnections || 0} total, {serverStatus.database?.idleConnections || 0} idle</span>
              </div>
            </div>
          ) : (
            <div style={{ color: '#666', textAlign: 'center', padding: 20 }}>
              Click "Refresh Status" to load server info
            </div>
          )}
        </div>

        {/* Data Counts */}
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Data Counts</h3>
          {healthStatus?.components?.data?.counts ? (
            <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
              {Object.entries(healthStatus.components.data.counts).map(([table, count]) => (
                <div key={table} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666', textTransform: 'capitalize' }}>{table}</span>
                  <span style={{ fontWeight: 600 }}>
                    {count === 'error' ? <span style={{ color: '#ef4444' }}>Error</span> : count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#666', textAlign: 'center', padding: 20 }}>No data available</div>
          )}
        </div>
      </div>

      {/* API Endpoints Info */}
      <div style={{ marginTop: 24, background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
        <h3 style={{ fontSize: 14, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Health Endpoints</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 13 }}>
          <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
            <span style={{ color: '#22c55e' }}>GET</span> <span style={{ color: '#888' }}>/api/v1/health/deep</span>
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Full health check with all components</div>
          </div>
          <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
            <span style={{ color: '#22c55e' }}>GET</span> <span style={{ color: '#888' }}>/api/v1/health/status</span>
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Server status and configuration</div>
          </div>
          <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
            <span style={{ color: '#22c55e' }}>GET</span> <span style={{ color: '#888' }}>/api/v1/health/live</span>
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Liveness probe for load balancers</div>
          </div>
          <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
            <span style={{ color: '#22c55e' }}>GET</span> <span style={{ color: '#888' }}>/api/v1/health/ready</span>
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Readiness probe (DB connected)</div>
          </div>
          <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
            <span style={{ color: '#3b82f6' }}>POST</span> <span style={{ color: '#888' }}>/api/v1/health/test-alert</span>
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Send test alert to admin email</div>
          </div>
          <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
            <span style={{ color: '#22c55e' }}>GET</span> <span style={{ color: '#888' }}>/api/v1/health/test-apis</span>
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Test all API endpoints</div>
          </div>
        </div>
      </div>
    </div>
  );
}
