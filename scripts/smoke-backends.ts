#!/usr/bin/env bun
/**
 * Backend adapter smoke matrix.
 *
 * Runs one aidd iteration per registered backend -- every name in the canonical `backendNames`
 * list, so the matrix covers the product rather than a hand-kept subset of it -- against a
 * throwaway per-backend project, and asserts the seeded feature came back completed. A backend
 * whose CLI is not installed is skipped with a warning; under `--require-external` a missing or
 * failing backend is a hard failure instead.
 *
 *   bun run smoke:backends [-- --project-dir <path>] [-- --require-external]
 */
import { EXT_LOG_PATH_ENV } from 'aidd-shared/metadata/active-runs';
import { type BackendName, backendNames } from 'aidd-shared/plan/types';
import { buildBackendSubprocessEnv } from 'aidd-shared/subprocess-env';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { removeTempTree } from '../shared/src/lib/remove-temp-tree.ts';

interface Backend {
	command: string;
	extra: string[];
	name: BackendName;
}

const root = resolve(import.meta.dirname, '..');
const entry = join(root, 'cli', 'src', 'index.ts');

/**
 * How to invoke each backend, keyed by the canonical `backendNames` so the matrix cannot fall
 * behind the product: adding a backend to the shared list makes this record fail to typecheck
 * until it is given a smoke entry. Without that, a registered backend that nothing here ever runs
 * drifts silently.
 *
 * `command` is the binary probed with Bun.which to decide whether the backend is installed; it
 * matches the command in shared/src/backends/commands.ts, which is not always the backend name
 * (kilocode ships as `kilo`, claude-code as `claude`).
 *
 * lmstudio/native/ollama/openai all resolve to the in-process native client (see the
 * nativeBackends set in cli/src/plan/resolve.ts), so `--simulation` short-circuits them before any
 * provider call. Those rows prove argument plumbing and the completion contract, not the provider
 * adapter, and they need no daemon, key, or network. The rest spawn a real external CLI and do
 * real billable work -- which is the point of this smoke, and why it is not a smoke:qc step.
 */
const BACKEND_SPECS: Record<BackendName, Omit<Backend, 'name'>> = {
	'claude-code': { command: 'claude', extra: [] },
	cline: { command: 'cline', extra: [] },
	codex: { command: 'codex', extra: [] },
	grok: { command: 'grok', extra: [] },
	kilocode: { command: 'kilo', extra: [] },
	lmstudio: { command: 'bun', extra: ['--simulation'] },
	native: { command: 'bun', extra: ['--simulation'] },
	ollama: { command: 'bun', extra: ['--simulation'] },
	openai: { command: 'bun', extra: ['--simulation'] },
	opencode: { command: 'opencode', extra: [] },
};

// Ordered by backendNames rather than by the record's alphabetical keys, which puts the four free
// in-process simulations first: a plumbing break surfaces before any paid CLI is spawned.
const BACKENDS: Backend[] = backendNames.map((name) => ({ ...BACKEND_SPECS[name], name }));

const { values } = parseArgs({
	options: {
		'project-dir': { default: join(root, '..', '.tmp-aidd-backends'), type: 'string' },
		'require-external': { default: false, type: 'boolean' },
	},
});

const projectRoot = resolve(values['project-dir']);
const requireExternal = values['require-external'];
// The CLI resolves its data directory from the aidd install root, never from --project-dir, so an
// unclaimed run writes its transcript into this working copy's live `data/run-logs` — real run
// history, for a throwaway smoke. Claim the path instead, in a sibling directory the next run wipes
// along with the projects themselves.
const logsRoot = `${projectRoot}-logs`;

const SPEC =
	'This is an aidd backend adapter smoke test. Do not implement application code. Mark this ' +
	'feature completed with passes true, update CHANGELOG.md with a one-line smoke note, and ' +
	'include the exact final marker: AIDD_RESULT: ' +
	'{"featureId":"feature-core","status":"completed","passes":true}';

function scaffoldProject(project: string, backend: Backend): void {
	mkdirSync(join(project, '.aidd', 'features', 'feature-core'), { recursive: true });
	writeFileSync(
		join(project, '.aidd', 'features', 'feature-core', 'feature.json'),
		`{
  "id": "feature-core",
  "title": ${JSON.stringify(`${backend.name} feature`)},
  "status": "backlog",
  "passes": false,
  "priority": 1,
  "spec": ${JSON.stringify(SPEC)}
}
`,
	);
	writeFileSync(join(project, '.aidd', 'spec.md'), '# Spec');
	writeFileSync(join(project, '.aidd', 'CHANGELOG.md'), '# Changelog\n');
}

function runBackend(backend: Backend, project: string): number {
	const args = [
		entry,
		'--project-dir',
		// The CLI takes the project directory as a forward-slash path so Windows backslashes never
		// reach argument parsing as escape sequences.
		project.replaceAll('\\', '/'),
		'--cli',
		backend.name,
		'--max-iterations',
		'1',
		'--feature',
		'feature-core',
		...backend.extra,
	];

	// Simulation backends need AIDD_NATIVE_SIMULATION set for the child only. The PowerShell
	// predecessor mutated the parent environment and restored it afterwards; here the toggle rides
	// the same allowlist aidd itself uses to spawn backend CLIs, so no parent state is touched and
	// check:env-spread stays satisfied. Non-simulation backends inherit the environment untouched
	// because their external CLI may need host credentials this script has no business filtering:
	// this smoke is the one place those credentials are exercised end to end, so narrowing them to
	// the allowlist here would quietly change what the smoke proves. The log-path claim is the only
	// addition, and it has to ride an explicit spread precisely because the inherit is deliberate.
	const simulation = backend.extra.includes('--simulation');
	const logPath = join(logsRoot, `${backend.name}.log`);
	const result = simulation
		? Bun.spawnSync(['bun', ...args], {
				env: buildBackendSubprocessEnv({
					AIDD_NATIVE_SIMULATION: '1',
					[EXT_LOG_PATH_ENV]: logPath,
				}),
				stderr: 'inherit',
				stdout: 'inherit',
			})
		: Bun.spawnSync(['bun', ...args], {
				env: { ...process.env, [EXT_LOG_PATH_ENV]: logPath }, // allow-env-spread-policy
				stderr: 'inherit',
				stdout: 'inherit',
			});

	return result.exitCode;
}

function featureCompleted(project: string): boolean {
	const text = readFileSync(
		join(project, '.aidd', 'features', 'feature-core', 'feature.json'),
		'utf8',
	);
	const feature = JSON.parse(text) as { passes?: unknown; status?: unknown };
	return feature.passes === true && feature.status === 'completed';
}

async function main(): Promise<number> {
	const failures: string[] = [];
	await removeTempTree(logsRoot);

	for (const backend of BACKENDS) {
		if (!Bun.which(backend.command)) {
			const message = `Skipping ${backend.name}: command '${backend.command}' not found`;
			if (requireExternal) {
				failures.push(message);
			}
			console.warn(message);
			continue;
		}

		const project = join(projectRoot, backend.name);
		await removeTempTree(project);
		scaffoldProject(project, backend);

		const exitCode = runBackend(backend, project);
		if (exitCode !== 0) {
			failures.push(`${backend.name} smoke failed with exit code ${exitCode}`);
			continue;
		}

		if (!featureCompleted(project)) {
			failures.push(`${backend.name} smoke did not complete feature-core`);
			continue;
		}

		console.log(`${backend.name} smoke passed`);
	}

	for (const failure of failures) {
		console.warn(failure);
	}
	if (failures.length > 0 && requireExternal) {
		console.error('One or more required backend smokes failed');
		return 1;
	}

	console.log(`aidd backend smoke completed at ${projectRoot}`);
	return 0;
}

if (import.meta.main) {
	process.exit(await main());
}
