// System Monitoring Types

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  timestamp: string;
  uptime: number;
  responseTime: number;
  components: {
    database: {
      status: string;
      responseTime?: number;
      message?: string;
      error?: string
    };
    tables: {
      status: string;
      total: number;
      existing: number;
      missing: string[]
    };
    data: {
      status: string;
      counts: Record<string, number | string>
    };
    memory: {
      status: string;
      heapUsed: string;
      heapTotal: string;
      percentage: number
    };
    email: {
      status: string;
      from: string;
      adminEmail: string
    };
    environment: {
      status: string;
      nodeEnv: string;
      port: number;
      missingVariables: string[]
    };
  };
  issues: string[];
}

export interface ServerStatus {
  status: string;
  lastCheck: string | null;
  server: {
    nodeVersion: string;
    platform: string;
    pid: number;
    uptime: {
      days: number;
      hours: number;
      minutes: number;
      seconds: number
    };
    uptimeSeconds: number;
  };
  memory: {
    heapUsed: string;
    heapTotal: string;
    external: string;
    rss: string
  };
  database: {
    totalConnections: number;
    idleConnections: number;
    waitingClients: number
  };
  config: {
    port: number;
    environment: string;
    emailConfigured: boolean;
    databaseConfigured: boolean
  };
}
