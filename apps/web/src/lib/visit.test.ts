// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { announceVisit, markAdminBrowser } from './visit';

vi.mock('./api', async (original) => ({ ...(await original<typeof import('./api')>()), api: vi.fn() }));
const mockApi = vi.mocked(api);
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
  mockApi.mockResolvedValue(undefined);
  vi.useFakeTimers({ now: new Date('2026-11-21T12:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
  mockApi.mockReset();
});

it('announces the first load, then makes no call on reloads or navigation for 24 hours', () => {
  announceVisit('/', 'pt');
  expect(mockApi).toHaveBeenCalledExactlyOnceWith('/visits', {
    method: 'POST',
    json: { page: '/', lang: 'pt', referrer: '' },
  });

  announceVisit('/projetos', 'pt'); // navigation
  announceVisit('/', 'en'); // reload, another language
  vi.advanceTimersByTime(24 * HOUR - 1);
  announceVisit('/', 'pt');
  expect(mockApi).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(1); // a day later: a new Visita
  announceVisit('/projetos', 'en');
  expect(mockApi).toHaveBeenCalledTimes(2);
});

it('never announces from the browser where the admin logged in', () => {
  markAdminBrowser();
  announceVisit('/', 'pt');
  expect(mockApi).not.toHaveBeenCalled();
});

it('ignores a failed announcement (the page never depends on it)', async () => {
  mockApi.mockRejectedValue(new Error('offline'));
  announceVisit('/', 'pt');
  await vi.runAllTimersAsync(); // an unhandled rejection would fail the test
});
