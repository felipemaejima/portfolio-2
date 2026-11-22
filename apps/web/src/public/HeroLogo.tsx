import { logoLetters } from '../lib/logo';

const [f, m] = logoLetters;

// One of the two animations (styles.css, "Hero logo"), drawn once per page load: module scope, so it stays the same on
// re-renders, a language switch or coming back from /projetos.
const variant = Math.random() < 0.5 ? 'trace' : 'fit';

/** The hero's FM logo, animated. Decorative: the h1 already names the owner. */
export function HeroLogo() {
  if (variant === 'trace')
    return (
      <svg className="hero-logo trace" viewBox="0 0 279 198" aria-hidden="true">
        <defs>
          <clipPath id="hero-logo-clip">
            <path d={f} />
            <path d={m} />
          </clipPath>
          {/* Its colour, a theme token, is in styles.css (.hero-logo stop). */}
          <linearGradient id="hero-logo-sheen">
            <stop offset="0" stopOpacity="0" />
            <stop offset="0.5" stopOpacity="0.9" />
            <stop offset="1" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* pathLength 1: the outline draws itself with a dash offset from 1 to 0, whatever the letter's length. */}
        <path className="letter" pathLength={1} d={f} />
        <path className="letter" pathLength={1} d={m} />
        {/* A band of light slanted like the letters' cut ends (30°), clipped to them. */}
        <g clipPath="url(#hero-logo-clip)">
          <g className="sheen">
            <rect x="-90" y="-20" width="70" height="240" transform="skewX(-30)" fill="url(#hero-logo-sheen)" />
          </g>
        </g>
      </svg>
    );
  return (
    <svg className="hero-logo fit" viewBox="0 0 279 198" aria-hidden="true">
      <g className="echo">
        <path d={f} />
        <path d={m} />
      </g>
      <path className="f" d={f} />
      <path className="m" d={m} />
    </svg>
  );
}
