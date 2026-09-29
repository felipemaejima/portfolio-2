// Shapes of the public API responses (GET /api/portfolio, GET /api/projects), already resolved to one language.
export type DatePrecision = 'MONTH' | 'YEAR';

export type Project = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  repoUrl: string | null;
  demoUrl: string | null;
  featured: boolean;
  imageUrl: string | null;
};

export type Portfolio = {
  profile: {
    name: string;
    headline: string;
    summary: string;
    about: string[];
    location: string;
    availability: string;
    workModality: string;
    spokenLanguages: string;
    email: string | null;
    phone: string | null;
    photoUrl: string | null;
  } | null;
  socialLinks: { id: string; label: string; url: string }[];
  skillCategories: { id: string; name: string; skills: { id: string; name: string }[] }[];
  projects: Project[];
  experiences: {
    id: string;
    role: string;
    company: string;
    bullets: string[];
    startDate: string;
    endDate: string | null;
    datePrecision: DatePrecision;
  }[];
  education: {
    id: string;
    title: string;
    institution: string;
    kind: 'DEGREE' | 'CERTIFICATION' | 'COURSE';
    startDate: string | null;
    endDate: string | null;
    datePrecision: DatePrecision;
  }[];
  services: { id: string; title: string; description: string }[];
};

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
