import { useRef, type RefObject } from 'react';
import { useLang } from '../lib/i18n';
import type { Project } from '../lib/types';

/** The whole card opens the project's details; Code/Demo stay direct links. */
export function ProjectCard({ project }: { project: Project }) {
  const { t } = useLang();
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <article className="card project-card">
      {project.imageUrl ? (
        <img className="project-image" src={project.imageUrl} alt="" loading="lazy" />
      ) : (
        <div className="project-image placeholder" aria-hidden="true" />
      )}
      <div className="project-body">
        <h3>
          {/* Its ::after covers the card, so a click anywhere on it opens the details. */}
          <button type="button" className="card-link" aria-haspopup="dialog" onClick={() => dialogRef.current?.showModal()}>
            {project.title}
          </button>
        </h3>
        <p className="muted clamp">{project.description}</p>
        <Tags tags={project.tags} />
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
      <ProjectDialog project={project} dialogRef={dialogRef} />
    </article>
  );
}

function ProjectDialog({ project, dialogRef }: { project: Project; dialogRef: RefObject<HTMLDialogElement | null> }) {
  const { t } = useLang();
  return (
    <dialog
      ref={dialogRef}
      className="modal project-modal"
      aria-labelledby={`project-${project.id}`}
      // A click on the backdrop lands on the <dialog> itself (its content fills the box): close it.
      onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
    >
      <div>
        {project.imageUrl && <img className="project-modal-image" src={project.imageUrl} alt="" />}
        <div className="project-modal-body">
          <div className="modal-header">
            <h2 id={`project-${project.id}`}>{project.title}</h2>
            <button type="button" className="button button-small" aria-label={t.close} onClick={() => dialogRef.current?.close()}>
              ✕
            </button>
          </div>
          <p className="body-text project-description">{project.description}</p>
          <Tags tags={project.tags} />
          {(project.repoUrl || project.demoUrl) && (
            <div className="actions">
              {project.demoUrl && (
                <a className="button button-accent" href={project.demoUrl} target="_blank" rel="noreferrer">
                  {t.demo}
                </a>
              )}
              {project.repoUrl && (
                <a className="button" href={project.repoUrl} target="_blank" rel="noreferrer">
                  {t.code}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <ul className="tags">
      {tags.map((tag) => (
        <li key={tag} className="tag tag-accent">
          {tag}
        </li>
      ))}
    </ul>
  );
}
