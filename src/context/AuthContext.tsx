import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://berry-dashboard-api-production.up.railway.app/api/v1';
// OAuth endpoints are at root, not under /api/v1
const AUTH_URL = API_BASE.replace('/api/v1', '');

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing token on mount
    const storedToken = localStorage.getItem('berry_token');
    const storedUser = localStorage.getItem('berry_user');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

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
        setToken(data.access_token);
        setUser(data.user);
        localStorage.setItem('berry_token', data.access_token);
        localStorage.setItem('berry_user', JSON.stringify(data.user));
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error) {
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
        setToken(data.access_token);
        setUser(data.user);
        localStorage.setItem('berry_token', data.access_token);
        localStorage.setItem('berry_user', JSON.stringify(data.user));
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Registration failed' };
      }
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('berry_token');
    localStorage.removeItem('berry_user');
  };

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
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, forgotPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
