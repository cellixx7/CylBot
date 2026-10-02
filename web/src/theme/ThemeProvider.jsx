import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DARK_THEME,
  LIGHT_THEME,
  THEME_STORAGE_KEY,
  nextTheme,
  normalizeTheme,
  readStoredTheme,
} from './themeState.js';

const ThemeContext = createContext(null);

function getInitialTheme() {
  if (typeof document !== 'undefined') {
    const documentTheme = normalizeTheme(document.documentElement.dataset.theme);
    if (documentTheme) return documentTheme;
  }

  return readStoredTheme(typeof window !== 'undefined' ? window.localStorage : undefined);
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', theme === LIGHT_THEME ? '#f8f7fc' : '#0a0614');
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);
  const transitionTimer = useRef(null);

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // A blocked storage must not prevent the theme from working for this visit.
    }
  }, [theme]);

  useEffect(() => () => window.clearTimeout(transitionTimer.current), []);

  const beginTransition = useCallback(() => {
    document.documentElement.classList.add('cyl-theme-transitioning');
    window.clearTimeout(transitionTimer.current);
    transitionTimer.current = window.setTimeout(() => {
      document.documentElement.classList.remove('cyl-theme-transitioning');
    }, 240);
  }, []);

  const setTheme = useCallback(nextValue => {
    const next = normalizeTheme(nextValue) || DARK_THEME;
    beginTransition();
    setThemeState(next);
  }, [beginTransition]);

  const toggleTheme = useCallback(() => {
    beginTransition();
    setThemeState(current => nextTheme(current));
  }, [beginTransition]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [setTheme, theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
