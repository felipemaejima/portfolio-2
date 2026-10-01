import { useSearchParams } from 'react-router';
import { useLang } from '../lib/i18n';
import type { Page, Project } from '../lib/types';
import { useFetch } from '../lib/use-fetch';
import { ProjectCard } from './ProjectCard';
import { SiteHeader } from './SiteHeader';

const PAGE_SIZE = 12;

/** All visible projects. Filters live in the URL, so a filtered list can be shared. */
export function ProjectsPage() {
  const { lang, t } = useLang();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);

  const query = new URLSearchParams(params);
  query.set('lang', lang);
  query.set('pageSize', String(PAGE_SIZE));
  const { data, error, loading } = useFetch<Page<Project>>(`/projects?${query}`);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <SiteHeader />
      <main className="section">
        <h1>{t.allProjects}</h1>
        <form className="filters" onSubmit={(event) => event.preventDefault()}>
          <input
            type="search"
            aria-label={t.search}
            placeholder={t.search}
            defaultValue={params.get('q') ?? ''}
            onChange={(event) => update({ q: event.target.value.trim() || null })}
          />
          <input
            aria-label={t.tagsPlaceholder}
            placeholder={t.tagsPlaceholder}
            defaultValue={params.get('tags') ?? ''}
            onChange={(event) => update({ tags: event.target.value.replace(/\s+/g, '') || null })}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={params.get('tagsMode') === 'all'}
              onChange={(event) => update({ tagsMode: event.target.checked ? 'all' : null })}
            />
            {t.allTagsRequired}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={params.get('featured') === 'true'}
              onChange={(event) => update({ featured: event.target.checked ? 'true' : null })}
            />
            {t.featuredOnly}
          </label>
          <select
            aria-label="Ordem"
            value={params.get('sort') ?? 'position'}
            onChange={(event) => update({ sort: event.target.value === 'position' ? null : event.target.value })}
          >
            <option value="position">{t.manualOrder}</option>
            <option value="-createdAt">{t.newest}</option>
          </select>
        </form>

        {loading && !data && <p className="status loading">{t.loading}</p>}
        {error ? <p className="status">{t.loadError}</p> : null}
        {data && data.items.length === 0 && <p className="status">{t.noProjects}</p>}
        <div className="grid grid-3 fade-items" aria-busy={loading}>
          {data?.items.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
        {data && lastPage > 1 && (
          <nav className="pagination" aria-label="Paginação">
            <button type="button" className="button" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
              {t.previous}
            </button>
            <span>
              {page} / {lastPage}
            </span>
            <button
              type="button"
              className="button"
              disabled={page >= lastPage}
              onClick={() => update({ page: String(page + 1) })}
            >
              {t.next}
            </button>
          </nav>
        )}
      </main>
    </>
  );
}
