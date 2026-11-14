import { useState } from 'react';

type Theme = 'light' | 'dark';

// Dark unless the visitor chose light with the toggle; the OS preference is ignored (styles.css defaults to dark too).
// Per-visitor convenience only; storage may be unavailable (private mode), so every access is guarded.
export function savedTheme(): Theme {
  try {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // Not remembered; still applied for this visit.
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle({ labels }: { labels: { light: string; dark: string } }) {
  const [theme, setTheme] = useState(savedTheme);
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
        saveTheme(next);
      }}
    >
      {theme === 'light' ? '☾' : '☀'}
    </button>
  );
}
