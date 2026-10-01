import { useState } from 'react';

type Theme = 'light' | 'dark';

// Without a saved choice the page follows the OS (styles.css); the toggle saves an explicit one.
// Per-visitor convenience only; storage may be unavailable (private mode), so every access is guarded.
export function savedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem('theme');
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme | null) {
  if (theme) document.documentElement.dataset.theme = theme;
}

export function ThemeToggle({ labels }: { labels: { light: string; dark: string } }) {
  const [theme, setTheme] = useState<Theme>(() => savedTheme() ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      type="button"
      className="lang-toggle"
      aria-label={labels[next]}
      title={labels[next]}
      onClick={() => {
        setTheme(next);
        applyTheme(next);
        try {
          localStorage.setItem('theme', next);
        } catch {
          // Not remembered; still applied for this visit.
        }
      }}
    >
      {theme === 'light' ? '☾' : '☀'}
    </button>
  );
}
