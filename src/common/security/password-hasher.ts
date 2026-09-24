import argon2 from 'argon2';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  /** Runs a verification against a fixed hash so unknown accounts take as long as known ones. */
  verifyDummy(password: string): Promise<void>;
}

/** OWASP Password Storage Cheat Sheet minimum for Argon2id: 19 MiB, 2 iterations, 1 lane. */
export const OWASP_ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function createPasswordHasher(params: { memoryCost: number; timeCost: number; parallelism: number } = OWASP_ARGON2): PasswordHasher {
  const options = { type: argon2.argon2id as 2, ...params, raw: false as const };
  let dummyHash: Promise<string> | undefined;

  return {
    hash: (password) => argon2.hash(password, options),
    async verify(hash, password) {
      try {
        return await argon2.verify(hash, password);
      } catch {
        return false;
      }
    },
    async verifyDummy(password) {
      dummyHash ??= argon2.hash('dummy-password-for-timing', options);
      await argon2.verify(await dummyHash, password).catch(() => false);
    },
  };
}
