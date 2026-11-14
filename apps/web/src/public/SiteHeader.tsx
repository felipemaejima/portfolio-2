import { Link } from 'react-router';
import { useLang } from '../lib/i18n';
import { ThemeToggle } from '../lib/theme';

const SECTIONS = ['about', 'projects', 'skills', 'experience', 'education', 'services', 'contact'] as const;

export function SiteHeader({ name }: { name?: string }) {
  const { lang, t, setLang } = useLang();
  return (
    <header className="site-header">
      {/* On mobile only the mark shows; the label keeps the name for screen readers. */}
      <Link to="/" className="brand" aria-label={name ?? 'Portfolio'}>
        <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          {/* Same drawing as public/favicon.svg, coloured by the theme (styles.css). */}
          <rect width="32" height="32" rx="7" />
          <path d="M4.5 8H13v3.5H8v3h4V18H8v6H4.5zM15.5 24V8h3.6l2.4 6.4L23.9 8h3.6v16H24V14.6l-1.6 4.4h-1.8L19 14.6V24z" />
        </svg>
        <span className="brand-name">{name ?? 'Portfolio'}</span>
      </Link>
      <nav className="site-nav" aria-label="Seções">
        {SECTIONS.map((section) => (
          <a key={section} href={`/#${section}`}>
            {t[section]}
          </a>
        ))}
      </nav>
      <div className="header-actions">
        <ThemeToggle labels={{ light: t.themeLight, dark: t.themeDark }} />
        <button
          type="button"
          className="lang-toggle"
          onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}
          aria-label={lang === 'pt' ? 'Switch to English' : 'Mudar para português'}
        >
          {lang === 'pt' ? 'EN' : 'PT'}
        </button>
        <a className="button button-accent" href={`/api/cv?lang=${lang}`} download>
          {t.downloadCv}
        </a>
      </div>
    </header>
  );
}
