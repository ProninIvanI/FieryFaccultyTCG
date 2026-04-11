export const UI_THEMES = [
  'magical-library',
  'alchemical-laboratory',
  'celestial-observatory',
] as const;

export type UiTheme = (typeof UI_THEMES)[number];

export const DEFAULT_UI_THEME: UiTheme = 'magical-library';

export const UI_THEME_STORAGE_KEY = 'fftcg-ui-theme';

export function isUiTheme(value: string | null): value is UiTheme {
  return value !== null && UI_THEMES.some((theme) => theme === value);
}
