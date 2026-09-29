import { useLang } from '../lib/i18n';
import type { Project } from '../lib/types';

export function ProjectCard({ project }: { project: Project }) {
  const { t } = useLang();
  return (
    <article className="card project-card">
      {project.imageUrl ? (
        <img className="project-image" src={project.imageUrl} alt="" loading="lazy" />
      ) : (
        <div className="project-image placeholder" aria-hidden="true" />
      )}
      <div className="project-body">
        <h3>{project.title}</h3>
        <p className="muted">{project.description}</p>
        <ul className="tags">
          {project.tags.map((tag) => (
            <li key={tag} className="tag tag-accent">
              {tag}
            </li>
          ))}
        </ul>
        <div className="project-links">
          {project.repoUrl && (
            <a href={project.repoUrl} target="_blank" rel="noreferrer">
              {t.code}
            </a>
          )}
          {project.demoUrl && (
            <a href={project.demoUrl} target="_blank" rel="noreferrer">
              {t.demo}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
