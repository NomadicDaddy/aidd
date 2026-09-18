import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, '..', '..', '..');
export const defaultManifestPath = path.join(repoRoot, 'benchmarks', 'manifest.json');
export const defaultResultsDir = path.join(repoRoot, 'benchmarks', 'results');
export const defaultWorkspacesDir = path.join(repoRoot, 'benchmarks', 'workspaces');
export const cliEntryPath = path.join(repoRoot, 'cli', 'src', 'index.ts');
export const benchmarkDirtyTreeThreshold = '1000';

// Mirrors the canonical backendNames in shared/src/plan/types.ts. This copy had drifted:
// 'grok' and 'openai' existed as real aidd backends but were rejected here at manifest parse.
// 'grok' added 2026-09-18 for the v3 matrix; 'openai' is still absent deliberately, as no
// v3 stack targets it - add it here when one does.
export const backendNames = [
	'native',
	'ollama',
	'lmstudio',
	'claude-code',
	'opencode',
	'kilocode',
	'codex',
	'cline',
	'grok',
] as const;
