// AI-generated message utilities

import type { Guest, GuestCategory } from '../types';

/**
 * Generate personalized AI message based on guest and category
 */
export const generateAIMessage = (guest: Guest, category: GuestCategory): string => {
  const firstName = guest.name.split(' ')[0];

  const messages: Record<string, string[]> = {
    A: [
      `${firstName}, you've been selected for VIP access. An extraordinary experience awaits.`,
      `Welcome to the inner circle, ${firstName}. Your VIP invitation is confirmed.`,
    ],
    B: [
      `${firstName}, your priority access has been confirmed. We look forward to hosting you.`,
      `Great news, ${firstName}. Your priority reservation is set.`,
    ],
    C: [
      `${firstName}, your reservation is confirmed. We can't wait to see you.`,
      `Thank you for joining us, ${firstName}. Your spot is secured.`,
    ],
    pending: [
      `${firstName}, thank you for your interest. We're reviewing your request.`
    ],
  };

  const list = messages[category] || messages.C;
  return list[Math.floor(Math.random() * list.length)];
};
