import { describe, expect, it } from 'vitest';
import { visibleSections } from './sections';
import type { Portfolio } from './types';

const date = '2020-01-01T00:00:00.000Z';
const full: Portfolio = {
  profile: {
    name: 'Ana', headline: 'Dev', summary: '', about: [], location: '', availability: '', workModality: '',
    spokenLanguages: '', email: null, phone: null, photoUrl: null,
  },
  socialLinks: [],
  skillCategories: [{ id: 'c', name: 'Linguagens', skills: [{ id: 's', name: 'TypeScript' }] }],
  projects: [],
  experiences: [{ id: 'x', role: 'Dev', company: 'ACME', bullets: [], startDate: date, endDate: null, datePrecision: 'MONTH' }],
  education: [{ id: 'e', title: 'BSc', institution: 'USP', kind: 'DEGREE', startDate: date, endDate: date, datePrecision: 'YEAR' }],
  services: [{ id: 'v', title: 'Sites', description: '' }],
};

describe('visibleSections', () => {
  it('lists every section in page order when all have content', () => {
    expect(visibleSections(full)).toEqual(['about', 'skills', 'projects', 'experience', 'services', 'contact']);
  });

  // Trajetória keeps the id `experience` and holds Experiência and Formação: Formação is no section of its own.
  it('shows Trajetória when there is experience, education or both, never a separate education section', () => {
    const trajectory = ['about', 'skills', 'projects', 'experience', 'services', 'contact'];
    expect(visibleSections({ ...full, education: [] })).toEqual(trajectory);
    expect(visibleSections({ ...full, experiences: [] })).toEqual(trajectory);
    expect(visibleSections(full)).toEqual(trajectory);
  });

  it('leaves out Trajetória when there is neither experience nor education', () => {
    expect(visibleSections({ ...full, experiences: [], education: [] })).toEqual(['about', 'skills', 'projects', 'services', 'contact']);
  });

  it('leaves out services when there are none', () => {
    expect(visibleSections({ ...full, services: [] })).toEqual(['about', 'skills', 'projects', 'experience', 'contact']);
  });

  it('leaves out skills when no category has any skill', () => {
    const emptyCategories = [{ id: 'c', name: 'Linguagens', skills: [] }];
    expect(visibleSections({ ...full, skillCategories: emptyCategories })).not.toContain('skills');
    expect(visibleSections({ ...full, skillCategories: [] })).not.toContain('skills');
  });

  it('lists nothing while there is no profile (the page is under construction)', () => {
    expect(visibleSections({ ...full, profile: null })).toEqual([]);
  });
});
