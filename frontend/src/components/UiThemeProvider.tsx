import { ReactNode, useMemo, useState } from 'react';
import {
  DEFAULT_UI_THEME,
  isUiTheme,
  UI_THEME_STORAGE_KEY,
  type UiTheme,
} from '@/constants';
import { UiThemeContext } from '@/hooks/uiThemeContext';

const getInitialTheme = (): UiTheme => {
  if (typeof window === 'undefined') {
    return DEFAULT_UI_THEME;
  }

  try {
    const savedTheme = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
    return isUiTheme(savedTheme) ? savedTheme : DEFAULT_UI_THEME;
  } catch {
    return DEFAULT_UI_THEME;
  }
};

type UiThemeProviderProps = {
  children: ReactNode;
};

export function UiThemeProvider({ children }: UiThemeProviderProps) {
  const [theme, setThemeState] = useState<UiTheme>(getInitialTheme);

  const setTheme = (nextTheme: UiTheme) => {
    setThemeState(nextTheme);

    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(UI_THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Ignore storage failures and keep in-memory state.
    }
  };

  const value = useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme],
  );

  return <UiThemeContext.Provider value={value}>{children}</UiThemeContext.Provider>;
}
