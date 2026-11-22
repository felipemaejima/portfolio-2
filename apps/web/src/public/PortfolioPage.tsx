import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { formatPeriod, useLang } from '../lib/i18n';
import { LineIcon } from '../lib/line-icon';
import { visibleSections } from '../lib/sections';
import { paragraphs, splitItems } from '../lib/text';
import type { Portfolio } from '../lib/types';
import { useFetch } from '../lib/use-fetch';
import { useReveal } from '../lib/use-reveal';
import { announceVisit } from '../lib/visit';
import { ContactForm } from './ContactForm';
import { FeaturedProjects } from './FeaturedProjects';
import { HeroLogo } from './HeroLogo';
import { SiteHeader } from './SiteHeader';

export function PortfolioPage() {
  const { lang, t } = useLang();
  const { data, error, loading } = useFetch<Portfolio>(`/portfolio?lang=${lang}`);
  useEffect(() => announceVisit('/', lang), [lang]);
  useReveal(data);
  // The sections only exist once the portfolio loads, after the browser gave up on the URL's #anchor (a nav link from
  // another page, a shared link): go there now, once. The CSS sets how (smooth unless reduced motion, under the header).
  const ready = Boolean(data?.profile);
  useEffect(() => {
    if (ready) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [ready]);
  // The value just copied by a CopyButton, for ~1.5s: its button shows a check and the status line below announces it.
  const [copied, setCopied] = useState('');
  const copiedTimer = useRef(0);

  if (!data) {
    return (
      <>
        <SiteHeader />
        <main className={loading ? 'status loading' : 'status'}>{loading ? t.loading : error ? t.loadError : null}</main>
      </>
    );
  }
  const { profile, socialLinks, skillCategories, projects, experiences, education, services } = data;
  if (!profile) {
    return (
      <>
        <SiteHeader />
        <main className="status">{t.underConstruction}</main>
      </>
    );
  }
  const sections = visibleSections(data);
  const skills = skillCategories.filter((category) => category.skills.length > 0);
  // Line icons: map pin, clock, laptop, globe. A fact left empty isn't listed.
  const facts = (
    [
      [t.location, profile.location, <><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></>],
      [t.availability, profile.availability, <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>],
      [t.modality, profile.workModality, <><path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16" /></>],
      [t.languages, profile.spokenLanguages, <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>],
    ] as const
  ).filter(([, value]) => splitItems(value).length > 0);
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(''), 1500);
  };
  const copyButton = (value: string, label: string) => (
    <CopyButton label={label} copied={copied === value} onCopy={() => void copy(value).catch(() => undefined)} />
  );

  return (
    <>
      <title>{`${profile.name} — ${profile.headline}`}</title>
      <SiteHeader portfolio={data} />
      <main>
        <section className="hero">
          <p className="eyebrow">
            <Items text={profile.headline} />
          </p>
          <h1>{profile.name}</h1>
          <p className="lead">{profile.summary}</p>
          <div className="actions">
            <Link className="button button-accent" to="/projetos">
              {t.seeProjects}
            </Link>
            <a className="button" href="#contact">
              {t.talkToMe}
            </a>
          </div>
          <ul className="inline-links">
            {socialLinks.map((link) => (
              <li key={link.id}>
                <a href={link.url} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
                {copyButton(link.url, t.copyLink.replace('{label}', link.label))}
              </li>
            ))}
            {profile.email && (
              <li>
                <a href={`mailto:${profile.email}`}>{profile.email}</a>
                {copyButton(profile.email, t.copyEmail)}
              </li>
            )}
          </ul>
          <HeroLogo />
        </section>

        {/* Half photo, half text; without a photo the text stands alone. The first paragraph is the opening line. */}
        <section id="about" className="section about" data-reveal>
          {profile.photoUrl && <img className="about-photo" src={profile.photoUrl} alt={profile.name} />}
          <div className="about-text">
            <h2 className="eyebrow">{t.aboutMe}</h2>
            {profile.about.flatMap(paragraphs).map((paragraph, index) => (
              <p key={index} className={index ? 'body-text' : 'opening'}>
                {paragraph}
              </p>
            ))}
            {facts.length > 0 && (
              <dl className="facts">
                {facts.map(([label, value, icon]) => (
                  <div key={label}>
                    <dt>
                      <LineIcon size={20} strokeWidth={1.5}>
                        {icon}
                      </LineIcon>
                      {label}
                    </dt>
                    <dd>
                      <Items text={value} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </section>

        {sections.includes('skills') && (
          <section id="skills" className="section" data-reveal>
            <h2>{t.skills}</h2>
            <div className="grid grid-fit">
              {skills.map((category) => (
                <div key={category.id}>
                  <p className="eyebrow">{category.name}</p>
                  <ul className="tags">
                    {category.skills.map((skill) => (
                      <li key={skill.id} className="tag skill">
                        {skill.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <section id="projects" className="section featured" data-reveal>
          <h2>{t.projects}</h2>
          <FeaturedProjects projects={projects} />
          <div className="center">
            <Link className="button button-accent" to="/projetos">
              {t.seeAllProjects}
            </Link>
          </div>
        </section>

        {/* Trajetória: Experiência left, Formação right (stacked on phones), only the one with items. It keeps the id
            `experience` and Formação's column `education`, where old links point to. */}
        {sections.includes('experience') && (
          <section id="experience" className="section trajectory" data-reveal>
            <h2>{t.experience}</h2>
            {experiences.length > 0 && (
              <div>
                <h3>{t.professionalExperience}</h3>
                <ol className="timeline">
                  {experiences.map((item) => (
                    <li key={item.id}>
                      <span className="period">
                        {formatPeriod(item.startDate, item.endDate, item.datePrecision, lang, t.present)}
                      </span>
                      <div>
                        <h4>{item.role}</h4>
                        <p className="subtitle">{item.company}</p>
                        <ul className="bullets">
                          {item.bullets.map((bullet, index) => (
                            <li key={index}>{bullet}</li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {education.length > 0 && (
              <div id="education">
                <h3>{t.education}</h3>
                <ol className="timeline">
                  {education.map((item) => (
                    <li key={item.id}>
                      <span className="period">
                        {formatPeriod(item.startDate, item.endDate, item.datePrecision, lang, t.present)}
                      </span>
                      <div>
                        <h4>{item.title}</h4>
                        <p className="subtitle">{item.institution}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        )}

        {sections.includes('services') && (
          <section id="services" className="section" data-reveal>
            <h2>{t.services}</h2>
            <div className="grid grid-4">
              {services.map((service) => (
                <div key={service.id} className="card service">
                  <h3>{service.title}</h3>
                  <p className="muted">{service.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section id="contact" className="section contact" data-reveal>
          <div>
            <h2>{t.contact}</h2>
            <p className="body-text">{t.contactText}</p>
            <ul className="channels">
              {profile.email && (
                <li>
                  {t.email} — <a href={`mailto:${profile.email}`}>{profile.email}</a>
                  {copyButton(profile.email, t.copyEmail)}
                </li>
              )}
              {profile.phone && (
                <li>
                  {t.phone} — {profile.phone}
                </li>
              )}
              {socialLinks.map((link) => (
                <li key={link.id}>
                  {link.label} —{' '}
                  <a href={link.url} target="_blank" rel="noreferrer">
                    {link.url.replace(/^https?:\/\//, '')}
                  </a>
                  {copyButton(link.url, t.copyLink.replace('{label}', link.label))}
                </li>
              ))}
            </ul>
          </div>
          <ContactForm />
        </section>
        {/* One for every copy button; always there, as a live region announces changes to its text. A new node per copied
            value, so copying another link right after is announced too. */}
        <p className="visually-hidden" role="status">
          {copied && <span key={copied}>{t.copied}</span>}
        </p>
      </main>
      <footer className="site-footer">
        <span>
          © {new Date().getFullYear()} {profile.name}
        </span>
      </footer>
    </>
  );
}

/** A list typed as "a | b": each item wraps as a unit (.item in styles.css). */
function Items({ text }: { text: string }) {
  return splitItems(text).map((item, index) => (
    <span key={index} className="item">
      {item}
    </span>
  ));
}

/** Icon only, where the Clipboard API exists (secure contexts); a check replaces the icon while `copied`. */
function CopyButton({ label, copied, onCopy }: { label: string; copied: boolean; onCopy: () => void }) {
  if (!navigator.clipboard) return null;
  return (
    <button type="button" className={copied ? 'copy copied' : 'copy'} aria-label={label} title={label} onClick={onCopy}>
      <LineIcon size={15}>
        {copied ? (
          <path d="M20 6 9 17l-5-5" />
        ) : (
          <>
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
          </>
        )}
      </LineIcon>
    </button>
  );
}
