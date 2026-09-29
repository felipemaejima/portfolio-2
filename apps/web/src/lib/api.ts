/**
 * API client. Its shape comes from CloudFront OAC in front of the Lambda (see infra/README.md):
 * - every request that may carry a body sends `x-amz-content-sha256` (hex SHA-256 of the exact body, or of "");
 * - the access token travels in `X-Authorization` (CloudFront overwrites `Authorization` with its signature);
 * - uploads send the raw file as the body.
 * The access token lives only in memory; the httpOnly refresh cookie restores it (refreshSession).
 */
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Options = { method?: string; json?: unknown; file?: Blob; auth?: boolean };

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const response = await send(path, options);
  // Expired access token: renew it once with the refresh cookie and retry.
  if (response.status === 401 && options.auth && (await refreshSession())) return parse<T>(await send(path, options));
  return parse<T>(response);
}

/** Shared by concurrent callers, so a burst of 401s triggers a single refresh. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= send('/auth/refresh', { method: 'POST' })
    .then(async (response) => {
      accessToken = response.ok ? ((await response.json()) as { accessToken: string }).accessToken : null;
      return response.ok;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function login(email: string, password: string) {
  accessToken = (await api<{ accessToken: string }>('/auth/login', { method: 'POST', json: { email, password } })).accessToken;
}

export async function logout() {
  try {
    await api('/auth/logout', { method: 'POST', auth: true });
  } finally {
    accessToken = null;
  }
}

/** For the session ending on the server side (e.g. password change). */
export function forgetSession() {
  accessToken = null;
}

async function send(path: string, { method = 'GET', json, file, auth }: Options) {
  const headers: Record<string, string> = {};
  let body: string | Blob | undefined;
  if (json !== undefined) {
    body = JSON.stringify(json);
    headers['Content-Type'] = 'application/json';
  } else if (file) {
    body = file;
    headers['Content-Type'] = file.type || 'application/octet-stream';
  }
  if (method !== 'GET' && method !== 'HEAD') headers['x-amz-content-sha256'] = await sha256Hex(body ?? '');
  if (auth && accessToken) headers['X-Authorization'] = `Bearer ${accessToken}`;
  return fetch(`/api${path}`, { method, headers, body, credentials: 'same-origin' });
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, errorMessage(data) ?? response.statusText);
  return data as T;
}

function errorMessage(data: unknown): string | undefined {
  const message = (data as { message?: string | string[] } | null)?.message;
  return Array.isArray(message) ? message.join('; ') : message;
}

async function sha256Hex(body: string | Blob): Promise<string> {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(await body.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
