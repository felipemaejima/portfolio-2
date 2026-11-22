import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useLang } from '../lib/i18n';
import { LineIcon } from '../lib/line-icon';
import { Logo } from '../lib/logo';
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
      {/* Only the mark shows; the label gives screen readers the name. */}
      <Link to="/" className="brand" aria-label={name}>
        <Logo className="brand-mark" />
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
          // The visible "PT / EN" stays its name, so voice control can say it (WCAG 2.5.3); the action is its description.
          title={lang === 'pt' ? 'Switch to English' : 'Mudar para português'}
        >
          {/* Both shown, the current one lit. */}
          <span className={lang === 'pt' ? 'current' : undefined}>PT</span> /{' '}
          <span className={lang === 'en' ? 'current' : undefined}>EN</span>
        </button>
        <a className="button button-accent" href={`/api/cv?lang=${lang}`} download>
          {t.downloadCv}
        </a>
        {sections.length > 0 && (
          <button type="button" className="lang-toggle menu-toggle" popoverTarget="site-menu" aria-label="Menu">
            <LineIcon size={18}>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </LineIcon>
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
