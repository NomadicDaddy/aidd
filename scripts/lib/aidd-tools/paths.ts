import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(moduleDir, '..', '..', '..');
const applicationsRoot = resolve(rootDir, '..');
const aiddEntry = join(rootDir, 'cli', 'src', 'index.ts');
const featureReviewSweep = join(rootDir, 'scripts', 'feature-review-sweep.ts');

export { aiddEntry, applicationsRoot, featureReviewSweep, rootDir };
