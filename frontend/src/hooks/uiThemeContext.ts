import { createContext } from 'react';
import { type UiTheme } from '@/constants';

export type UiThemeContextValue = {
  theme: UiTheme;
  setTheme: (theme: UiTheme) => void;
};

export const UiThemeContext = createContext<UiThemeContextValue | null>(null);
