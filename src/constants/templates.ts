// Event Design Templates - Partiful style

export interface EventTemplate {
  id: string;
  name: string;
  bg: string;
  accent: string;
  textColor: string;
  preview: string;
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: 'elegant-dark',
    name: 'Elegant Dark',
    bg: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
    accent: '#d4af37',
    textColor: '#fff',
    preview: '🌙'
  },
  {
    id: 'vip-gold',
    name: 'VIP Gold',
    bg: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)',
    accent: '#ffd700',
    textColor: '#fff',
    preview: '👑'
  },
  {
    id: 'neon-night',
    name: 'Neon Night',
    bg: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    accent: '#ff00ff',
    textColor: '#fff',
    preview: '💜'
  },
  {
    id: 'sunset-party',
    name: 'Sunset Party',
    bg: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)',
    accent: '#fff',
    textColor: '#fff',
    preview: '🌅'
  },
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    accent: '#00d4ff',
    textColor: '#fff',
    preview: '🌊'
  },
  {
    id: 'pool-party',
    name: 'Pool Party',
    bg: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    accent: '#fff',
    textColor: '#fff',
    preview: '🏖️'
  },
  {
    id: 'garden-party',
    name: 'Garden Party',
    bg: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
    accent: '#fff',
    textColor: '#fff',
    preview: '🌿'
  },
  {
    id: 'rose-gold',
    name: 'Rose Gold',
    bg: 'linear-gradient(135deg, #2c2c2c 0%, #1a1a1a 100%)',
    accent: '#e8b4b8',
    textColor: '#fff',
    preview: '🌹'
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    bg: '#ffffff',
    accent: '#000000',
    textColor: '#000',
    preview: '⬜'
  },
  {
    id: 'retro-disco',
    name: 'Retro Disco',
    bg: 'linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)',
    accent: '#fff',
    textColor: '#fff',
    preview: '🪩'
  },
];
