#!/usr/bin/env bun
/**
 * Backend adapter smoke matrix.
 *
 * Runs one aidd iteration per backend against a throwaway per-backend project and asserts the
 * seeded feature came back completed. A backend whose CLI is not installed is skipped with a
 * warning; under `--require-external` a missing or failing backend is a hard failure instead.
 *
 *   bun run smoke:backends [-- --project-dir <path>] [-- --require-external]
 */
import { buildBackendSubprocessEnv } from 'aidd-shared/subprocess-env';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { removeTempTree } from '../shared/src/lib/remove-temp-tree.ts';

interface Backend {
	command: string;
	extra: string[];
	name: string;
}

const root = resolve(import.meta.dirname, '..');
const entry = join(root, 'cli', 'src', 'index.ts');

const BACKENDS: Backend[] = [
	{ command: 'bun', extra: ['--simulation'], name: 'native' },
	{ command: 'bun', extra: ['--simulation'], name: 'ollama' },
	{ command: 'claude', extra: [], name: 'claude-code' },
	{ command: 'opencode', extra: [], name: 'opencode' },
	{ command: 'kilo', extra: [], name: 'kilocode' },
	{ command: 'codex', extra: [], name: 'codex' },
];

const { values } = parseArgs({
	options: {
		'project-dir': { default: join(root, '..', '.tmp-aidd-backends'), type: 'string' },
		'require-external': { default: false, type: 'boolean' },
	},
});

const projectRoot = resolve(values['project-dir']);
const requireExternal = values['require-external'];

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
`
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
	// because their external CLI may need host credentials this script has no business filtering.
	const simulation = backend.extra.includes('--simulation');
	const result = simulation
		? Bun.spawnSync(['bun', ...args], {
				env: buildBackendSubprocessEnv({ AIDD_NATIVE_SIMULATION: '1' }),
				stderr: 'inherit',
				stdout: 'inherit',
			})
		: Bun.spawnSync(['bun', ...args], { stderr: 'inherit', stdout: 'inherit' });

	return result.exitCode;
}

function featureCompleted(project: string): boolean {
	const text = readFileSync(
		join(project, '.aidd', 'features', 'feature-core', 'feature.json'),
		'utf8'
	);
	const feature = JSON.parse(text) as { passes?: unknown; status?: unknown };
	return feature.passes === true && feature.status === 'completed';
}

async function main(): Promise<number> {
	const failures: string[] = [];

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

	console.log(`aidd v2 backend smoke completed at ${projectRoot}`);
	return 0;
}

if (import.meta.main) {
	process.exit(await main());
}
