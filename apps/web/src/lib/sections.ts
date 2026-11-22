import type { Portfolio } from './types';

/** The home page's sections, in page order (PortfolioPage). `experience` is Trajetória: Experiência and Formação side by
 *  side, under the id old `/#experience` links point to (Formação's column keeps `education` for old `/#education` ones). */
const PAGE_ORDER = ['about', 'skills', 'projects', 'experience', 'services', 'contact'] as const;
export type Section = (typeof PAGE_ORDER)[number];

/** The sections the home page shows for this portfolio, in page order: PortfolioPage renders these, the header links to them. */
export function visibleSections({ profile, skillCategories, experiences, education, services }: Portfolio): Section[] {
  if (!profile) return []; // the page only says it's under construction
  const empty: Partial<Record<Section, boolean>> = {
    skills: !skillCategories.some((category) => category.skills.length > 0),
    experience: experiences.length === 0 && education.length === 0,
    services: services.length === 0,
  };
  return PAGE_ORDER.filter((section) => !empty[section]);
}
