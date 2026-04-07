const getBrowserLocation = (): Location | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.location;
};

const location = getBrowserLocation();
const protocol = location?.protocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = location?.protocol === 'https:' ? 'wss:' : 'ws:';
const hostname = location?.hostname ?? 'localhost';

export const API_URL =
  import.meta.env.VITE_API_URL || `${protocol}//${hostname}:3001`;

export const WS_URL =
  import.meta.env.VITE_WS_URL || `${wsProtocol}//${hostname}:4000`;

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
