import { useState } from 'react';
import { flushSync } from 'react-dom';
import { LineIcon } from './line-icon';

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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#eae9f0' : '#161826');
}

export function ThemeToggle({ labels }: { labels: { light: string; dark: string } }) {
  const [theme, setTheme] = useState(savedTheme);
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      type="button"
      className="lang-toggle theme-toggle"
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
      {/* Line icons like the site's others (Lucide's moon and sun); the theme to switch to. */}
      <LineIcon size={22} strokeWidth={1.75}>
        {theme === 'light' ? (
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </>
        )}
      </LineIcon>
    </button>
  );
}
