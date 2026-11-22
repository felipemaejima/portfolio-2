import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLang } from '../lib/i18n';
import type { Project } from '../lib/types';
import { LineIcon } from './LineIcon';
import { ProjectCard } from './ProjectCard';

/** Time between automatic steps, here and for the progress bar (--interval, styles.css). */
const INTERVAL = 5000;
const exposeInterval = (carousel: HTMLElement | null) => carousel?.style.setProperty('--interval', `${INTERVAL}ms`);
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
  // Reduced motion: no automatic steps at all, so no pause button nor progress bar; the visitor steps through it.
  const autoplay = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const hidden = useSyncExternalStore(onVisibilityChange, () => document.hidden);
  // It waits while being read (a mouse over it, keyboard focus in it), in a hidden tab, and when paused.
  const running = autoplay && !paused && !hovered && !focused && !hidden;
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
      ref={exposeInterval}
      className="carousel"
      aria-roledescription={t.carousel}
      aria-label={t.featuredProjects}
      // A mouse only: a tap also fires mouseenter, but no mouseleave until the next tap elsewhere.
      onPointerEnter={(event) => event.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      // Keyboard focus only (focus-visible): a tapped button keeps the focus, and would hold it until a tap elsewhere.
      onFocus={(event) => event.target.matches(':focus-visible') && setFocused(true)}
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
        {autoplay && (
          <>
            {/* Time to the next step: a CSS animation as long as the interval, restarted on each step, frozen while it waits. */}
            <span key={focus} className={running ? 'carousel-progress' : 'carousel-progress paused'} aria-hidden="true" />
            <button type="button" className="button" aria-label={paused ? t.resume : t.pause} title={paused ? t.resume : t.pause} onClick={() => setPaused(!paused)}>
              <LineIcon size={18}>
                <path d={paused ? 'M6 3l14 9-14 9z' : 'M6 4h4v16H6zM14 4h4v16h-4z'} />
              </LineIcon>
            </button>
          </>
        )}
        <button type="button" className="button" aria-label={t.previousProject} title={t.previousProject} onClick={() => go(-1)}>
          <LineIcon size={18}>
            <path d="m15 18-6-6 6-6" />
          </LineIcon>
        </button>
        <button type="button" className="button" aria-label={t.nextProject} title={t.nextProject} onClick={() => go(1)}>
          <LineIcon size={18}>
            <path d="m9 18 6-6-6-6" />
          </LineIcon>
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
