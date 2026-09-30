import { GetParametersCommand } from '@aws-sdk/client-ssm';
import { loadSecretsFromSsm } from '../src/ssm-secrets';

// Fake SSM: answers GetParameters from a map, reporting unknown names as invalid (like the real API).
const fakeSsm = (stored: Record<string, string>) => ({
  send: jest.fn(async (command: GetParametersCommand) => {
    const names = command.input.Names ?? [];
    return {
      Parameters: names.filter((n) => n in stored).map((n) => ({ Name: n, Value: stored[n] })),
      InvalidParameters: names.filter((n) => !(n in stored)),
    };
  }),
});

describe('loadSecretsFromSsm', () => {
  it('fills the secret env vars from SSM, decrypted, when SECRETS_SSM_PREFIX is set', async () => {
    const env: NodeJS.ProcessEnv = { SECRETS_SSM_PREFIX: '/portfolio/prod' };
    const ssm = fakeSsm({
      '/portfolio/prod/database-url': 'postgresql://db',
      '/portfolio/prod/jwt-access-secret': 'access',
      '/portfolio/prod/jwt-refresh-secret': 'refresh',
    });

    await loadSecretsFromSsm(env, ssm as never);

    expect(env).toMatchObject({ DATABASE_URL: 'postgresql://db', JWT_ACCESS_SECRET: 'access', JWT_REFRESH_SECRET: 'refresh' });
    expect(ssm.send.mock.calls[0][0].input.WithDecryption).toBe(true);
  });

  it('refuses to boot when a secret is missing', async () => {
    const ssm = fakeSsm({ '/portfolio/prod/database-url': 'postgresql://db' });
    await expect(loadSecretsFromSsm({ SECRETS_SSM_PREFIX: '/portfolio/prod' }, ssm as never)).rejects.toThrow(
      /jwt-access-secret.*jwt-refresh-secret/,
    );
  });

  it('does nothing without SECRETS_SSM_PREFIX (local dev keeps its .env)', async () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: 'local' };
    const ssm = fakeSsm({});
    await loadSecretsFromSsm(env, ssm as never);
    expect(env).toEqual({ DATABASE_URL: 'local' });
    expect(ssm.send).not.toHaveBeenCalled();
  });
});
