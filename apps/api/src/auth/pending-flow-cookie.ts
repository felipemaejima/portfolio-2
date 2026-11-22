import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { GoogleChecks } from './google.provider';

/**
 * What the trip to Google is for: a Login, or linking the Google account to the admin who started it (from the Conta
 * page). A link carries the admin's tokenVersion: a logout or password change meanwhile makes it fail.
 */
export type PendingIntent = { intent: 'login' } | { intent: 'vincular'; adminId: string; tokenVersion: number };
/** A Login pelo Google attempt, or a link, between its start and Google's callback. */
export type PendingFlow = PendingIntent & GoogleChecks;

export const PENDING_FLOW_TTL_MS = 10 * 60 * 1000;

const IV_BYTES = 12;
const TAG_BYTES = 16;
const key = (secret: string) => createHash('sha256').update(secret).digest(); // 32 bytes from a ≥ 32-char secret

/**
 * Seals the flow into the cookie value with AES-256-GCM, an authenticated cipher: the browser can neither read nor
 * change it, and only this API (OAUTH_STATE_SECRET) can open it. The expiry travels inside, so an old copy is refused
 * whatever the browser does with Max-Age.
 */
export function sealPendingFlow(flow: PendingFlow, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const plain = JSON.stringify({ ...flow, exp: Date.now() + PENDING_FLOW_TTL_MS });
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/** The flow, or undefined when the cookie is missing, altered, sealed with another key or expired. */
export function openPendingFlow(value: string | undefined, secret: string | undefined): PendingFlow | undefined {
  if (!value || !secret) return undefined;
  try {
    const raw = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(secret), raw.subarray(0, IV_BYTES), { authTagLength: TAG_BYTES });
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plain = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
    const { exp, ...flow } = JSON.parse(plain) as PendingFlow & { exp: number };
    return exp > Date.now() ? flow : undefined;
  } catch {
    return undefined; // a short tag throws in setAuthTag, any change in final()
  }
}
