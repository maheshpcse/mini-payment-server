import { validateDeploymentEnv } from '../config/deployment.js';

const errors = validateDeploymentEnv(process.env);
if (errors.length > 0) {
  process.stderr.write(`Deployment configuration invalid:\n- ${errors.join('\n- ')}\n`);
  process.exit(1);
}
process.stdout.write('Deployment configuration is valid.\n');
