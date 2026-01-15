import { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['images.unsplash.com'],
  },
  // Allow importing from outside of app directory if needed?
  // Next.js handles src/ or root automatically usually.
};

export default nextConfig;
