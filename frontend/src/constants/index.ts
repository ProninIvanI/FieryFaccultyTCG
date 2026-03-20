// Константы приложения

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4000';

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  NEWS: '/news',
  DEMO: '/demo',
  CARDS: '/cards',
  DEBUG: '/debug',
  SETTINGS: '/settings',
  RULES: '/rules',
  DECKS: '/decks',
  PROFILE: '/profile',
  PLAY_PVP: '/play/pvp',
  PLAY_PVE: '/play/pve',
  PLAY_SIM: '/play/sim',
} as const;






