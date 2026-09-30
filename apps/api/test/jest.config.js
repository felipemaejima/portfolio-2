/** The whole app over HTTP against a real Postgres (see Makefile `test`). */
module.exports = {
  rootDir: '..',
  // e2e suites (HTTP against the real app) plus a few unit specs of boot-time logic.
  testRegex: 'test/.*\\.(e2e-)?spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  // The generated Prisma client imports its TS siblings as `./x.js`.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
};
