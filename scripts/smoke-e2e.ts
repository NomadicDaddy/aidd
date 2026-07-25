#!/usr/bin/env bun
/**
 * End-to-end smoke of the aidd CLI through the native simulation backend.
 *
 * Scaffolds a throwaway project with a single backlog feature whose spec asks the backend to
 * emit the AIDD_RESULT completion marker, runs one iteration against it, then asserts the
 * blueprint came back completed and that the feature contract validator accepts the result.
 *
 *   bun run smoke:e2e [-- --project-dir <path>]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { removeTempTree } from '../shared/src/lib/remove-temp-tree.ts';

const root = resolve(import.meta.dirname, '..');
const entry = join(root, 'cli', 'src', 'index.ts');

const { values } = parseArgs({
	options: {
		'project-dir': { default: join(root, '..', '.tmp-aidd-e2e'), type: 'string' },
	},
});

const project = resolve(values['project-dir']);
// The CLI takes the project directory as a forward-slash path so Windows backslashes never reach
// argument parsing as escape sequences.
const runtimeProject = project.replaceAll('\\', '/');

const SPEC =
	'Use simulation mode to complete this feature. Include the exact final marker: ' +
	'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}';

function scaffoldProject(title: string, spec: string): void {
	mkdirSync(join(project, '.aidd', 'features', 'feature-core'), { recursive: true });
	writeFileSync(
		join(project, '.aidd', 'features', 'feature-core', 'feature.json'),
		`{
  "id": "feature-core",
  "title": ${JSON.stringify(title)},
  "status": "backlog",
  "passes": false,
  "priority": 1,
  "spec": ${JSON.stringify(spec)}
}
`,
	);
	writeFileSync(join(project, '.aidd', 'spec.md'), '# Spec');
	writeFileSync(join(project, '.aidd', 'CHANGELOG.md'), '# Changelog\n');
}

function runCli(...args: string[]): number {
	const result = Bun.spawnSync(['bun', entry, ...args], {
		stderr: 'inherit',
		stdout: 'inherit',
	});
	return result.exitCode;
}

function featureCompleted(): boolean {
	const text = readFileSync(
		join(project, '.aidd', 'features', 'feature-core', 'feature.json'),
		'utf8',
	);
	const feature = JSON.parse(text) as { passes?: unknown; status?: unknown };
	return feature.passes === true && feature.status === 'completed';
}

async function main(): Promise<number> {
	await removeTempTree(project);
	scaffoldProject('Core feature', SPEC);

	const runExit = runCli(
		'--project-dir',
		runtimeProject,
		'--cli',
		'native',
		'--simulation',
		'--max-iterations',
		'1',
		'--feature',
		'feature-core',
	);
	if (runExit !== 0) {
		console.error(`native simulation smoke failed with exit code ${runExit}`);
		return 1;
	}

	if (!featureCompleted()) {
		console.error('native simulation smoke did not complete feature-core');
		return 1;
	}

	const checkExit = runCli('--project-dir', runtimeProject, '--check-features');
	if (checkExit !== 0) {
		console.error(`feature contract smoke failed with exit code ${checkExit}`);
		return 1;
	}

	console.log(`aidd v2 e2e smoke passed at ${project}`);
	return 0;
}

if (import.meta.main) {
	process.exit(await main());
}
