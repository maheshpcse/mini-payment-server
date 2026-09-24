import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

/**
 * Starts one single-node replica set for the whole run (transactions need a
 * replica set). Set MONGODB_TEST_URI to reuse an existing replica set instead.
 */
export default async function setup(project: TestProject) {
  const external = process.env.MONGODB_TEST_URI;
  if (external) {
    project.provide('mongoUri', external);
    return;
  }
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  project.provide('mongoUri', replSet.getUri());
  return async () => {
    await replSet.stop();
  };
}
