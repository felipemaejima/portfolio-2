// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { LangProvider } from '../lib/i18n';
import type { Portfolio } from '../lib/types';
import { PortfolioPage } from './PortfolioPage';

vi.mock('../lib/api', async (original) => ({ ...(await original<typeof import('../lib/api')>()), api: vi.fn() }));
const mockApi = vi.mocked(api);
// jsdom has no IntersectionObserver (the header's active section uses it).
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });

beforeEach(() => localStorage.setItem('lang', 'pt'));
afterEach(() => {
  cleanup();
  mockApi.mockReset();
});

const portfolio: Portfolio = {
  profile: {
    name: 'Ana',
    headline: 'Dev',
    summary: 'Resumo',
    about: ['Abertura.', 'Mais.'],
    location: '',
    availability: 'Imediata',
    workModality: ' | ',
    spokenLanguages: 'Português | Inglês',
    email: null,
    phone: null,
    photoUrl: null,
  },
  socialLinks: [],
  skillCategories: [],
  projects: [],
  experiences: [],
  education: [],
  services: [],
};

it('lists only the facts the owner filled in', async () => {
  mockApi.mockImplementation(async (path) => (path.startsWith('/portfolio') ? portfolio : undefined));
  render(
    <LangProvider>
      <MemoryRouter>
        <PortfolioPage />
      </MemoryRouter>
    </LangProvider>,
  );
  expect(await screen.findByText('Disponibilidade')).toBeTruthy();
  expect(screen.getByText('Idiomas')).toBeTruthy();
  expect(screen.queryByText('Localização')).toBeNull();
  expect(screen.queryByText('Modalidade')).toBeNull();
});
