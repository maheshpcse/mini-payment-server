import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup/mongo-global.ts'],
    restoreMocks: true,
    // mongod startup and Argon2 hashing are slower than typical unit work.
    hookTimeout: 60_000,
    testTimeout: 15_000,
  },
});
