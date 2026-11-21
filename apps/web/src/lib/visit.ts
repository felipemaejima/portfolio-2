import { api } from './api';
import type { Lang } from './i18n';

const ANNOUNCED_AT = 'visit-announced-at';
const ADMIN_BROWSER = 'admin-browser';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tells the API about a Visita (GLOSSARY.md): at most once per 24 hours in this browser, never in the one where the
 * admin logged in, so reloading or navigating makes no call. Fire-and-forget: the page never waits on it (the API also
 * limits per IP and site-wide). Without storage (blocked) it stays silent rather than announce on every load.
 */
export function announceVisit(page: '/' | '/projetos', lang: Lang) {
  try {
    if (localStorage.getItem(ADMIN_BROWSER)) return;
    if (Date.now() - Number(localStorage.getItem(ANNOUNCED_AT)) < DAY_MS) return;
    localStorage.setItem(ANNOUNCED_AT, String(Date.now()));
  } catch {
    return;
  }
  api('/visits', { method: 'POST', json: { page, lang, referrer: document.referrer } }).catch(() => undefined);
}

/** The public site and the admin share the origin (and so the storage): the admin's own browsing is never a Visita. */
export function markAdminBrowser() {
  try {
    localStorage.setItem(ADMIN_BROWSER, '1');
  } catch {
    /* storage blocked: nothing to remember */
  }
}
