import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError, api } from '../lib/api';
import { formatPeriod, useLang } from '../lib/i18n';
import { visibleSections } from '../lib/sections';
import { paragraphs, splitItems } from '../lib/text';
import type { Portfolio } from '../lib/types';
import { useFetch } from '../lib/use-fetch';
import { useReveal } from '../lib/use-reveal';
import { ProjectCard } from './ProjectCard';
import { SiteHeader } from './SiteHeader';

export function PortfolioPage() {
  const { lang, t } = useLang();
  const { data, error, loading } = useFetch<Portfolio>(`/portfolio?lang=${lang}`);
  useReveal(data);
  // The sections only exist once the portfolio loads, after the browser gave up on the URL's #anchor (a nav link from
  // another page, a shared link): go there now, once. The CSS sets how (smooth unless reduced motion, under the header).
  const ready = Boolean(data?.profile);
  useEffect(() => {
    if (ready) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [ready]);

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
              </li>
            ))}
            {profile.email && (
              <li>
                <a href={`mailto:${profile.email}`}>{profile.email}</a>
              </li>
            )}
          </ul>
        </section>

        <section id="about" className="section about" data-reveal>
          {profile.photoUrl ? (
            <img className="photo" src={profile.photoUrl} alt={profile.name} />
          ) : (
            <div className="photo placeholder" aria-hidden="true" />
          )}
          <div>
            <h2>{t.aboutMe}</h2>
            {profile.about.flatMap(paragraphs).map((paragraph, index) => (
              <p key={index} className="body-text">
                {paragraph}
              </p>
            ))}
            <dl className="facts">
              {(
                [
                  [t.location, profile.location],
                  [t.availability, profile.availability],
                  [t.modality, profile.workModality],
                  [t.languages, profile.spokenLanguages],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <Items text={value} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {sections.includes('skills') && (
          <section id="skills" className="section" data-reveal>
            <h2>{t.skills}</h2>
            <div className="grid grid-4">
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

        <section id="projects" className="section" data-reveal>
          <h2>{t.projects}</h2>
          <div className="grid grid-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
          <div className="center">
            <Link className="button button-accent" to="/projetos">
              {t.seeAllProjects}
            </Link>
          </div>
        </section>

        {sections.includes('experience') && (
          <section id="experience" className="section" data-reveal>
            <h2>{t.professionalExperience}</h2>
            <ol className="timeline">
              {experiences.map((item) => (
                <li key={item.id}>
                  <span className="period">
                    {formatPeriod(item.startDate, item.endDate, item.datePrecision, lang, t.present)}
                  </span>
                  <div>
                    <h3>{item.role}</h3>
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
          </section>
        )}

        {sections.includes('education') && (
          <section id="education" className="section" data-reveal>
            <h2>{t.education}</h2>
            <ol className="timeline">
              {education.map((item) => (
                <li key={item.id}>
                  <span className="period">
                    {formatPeriod(item.startDate, item.endDate, item.datePrecision, lang, t.present)}
                  </span>
                  <div>
                    <h3>{item.title}</h3>
                    <p className="subtitle">{item.institution}</p>
                  </div>
                </li>
              ))}
            </ol>
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
                  <CopyEmail email={profile.email} />
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
                </li>
              ))}
            </ul>
          </div>
          <ContactForm />
        </section>
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

function ContactForm() {
  const { t } = useLang();
  const [status, setStatus] = useState<{ sending: boolean; message?: string; error?: boolean }>({ sending: false });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus({ sending: true });
    try {
      await api('/contact', { method: 'POST', json: Object.fromEntries(new FormData(form)) });
      form.reset();
      setStatus({ sending: false, message: t.messageSent });
    } catch (error) {
      // The delivery channel isn't decided yet: the API validates the message, then answers 501.
      const message = error instanceof ApiError && error.status !== 501 ? error.message : t.contactUnavailable;
      setStatus({ sending: false, message, error: true });
    }
  };

  return (
    <form className="form" onSubmit={(event) => void submit(event)}>
      <label>
        {t.name}
        <input name="name" required maxLength={120} />
      </label>
      <label>
        {t.email}
        <input name="email" type="email" required maxLength={254} />
      </label>
      <label>
        {t.message}
        <textarea name="message" required maxLength={5000} rows={4} />
      </label>
      <button className="button button-accent" type="submit" disabled={status.sending} aria-busy={status.sending}>
        {status.sending ? t.sending : t.send}
      </button>
      {/* Always there: a live region announces changes to its text, not its arrival. */}
      <p className={status.error ? 'form-error' : 'form-message'} role="status">
        {status.message}
      </p>
    </form>
  );
}

/** Where the Clipboard API exists (secure contexts). The status line next to it is the visible and announced feedback. */
function CopyEmail({ email }: { email: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  if (!navigator.clipboard) return null;
  const copy = async () => {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <>
      <button
        type="button"
        className="button button-small copy"
        aria-label={t.copyEmail}
        onClick={() => void copy().catch(() => undefined)}
      >
        {t.copy}
      </button>
      <span className="copy-status" role="status">
        {copied ? t.emailCopied : ''}
      </span>
    </>
  );
}
