import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, '..', '..', '..');
export const defaultManifestPath = path.join(repoRoot, 'benchmarks', 'manifest.json');
export const defaultResultsDir = path.join(repoRoot, 'benchmarks', 'results');
export const defaultWorkspacesDir = path.join(repoRoot, 'benchmarks', 'workspaces');
export const cliEntryPath = path.join(repoRoot, 'cli', 'src', 'index.ts');
export const benchmarkDirtyTreeThreshold = '1000';

export const backendNames = [
	'native',
	'ollama',
	'lmstudio',
	'claude-code',
	'opencode',
	'kilocode',
	'codex',
] as const;
