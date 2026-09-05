'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'system' | 'light' | 'dark';
const key = 'ovela-theme';
const validTheme = (value: string | null): Theme => value === 'light' || value === 'dark' ? value : 'system';
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void }>({ theme: 'system', setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>('system');
  useEffect(() => {
    const read = () => {
      let value: Theme = 'system';
      try { value = validTheme(localStorage.getItem(key)); } catch { /* Storage may be disabled. */ }
      document.documentElement.dataset.theme = value;
      updateTheme(value);
    };
    read();
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) read(); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  function setTheme(value: Theme) {
    document.documentElement.dataset.theme = value;
    updateTheme(value);
    try { localStorage.setItem(key, value); } catch { /* Keep the in-memory preference. */ }
  }
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function ThemePicker() {
  const { theme, setTheme } = useContext(ThemeContext);
  return <section className="appearance-settings" aria-labelledby="appearance-heading">
    <h2 id="appearance-heading">Appearance</h2>
    <div className="segmented" role="group" aria-label="Color theme">
      {(['light', 'dark', 'system'] as const).map(value => <button type="button" key={value} aria-pressed={theme === value} onClick={() => setTheme(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
    </div>
    <p className="muted">System follows your device. Saved for this browser.</p>
  </section>;
}
