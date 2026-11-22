import { loadConfig } from '../src/config/config';

// The least a production boot needs, Google aside.
const production = {
  NODE_ENV: 'production',
  PUBLIC_URL: 'https://example.test',
  DATABASE_URL: 'postgresql://db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'r'.repeat(32),
  DISCORD_CONTACT_WEBHOOK_URL: 'https://discord.test/contact',
  DISCORD_ALERTS_WEBHOOK_URL: 'https://discord.test/alerts',
  DISCORD_VISITS_WEBHOOK_URL: 'https://discord.test/visits',
};

describe('loadConfig in production', () => {
  it('refuses to boot without the Login com Google config', () => {
    expect(() => loadConfig(production)).toThrow(/GOOGLE_CLIENT_ID[\s\S]*GOOGLE_CLIENT_SECRET[\s\S]*OAUTH_STATE_SECRET/);
  });

  it('boots with it', () => {
    const google = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', OAUTH_STATE_SECRET: 's'.repeat(32) };
    expect(loadConfig({ ...production, ...google }).GOOGLE_CLIENT_ID).toBe('id');
  });
});
