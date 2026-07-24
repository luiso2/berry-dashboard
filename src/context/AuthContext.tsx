import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

// Base URL for the API - OAuth endpoints are at root level
const API_HOST = 'https://berry-dashboard-api-production.up.railway.app';
const AUTH_URL = API_HOST; // OAuth endpoints at /oauth/*, not /api/v1/oauth/*
const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const SESSION_CHECK_INTERVAL_MS = 60 * 1000;

const STORAGE_KEYS = {
  token: 'berry_token',
  refreshToken: 'berry_refresh_token',
  tokenExpiresAt: 'berry_token_expires_at',
  user: 'berry_user',
} as const;

interface User {
  id: number;
  email: string;
  name: string;
  company?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name: string, company?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  autoLogin: (autoLoginToken: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.refreshToken);
    localStorage.removeItem(STORAGE_KEYS.tokenExpiresAt);
    localStorage.removeItem(STORAGE_KEYS.user);
  }, []);

  const persistSession = useCallback((
    accessToken: string,
    sessionUser: User,
    refreshToken?: string | null,
    expiresInSeconds?: number,
    expiresAt?: string | null,
  ) => {
    const parsedExpiresAt = expiresAt ? Date.parse(expiresAt) : NaN;
    const calculatedExpiresAt = Number.isFinite(parsedExpiresAt)
      ? parsedExpiresAt
      : Date.now() + (expiresInSeconds || 2592000) * 1000;

    setToken(accessToken);
    setUser(sessionUser);
    localStorage.setItem(STORAGE_KEYS.token, accessToken);
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(sessionUser));
    localStorage.setItem(STORAGE_KEYS.tokenExpiresAt, String(calculatedExpiresAt));

    if (refreshToken) {
      localStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const storedRefreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
    if (!storedRefreshToken) return false;

    try {
      const response = await fetch(`${AUTH_URL}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: storedRefreshToken,
        }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      const storedUser = localStorage.getItem(STORAGE_KEYS.user);
      const sessionUser = data.user || (storedUser ? JSON.parse(storedUser) : null);

      if (!data.access_token || !sessionUser) return false;

      persistSession(
        data.access_token,
        sessionUser,
        data.refresh_token || storedRefreshToken,
        data.expires_in,
      );
      return true;
    } catch (error) {
      console.error('Session refresh failed:', error);
      return false;
    }
  }, [persistSession]);

  useEffect(() => {
    let cancelled = false;

    const initializeSession = async () => {
      const storedToken = localStorage.getItem(STORAGE_KEYS.token);
      const storedUser = localStorage.getItem(STORAGE_KEYS.user);
      const storedExpiryValue = localStorage.getItem(STORAGE_KEYS.tokenExpiresAt);
      const storedExpiry = storedExpiryValue ? Number(storedExpiryValue) : NaN;

      if (!storedToken || !storedUser) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      let parsedUser: User;
      try {
        parsedUser = JSON.parse(storedUser) as User;
      } catch {
        if (!cancelled) {
          clearSession();
          setIsLoading(false);
        }
        return;
      }

      try {
        const isKnownExpired = Number.isFinite(storedExpiry)
          && storedExpiry <= Date.now() + TOKEN_REFRESH_WINDOW_MS;

        if (isKnownExpired && await refreshSession()) {
          return;
        }

        const response = await fetch(`${API_HOST}/api/v1/auth/session`, {
          headers: { Authorization: `Bearer ${storedToken}` },
        });

        if (response.ok) {
          const data = await response.json();
          if (!cancelled) {
            persistSession(
              storedToken,
              data.user || parsedUser,
              localStorage.getItem(STORAGE_KEYS.refreshToken),
              undefined,
              data.expires_at,
            );
          }
          return;
        }

        if (response.status === 401 && await refreshSession()) {
          return;
        }

        if (!cancelled) clearSession();
      } catch (error) {
        console.error('Stored session validation failed:', error);

        // Keep a cached session during a transient network outage, but never
        // restore one that is already known to be expired.
        if (!cancelled) {
          if (Number.isFinite(storedExpiry) && storedExpiry <= Date.now()) {
            clearSession();
          } else {
            setToken(storedToken);
            setUser(parsedUser);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void initializeSession();

    return () => {
      cancelled = true;
    };
  }, [clearSession, persistSession, refreshSession]);

  useEffect(() => {
    if (!token) return;

    let refreshInProgress = false;

    const refreshIfNeeded = async () => {
      const storedExpiryValue = localStorage.getItem(STORAGE_KEYS.tokenExpiresAt);
      const storedExpiry = storedExpiryValue ? Number(storedExpiryValue) : NaN;
      if (!Number.isFinite(storedExpiry) || storedExpiry > Date.now() + TOKEN_REFRESH_WINDOW_MS) {
        return;
      }

      if (refreshInProgress) return;
      refreshInProgress = true;
      const refreshed = await refreshSession();
      refreshInProgress = false;

      if (!refreshed && storedExpiry <= Date.now()) {
        clearSession();
      }
    };

    const syncSessionAcrossTabs = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEYS.token) return;

      const storedUser = localStorage.getItem(STORAGE_KEYS.user);
      if (event.newValue && storedUser) {
        try {
          setToken(event.newValue);
          setUser(JSON.parse(storedUser));
        } catch {
          clearSession();
        }
      } else {
        setToken(null);
        setUser(null);
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshIfNeeded();
    }, SESSION_CHECK_INTERVAL_MS);
    const handleFocus = () => {
      void refreshIfNeeded();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', syncSessionAcrossTabs);
    void refreshIfNeeded();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', syncSessionAcrossTabs);
    };
  }, [clearSession, refreshSession, token]);

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch(`${AUTH_URL}/oauth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email,
          password,
          redirect_uri: window.location.origin + '/dashboard',
          client_id: 'berry-gpt-client',
          response_type: 'code'
        })
      });

      const data = await response.json();

      if (data.access_token) {
        persistSession(
          data.access_token,
          data.user,
          data.refresh_token,
          data.expires_in,
        );
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const register = async (email: string, password: string, name: string, company?: string) => {
    try {
      const response = await fetch(`${AUTH_URL}/oauth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email,
          password,
          name,
          company: company || '',
          redirect_uri: window.location.origin + '/dashboard',
          client_id: 'berry-gpt-client',
          response_type: 'code'
        })
      });

      const data = await response.json();

      if (data.access_token) {
        persistSession(
          data.access_token,
          data.user,
          data.refresh_token,
          data.expires_in,
        );
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Registration failed' };
      }
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const logout = clearSession;

  const forgotPassword = async (email: string) => {
    try {
      const response = await fetch(`${AUTH_URL}/oauth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (data.success) {
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Failed to send reset email' };
      }
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const autoLogin = async (autoLoginToken: string) => {
    try {
      const response = await fetch(`${API_HOST}/api/v1/auth/auto-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: autoLoginToken })
      });

      const data = await response.json();

      const accessToken = data.access_token || data.token;
      if (data.success && accessToken) {
        persistSession(
          accessToken,
          data.user,
          data.refresh_token,
          data.expires_in,
        );
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Auto-login failed' };
      }
    } catch {
      return { success: false, error: 'Network error during auto-login.' };
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, forgotPassword, autoLogin }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
