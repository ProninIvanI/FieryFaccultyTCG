import { useContext } from 'react';
import { UiThemeContext } from './uiThemeContext';

export function useUiTheme() {
  const context = useContext(UiThemeContext);
  if (!context) {
    throw new Error('useUiTheme must be used within UiThemeProvider');
  }
  return context;
}
