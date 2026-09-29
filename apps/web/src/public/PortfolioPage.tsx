import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError, api } from '../lib/api';
import { formatPeriod, useLang } from '../lib/i18n';
import type { Portfolio } from '../lib/types';
import { useFetch } from '../lib/use-fetch';
import { ProjectCard } from './ProjectCard';
import { SiteHeader } from './SiteHeader';

export function PortfolioPage() {
  const { lang, t } = useLang();
  const { data, error, loading } = useFetch<Portfolio>(`/portfolio?lang=${lang}`);

  if (!data) {
    return (
      <>
        <SiteHeader />
        <main className="status">{loading ? t.loading : error ? t.loadError : null}</main>
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

  return (
    <>
      <SiteHeader name={profile.name} />
      <main>
        <section className="hero">
          <p className="eyebrow">{profile.headline}</p>
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

        <section id="about" className="section about">
          {profile.photoUrl ? (
            <img className="photo" src={profile.photoUrl} alt={profile.name} />
          ) : (
            <div className="photo placeholder" aria-hidden="true" />
          )}
          <div>
            <h2>{t.aboutMe}</h2>
            {profile.about.map((paragraph, index) => (
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
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {skillCategories.length > 0 && (
          <section id="skills" className="section">
            <h2>{t.skills}</h2>
            <div className="grid grid-4">
              {skillCategories.map((category) => (
                <div key={category.id}>
                  <p className="eyebrow">{category.name}</p>
                  <ul className="tags">
                    {category.skills.map((skill) => (
                      <li key={skill.id} className="tag">
                        {skill.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <section id="projects" className="section">
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

        {experiences.length > 0 && (
          <section id="experience" className="section">
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

        {education.length > 0 && (
          <section id="education" className="section">
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

        {services.length > 0 && (
          <section id="services" className="section">
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

        <section id="contact" className="section contact">
          <div>
            <h2>{t.contact}</h2>
            <p className="body-text">{t.contactText}</p>
            <ul className="channels">
              {profile.email && (
                <li>
                  {t.email} — <a href={`mailto:${profile.email}`}>{profile.email}</a>
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

function ContactForm() {
  const { t } = useLang();
  const [status, setStatus] = useState<{ sending: boolean; message?: string }>({ sending: false });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus({ sending: true });
    try {
      await api('/contact', { method: 'POST', json: Object.fromEntries(form) });
      setStatus({ sending: false });
    } catch (error) {
      // The delivery channel isn't decided yet: the API validates the message, then answers 501.
      const message = error instanceof ApiError && error.status !== 501 ? error.message : t.contactUnavailable;
      setStatus({ sending: false, message });
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
      <button className="button button-accent" type="submit" disabled={status.sending}>
        {status.sending ? t.sending : t.send}
      </button>
      {status.message && (
        <p className="form-message" role="status">
          {status.message}
        </p>
      )}
    </form>
  );
}
