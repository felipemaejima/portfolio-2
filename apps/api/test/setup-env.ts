import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Suites truncate every table: refuse to run against anything but a *_test database.
if (!/_test(\?|$)/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('E2E tests must run against a *_test database (use `make test`).');
}
process.env.NODE_ENV = 'test';
process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'uploads-'));
