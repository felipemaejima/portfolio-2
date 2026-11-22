// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LangProvider } from '../lib/i18n';
import type { Project } from '../lib/types';
import { FeaturedProjects } from './FeaturedProjects';

// What jsdom lacks: modal dialogs and media queries (here: whether the visitor asked for reduced motion).
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
let reducedMotion = false;
vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') && reducedMotion }));

beforeEach(() => {
  localStorage.setItem('lang', 'pt');
  reducedMotion = false;
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const projects = (count: number): Project[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    title: `Projeto ${index + 1}`,
    description: '',
    tags: [],
    repoUrl: null,
    demoUrl: null,
    featured: true,
    imageUrl: null,
  }));
const renderProjects = (count: number) =>
  render(
    <LangProvider>
      <FeaturedProjects projects={projects(count)} />
    </LangProvider>,
  );
const carousel = () => screen.queryByRole('region', { name: 'Projetos em destaque' });

it('shows one or two Projetos em destaque still, with no carousel', () => {
  renderProjects(2);
  expect(carousel()).toBeNull();
  expect(screen.queryByRole('button', { name: 'Próximo projeto' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Projeto 1' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Projeto 2' })).toBeTruthy();
});

/** The counter's visible text, "02 / 05". */
const counter = () => within(carousel()!).getByText(/^\d\d \/ \d\d$/).textContent;
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

it('advances to the next project every 5 seconds, and the counter follows', () => {
  renderProjects(5);
  expect(carousel()).toBeTruthy();
  expect(counter()).toBe('01 / 05');
  wait(4999);
  expect(counter()).toBe('01 / 05');
  wait(1);
  expect(counter()).toBe('02 / 05');
  wait(5000);
  expect(counter()).toBe('03 / 05');
});

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

it('goes round with previous and next, both ways', () => {
  renderProjects(3);
  click('Projeto anterior');
  expect(counter()).toBe('03 / 03');
  click('Próximo projeto');
  expect(counter()).toBe('01 / 03');
  click('Próximo projeto');
  click('Próximo projeto');
  expect(counter()).toBe('03 / 03');
  click('Próximo projeto');
  expect(counter()).toBe('01 / 03');
});

it('stops with Pausar and goes on with Retomar', () => {
  renderProjects(5);
  wait(2000);
  click('Pausar');
  wait(10000);
  expect(counter()).toBe('01 / 05');
  click('Retomar');
  // It picks up where it stopped: 3s were left.
  wait(3000);
  expect(counter()).toBe('02 / 05');
  expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();
});

it('waits while the mouse is over it or the focus is in it', () => {
  renderProjects(5);
  fireEvent.pointerEnter(carousel()!, { pointerType: 'mouse' });
  wait(10000);
  expect(counter()).toBe('01 / 05');
  fireEvent.pointerLeave(carousel()!, { pointerType: 'mouse' });
  wait(5000);
  expect(counter()).toBe('02 / 05');

  act(() => screen.getByRole('button', { name: 'Próximo projeto' }).focus());
  expect(counter()).toBe('02 / 05');
  wait(10000);
  expect(counter()).toBe('02 / 05');
  act(() => screen.getByRole('button', { name: 'Próximo projeto' }).blur());
  wait(5000);
  expect(counter()).toBe('03 / 05');
});

it('goes on after a tap on a touch screen', () => {
  renderProjects(5);
  // What a tap fires: the touch pointer comes and goes, then the compatibility mouse events, which never leave.
  const target = carousel()!.querySelector('p')!;
  fireEvent.pointerEnter(target, { pointerType: 'touch' });
  fireEvent.pointerDown(target, { pointerType: 'touch' });
  fireEvent.pointerUp(target, { pointerType: 'touch' });
  fireEvent.pointerLeave(target, { pointerType: 'touch' });
  fireEvent.mouseEnter(target);
  fireEvent.click(target);
  wait(5000);
  expect(counter()).toBe('02 / 05');
});

it('waits while the tab is hidden', () => {
  renderProjects(5);
  const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
  };
  setHidden(true);
  wait(10000);
  expect(counter()).toBe('01 / 05');
  setHidden(false);
  wait(5000);
  expect(counter()).toBe('02 / 05');
});

it("doesn't advance by itself, nor offer to, when the visitor asked for reduced motion", () => {
  reducedMotion = true;
  renderProjects(5);
  expect(screen.queryByRole('button', { name: 'Retomar' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull();
  wait(10000);
  expect(counter()).toBe('01 / 05');
  click('Próximo projeto');
  expect(counter()).toBe('02 / 05');
  click('Projeto 3');
  expect(counter()).toBe('03 / 05');
  wait(10000);
  expect(counter()).toBe('03 / 05');
  expect(carousel()!.querySelector('[aria-live]')!.getAttribute('aria-live')).toBe('polite');
});

/** The project details dialog that is open, if any. */
const openDetails = () => screen.queryAllByRole('dialog', { hidden: true }).find((dialog) => (dialog as HTMLDialogElement).open);

it('brings a side project to the centre when clicked, without opening it', () => {
  renderProjects(5);
  click('Projeto 5');
  expect(counter()).toBe('05 / 05');
  click('Projeto 1');
  expect(counter()).toBe('01 / 05');
  click('Projeto 2');
  expect(counter()).toBe('02 / 05');
  expect(openDetails()).toBeUndefined();
});

it('opens the details of the projeto em foco when clicked', () => {
  renderProjects(5);
  click('Próximo projeto');
  click('Projeto 2');
  expect(within(openDetails()!).getByRole('heading', { name: 'Projeto 2', hidden: true })).toBeTruthy();
});

it('announces only the changes the visitor makes: silent while it plays, polite while it waits', () => {
  renderProjects(5);
  const live = () => carousel()!.querySelector('[aria-live]')!;
  expect(live().getAttribute('aria-live')).toBe('off');
  click('Pausar');
  expect(live().getAttribute('aria-live')).toBe('polite');
  click('Próximo projeto');
  expect(live().textContent).toContain('Projeto 2');
});
