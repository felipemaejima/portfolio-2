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
    expect(visibleSections(full)).toEqual(['about', 'skills', 'projects', 'experience', 'education', 'services', 'contact']);
  });

  it('leaves out experience, education and services when they have no items', () => {
    expect(visibleSections({ ...full, experiences: [], services: [] })).toEqual(['about', 'skills', 'projects', 'education', 'contact']);
    expect(visibleSections({ ...full, education: [] })).toEqual(['about', 'skills', 'projects', 'experience', 'services', 'contact']);
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
