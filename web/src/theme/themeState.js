export const THEME_STORAGE_KEY = 'cyl-theme';
export const DARK_THEME = 'dark';
export const LIGHT_THEME = 'light';

export function normalizeTheme(value) {
  return value === LIGHT_THEME || value === DARK_THEME ? value : null;
}

export function readStoredTheme(storage) {
  try {
    return normalizeTheme(storage?.getItem(THEME_STORAGE_KEY)) || DARK_THEME;
  } catch {
    return DARK_THEME;
  }
}

export function nextTheme(theme) {
  return theme === LIGHT_THEME ? DARK_THEME : LIGHT_THEME;
}
