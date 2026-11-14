import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useLang } from '../lib/i18n';
import { visibleSections, type Section } from '../lib/sections';
import { ThemeToggle } from '../lib/theme';
import type { Portfolio } from '../lib/types';

/** The nav links to the home page's sections that `portfolio` shows (none while it loads). */
export function SiteHeader({ portfolio }: { portfolio?: Portfolio }) {
  const { lang, t, setLang } = useLang();
  const name = portfolio?.profile?.name ?? 'Portfolio';
  const sections = portfolio ? visibleSections(portfolio) : [];
  const active = useActiveSection(sections);
  return (
    <header className="site-header">
      {/* On mobile only the mark shows; the label keeps the name for screen readers. */}
      <Link to="/" className="brand" aria-label={name}>
        <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          {/* Same drawing as src/favicon.svg, coloured by the theme (styles.css). */}
          <rect width="32" height="32" rx="7" />
          <path d="M4.5 8H13v3.5H8v3h4V18H8v6H4.5zM15.5 24V8h3.6l2.4 6.4L23.9 8h3.6v16H24V14.6l-1.6 4.4h-1.8L19 14.6V24z" />
        </svg>
        <span className="brand-name">{name}</span>
      </Link>
      {/* Inline on wide screens; on narrow ones the menu button opens it as a popover (styles.css). */}
      <nav
        id="site-menu"
        className="site-nav"
        aria-label="Seções"
        popover="auto"
        onClick={(event) => {
          if (event.target instanceof HTMLAnchorElement) event.currentTarget.hidePopover();
        }}
      >
        {sections.map((section) => (
          <a key={section} href={`/#${section}`} aria-current={section === active ? 'location' : undefined}>
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
        {sections.length > 0 && (
          <button type="button" className="lang-toggle menu-toggle" popoverTarget="site-menu" aria-label="Menu">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}

/** The section being read: the one crossing a line just under the header, or the last once the page is scrolled to the end. */
function useActiveSection(sections: Section[]) {
  const [active, setActive] = useState<string>();
  const key = sections.join(' ');
  useEffect(() => {
    const elements = key.split(' ').flatMap((id) => document.getElementById(id) ?? []);
    const crossing = new Set<Element>();
    let atEnd = false;
    const update = () => setActive(atEnd ? elements.at(-1)?.id : elements.find((element) => crossing.has(element))?.id);
    const line = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) crossing.add(entry.target);
          else crossing.delete(entry.target);
        }
        update();
      },
      { rootMargin: '-20% 0px -79% 0px' },
    );
    // The last sections may be too short to ever reach the line. The footer ends the page: fully visible means scrolled
    // to the end (the 1px margin absorbs sub-pixel layout, where it never quite fits).
    const end = new IntersectionObserver(
      ([entry]) => {
        atEnd = entry.intersectionRatio === 1;
        update();
      },
      { threshold: 1, rootMargin: '0px 0px 1px 0px' },
    );
    elements.forEach((element) => line.observe(element));
    const footer = document.querySelector('.site-footer');
    if (footer) end.observe(footer);
    return () => {
      line.disconnect();
      end.disconnect();
    };
  }, [key]);
  return active;
}
