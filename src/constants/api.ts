// API Configuration

const LOCAL_API = 'http://localhost:3001/api/v1';

export const API_URL = import.meta.env.VITE_API_URL || LOCAL_API;

export const ENDPOINTS = {
  guests: '/guest-lists',
  stats: '/guest-lists/stats',
} as const;
