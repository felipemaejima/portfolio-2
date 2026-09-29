import { Link } from 'react-router';
import { useLang } from '../lib/i18n';

const SECTIONS = ['about', 'projects', 'skills', 'experience', 'education', 'services', 'contact'] as const;

export function SiteHeader({ name }: { name?: string }) {
  const { lang, t, setLang } = useLang();
  return (
    <header className="site-header">
      <Link to="/" className="brand">
        {name ?? 'Portfolio'}
      </Link>
      <nav className="site-nav" aria-label="Seções">
        {SECTIONS.map((section) => (
          <a key={section} href={`/#${section}`}>
            {t[section]}
          </a>
        ))}
      </nav>
      <div className="header-actions">
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
