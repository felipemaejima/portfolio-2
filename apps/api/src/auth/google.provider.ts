import { Inject, Injectable } from '@nestjs/common';
import type { Configuration } from 'openid-client';
import { CONFIG, type Config } from '../config/config';

/** Values of one Login pelo Google attempt, fresh each time, bound to the browser by the pending-flow cookie. */
export type GoogleChecks = { state: string; nonce: string; codeVerifier: string };
/** The Google account Google vouches for: `subject` (the `sub`) is what counts; `email` is for display only. */
export type GoogleAccount = { subject: string; email: string };

export const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback';

/**
 * The only place that talks to Google (OpenID Connect, Authorization Code with PKCE; ADR 0002), and the only one the
 * e2e tests replace. openid-client validates the ID token's `iss`, `aud`, `exp` and `nonce`; no Google token is kept.
 * openid-client is ESM-only: it is imported on first use, which also keeps it off the cold start of other requests.
 */
@Injectable()
export class GoogleProvider {
  private configuration?: Promise<Configuration>;

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  async authorizationUrl({ state, nonce, codeVerifier }: GoogleChecks): Promise<string> {
    const oidc = await import('openid-client');
    const url = oidc.buildAuthorizationUrl(await this.discover(), {
      redirect_uri: this.redirectUri(),
      scope: 'openid email',
      prompt: 'select_account', // leaving the panel doesn't log out of Google: always ask which account
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });
    return url.href;
  }

  /** Exchanges the callback's parameters (code, state, iss…) for the Google account; throws on any failed check. */
  async exchange(callback: URLSearchParams, { state, nonce, codeVerifier }: GoogleChecks): Promise<GoogleAccount> {
    const oidc = await import('openid-client');
    // The token request's redirect_uri is this URL without its query: it must be the registered one, never the Host's.
    const currentUrl = new URL(`${this.redirectUri()}?${callback}`);
    const tokens = await oidc.authorizationCodeGrant(await this.discover(), currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState: state,
      expectedNonce: nonce,
      idTokenExpected: true,
    });
    const { sub, email } = tokens.claims()!;
    if (typeof email !== 'string') throw new Error('ID token without email');
    return { subject: sub, email };
  }

  /** From PUBLIC_URL, never from the Host header (behind CloudFront it is the Lambda's own host). */
  private redirectUri() {
    return `${this.config.PUBLIC_URL}${GOOGLE_CALLBACK_PATH}`;
  }

  /** Lazy, once per instance and kept in memory; a failure is retried on the next use. */
  private discover() {
    this.configuration ??= import('openid-client')
      .then((oidc) =>
        oidc.discovery(
          new URL('https://accounts.google.com'),
          this.config.GOOGLE_CLIENT_ID!,
          this.config.GOOGLE_CLIENT_SECRET!,
          undefined,
          { timeout: 5 }, // seconds, for every request to Google: well inside the Lambda's 15 s
        ),
      )
      .catch((error: unknown) => {
        this.configuration = undefined;
        throw error;
      });
    return this.configuration;
  }
}
