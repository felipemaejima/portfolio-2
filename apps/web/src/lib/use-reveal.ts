import { useEffect } from 'react';

/** Fades each `[data-reveal]` element in once, the first time it scrolls into view (styles.css). Re-scans when `ready` changes. */
export function useReveal(ready: unknown) {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -40px 0px' },
    );
    document.querySelectorAll('[data-reveal]:not(.revealed)').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [ready]);
}
