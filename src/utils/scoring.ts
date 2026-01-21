// AI Scoring utilities for guests

import type { Guest } from '../types';

/**
 * Intelligent follower estimation based on username patterns
 */
const estimateFollowers = (instagram: string): number => {
  if (!instagram) return 0;
  const username = instagram.replace('@', '');

  const usernameLength = username.length;
  const hasNumbers = /\d/.test(username);
  const hasUnderscore = username.includes('_');
  const hasDot = username.includes('.');

  let baseEstimate = Math.max(100, 10000 - (usernameLength * 500));

  if (hasNumbers) baseEstimate *= 0.5;
  if (hasUnderscore) baseEstimate *= 0.7;
  if (hasDot) baseEstimate *= 1.2;

  const hash = username.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const multiplier = 0.5 + (hash % 100) / 100;

  return Math.round(baseEstimate * multiplier);
};

/**
 * Instagram-based AI Score Calculator
 * Calculates a score from 1-100 based on follower count, ratio, and party size
 */
export const calculateAIScore = (guest: Guest): number => {
  const followers = guest.instagramFollowers || estimateFollowers(guest.instagram);
  const following = guest.instagramFollowing || Math.round(followers * 0.5);

  // Base score from followers (logarithmic scale)
  // 10 = 10pts, 100 = 20pts, 1K = 30pts, 10K = 40pts, 100K = 50pts, 1M = 60pts
  let baseScore = followers >= 10 ? Math.log10(followers) * 10 : 0;

  // Ratio bonus: more followers than following = more influential
  let ratioBonus = 0;
  if (following > 0 && followers > following) {
    const ratio = followers / following;
    ratioBonus = Math.min(30, ratio * 5); // Cap at 30 bonus points
  }

  // Party size bonus (0-10 points)
  const partyBonus = Math.min(guest.partySize * 2, 10);

  // Calculate final score (0-100)
  const rawScore = baseScore + ratioBonus + partyBonus;
  return Math.min(100, Math.max(1, Math.round(rawScore)));
};
