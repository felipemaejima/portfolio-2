import { useState } from 'react';
import { flushSync } from 'react-dom';

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
  // Browser UI (mobile address bar) matches --color-bg; index.html ships the dark value for the first paint.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f6f6fa' : '#161826');
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
      onClick={(event) => {
        const toggle = () => {
          setTheme(next);
          applyTheme(next);
          saveTheme(next);
        };
        if (!('startViewTransition' in document)) return toggle();
        // The new theme grows as a circle from this button (styles.css, .theme-transition). CSSOM: allowed by the CSP.
        const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
        const root = document.documentElement;
        root.style.setProperty('--reveal-x', `${left + width / 2}px`);
        root.style.setProperty('--reveal-y', `${top + height / 2}px`);
        root.classList.add('theme-transition');
        const done = () => root.classList.remove('theme-transition');
        // flushSync: the icon swaps with the theme, inside the new snapshot.
        document.startViewTransition(() => flushSync(toggle)).finished.then(done, done);
      }}
    >
      {/* A ☾ glyph comes from a symbol font and is a hairline at this size. */}
      {theme === 'light' ? (
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        '☀'
      )}
    </button>
  );
}
