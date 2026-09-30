import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';

/** Env var -> parameter name under SECRETS_SSM_PREFIX. */
const SECRETS = {
  DATABASE_URL: 'database-url',
  JWT_ACCESS_SECRET: 'jwt-access-secret',
  JWT_REFRESH_SECRET: 'jwt-refresh-secret',
} as const;

type SsmClient = Pick<SSMClient, 'send'>;

/**
 * In production the secrets are not in the function's environment variables — anyone able to read the Lambda's
 * configuration (e.g. the CI deploy role) would see them in plain text. Only their SSM location is: they're read
 * once at boot with the function's own role, before the app (and its config validation) starts.
 * Without SECRETS_SSM_PREFIX (local dev, tests) this does nothing and the regular environment is used.
 */
export async function loadSecretsFromSsm(env: NodeJS.ProcessEnv = process.env, ssm: SsmClient = new SSMClient({})) {
  const prefix = env.SECRETS_SSM_PREFIX;
  if (!prefix) return;

  const names = Object.values(SECRETS).map((name) => `${prefix}/${name}`);
  const result = await ssm.send(new GetParametersCommand({ Names: names, WithDecryption: true }));
  if (result.InvalidParameters?.length) {
    throw new Error(`Missing SSM parameters: ${result.InvalidParameters.join(', ')}`);
  }

  const values = new Map((result.Parameters ?? []).map((p) => [p.Name, p.Value]));
  for (const [key, name] of Object.entries(SECRETS)) {
    const value = values.get(`${prefix}/${name}`);
    if (!value) throw new Error(`Missing SSM parameter: ${prefix}/${name}`);
    env[key] = value;
  }
}
