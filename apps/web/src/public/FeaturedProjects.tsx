import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLang } from '../lib/i18n';
import type { Project } from '../lib/types';
import { ProjectCard } from './ProjectCard';

const INTERVAL = 5000;
const pad = (n: number) => String(n).padStart(2, '0');
const onVisibilityChange = (callback: () => void) => {
  document.addEventListener('visibilitychange', callback);
  return () => document.removeEventListener('visibilitychange', callback);
};

/** The home's Projetos em destaque: a carousel from three on; one or two stay still, centred. */
export function FeaturedProjects({ projects }: { projects: Project[] }) {
  // Keyed by the count: if a refetch (another language) brings a different number, it starts over at the first.
  if (projects.length >= 3) return <Carousel key={projects.length} projects={projects} />;
  return (
    <div className="featured-still">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}

function Carousel({ projects }: { projects: Project[] }) {
  const { t } = useLang();
  const count = projects.length;
  // Below five the loop's seam would show: a card crossing from one side to the other in view. Two copies keep the
  // crossing out of view (the copy not shown is inert).
  const slides = count < 5 ? [...projects, ...projects] : projects;
  const total = slides.length;
  // The projeto em foco, the slide in the centre.
  const [focus, setFocus] = useState(0);
  const go = (step: number) => setFocus((current) => (current + step + total) % total);
  const label = (index: number) => t.slideOf.replace('{n}', String((index % count) + 1)).replace('{total}', String(count));
  // Reduced motion: it starts paused; Retomar is there for whoever wants it to run anyway.
  const [paused, setPaused] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const hidden = useSyncExternalStore(onVisibilityChange, () => document.hidden);
  // It waits while being read (mouse over it, focus in it), in a hidden tab, and when paused.
  const running = !paused && !hovered && !focused && !hidden;
  const swipeX = useRef<number | null>(null);

  // Time left to the next step. A pause keeps it, so the timer picks up where the progress bar stopped; a step resets it.
  const left = useRef(INTERVAL);
  const shown = useRef(focus);
  useEffect(() => {
    if (shown.current !== focus) {
      shown.current = focus;
      left.current = INTERVAL;
    }
    if (!running) return;
    const start = Date.now();
    const timer = setTimeout(() => setFocus((focus + 1) % total), left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - start;
    };
  }, [running, focus, total]);

  return (
    <section
      className="carousel"
      aria-roledescription={t.carousel}
      aria-label={t.featuredProjects}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setFocused(false)}
    >
      <div className="carousel-controls">
        {/* The live region: it names the projeto em foco after a change the visitor made, not after the automatic ones. */}
        <p className="carousel-counter" aria-live={running ? 'off' : 'polite'} aria-atomic="true">
          <span aria-hidden="true">
            {pad((focus % count) + 1)} / {pad(count)}
          </span>
          <span className="visually-hidden">
            {label(focus)}: {slides[focus].title}
          </span>
        </p>
        {/* Time to the next step: a CSS animation as long as the interval, restarted on each step, frozen while it waits. */}
        <span key={focus} className={running ? 'carousel-progress' : 'carousel-progress paused'} aria-hidden="true" />
        <button type="button" className="button" aria-label={paused ? t.resume : t.pause} title={paused ? t.resume : t.pause} onClick={() => setPaused(!paused)}>
          <Icon path={paused ? 'M6 3l14 9-14 9z' : 'M6 4h4v16H6zM14 4h4v16h-4z'} />
        </button>
        <button type="button" className="button" aria-label={t.previousProject} title={t.previousProject} onClick={() => go(-1)}>
          <Icon path="m15 18-6-6 6-6" />
        </button>
        <button type="button" className="button" aria-label={t.nextProject} title={t.nextProject} onClick={() => go(1)}>
          <Icon path="m9 18 6-6-6-6" />
        </button>
      </div>
      <div
        className="carousel-track"
        // Touch and pen: a sideways drag of 40px or more steps (touch-action hands those to us; vertical ones still scroll).
        onPointerDown={(event) => {
          swipeX.current = event.pointerType === 'mouse' ? null : event.clientX;
        }}
        onPointerUp={(event) => {
          const dx = event.clientX - (swipeX.current ?? event.clientX);
          if (Math.abs(dx) >= 40) go(dx < 0 ? 1 : -1);
        }}
      >
        {slides.map((project, index) => {
          // Circular distance to the projeto em foco: −1, 0 and 1 are in view, the others wait just outside, inert.
          let pos = (index - focus + total) % total;
          if (pos > total / 2) pos -= total;
          return (
            <div
              key={index}
              className="slide"
              data-pos={Math.max(-2, Math.min(2, pos))}
              role="group"
              aria-roledescription={t.slide}
              aria-label={label(index)}
              inert={Math.abs(pos) > 1}
              // A side card comes to the centre instead of opening (its links included).
              onClickCapture={(event) => {
                if (!pos) return;
                event.preventDefault();
                event.stopPropagation();
                go(pos);
              }}
            >
              <ProjectCard project={project} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Line icons from Lucide (ISC license): chevrons, pause, play. */
function Icon({ path }: { path: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
