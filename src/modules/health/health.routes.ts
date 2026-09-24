import { Router } from 'express';
import type { DependencyCheck, DependencyStatus } from './health.types.js';

export interface HealthRouteOptions {
  version: string;
  environment: string;
  providerMode: string;
  readinessChecks: DependencyCheck[];
}

async function runCheck(check: DependencyCheck): Promise<DependencyStatus> {
  const started = performance.now();
  try {
    await check.check();
    return { name: check.name, status: 'up', latencyMs: Math.round(performance.now() - started) };
  } catch {
    // Failure reasons can contain hostnames; they are logged by the connection module, not returned.
    return { name: check.name, status: 'down', latencyMs: Math.round(performance.now() - started) };
  }
}

export function createHealthRouter(options: HealthRouteOptions): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      data: {
        status: 'ok',
        service: 'mini-payment-server',
        version: options.version,
        environment: options.environment,
        providerMode: options.providerMode,
        uptimeSeconds: Math.round(process.uptime()),
      },
    });
  });

  router.get('/ready', async (_req, res) => {
    const dependencies = await Promise.all(options.readinessChecks.map(runCheck));
    const ready = dependencies.every((dependency) => dependency.status === 'up');
    res.status(ready ? 200 : 503).json({ data: { status: ready ? 'ready' : 'not_ready', dependencies } });
  });

  return router;
}
