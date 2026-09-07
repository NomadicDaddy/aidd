#!/usr/bin/env bun
/**
 * check-scaffold.ts
 *
 * Enforces: the fresh-project scaffold is complete, byte-identical to the owners it copies, and
 * passes its own quality gate.
 *
 * A scaffolded project inherits its toolchain from `scaffolding/`, and nothing here is exercised by
 * this repository's own gates: `scaffolding/package.json` pins its own dependency versions,
 * `scaffolding/eslint.config.js` is a second copy of a config, and `scaffolding/tsconfig.json` is
 * read by no build in this tree. Drift is therefore invisible until a brand-new project fails its
 * first `smoke:qc`, which is the worst moment to discover it. The last step runs the scaffold's own
 * `smoke:qc` for that reason: file parity says the copies match, and only running them says they
 * work.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { exit } from 'node:process';

const ROOT = resolve(import.meta.dir, '..');

const EXACT_PAIRS = [
	['.editorconfig', 'scaffolding/.editorconfig'],
	['.gitattributes', 'scaffolding/.gitattributes'],
	['.prettierignore', 'scaffolding/.prettierignore'],
	['frontend/eslint.config.js', 'scaffolding/frontend/eslint.config.js'],
	['scripts/require-bun.ts', 'scaffolding/scripts/require-bun.ts'],
] as const;

/**
 * Every path a scaffolded project needs to receive. Exported because `self-contained.ts` asks the
 * same question of the same list, and two hand-maintained copies of it is the shape that let the
 * hook directories drift apart: whoever adds a scaffold file updates the list they happened to
 * open. One list, two gates reading it.
 */
export const REQUIRED_SCAFFOLD_PATHS = [
	'scaffolding/.aidd/CHANGELOG.md',
	'scaffolding/.aidd/project-structure.md',
	'scaffolding/.aidd/project.md',
	'scaffolding/.editorconfig',
	'scaffolding/.gitattributes',
	'scaffolding/.gitignore',
	'scaffolding/.prettierignore',
	'scaffolding/.prettierrc',
	'scaffolding/eslint.config.js',
	'scaffolding/frontend/eslint.config.js',
	'scaffolding/package.json',
	'scaffolding/scripts/require-bun.ts',
	'scaffolding/tsconfig.json',
] as const;

interface JsonRecord {
	[key: string]: unknown;
}

function asRecord(value: unknown): JsonRecord | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function asStringRecord(value: unknown): null | Record<string, string> {
	const record = asRecord(value);
	if (record === null) return null;
	const entries = Object.entries(record);
	if (entries.some(([, item]) => typeof item !== 'string')) return null;
	return Object.fromEntries(entries) as Record<string, string>;
}

function parseJson(path: string): unknown {
	return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function findManifestParityProblems(rootValue: unknown, scaffoldValue: unknown): string[] {
	const problems: string[] = [];
	const root = asRecord(rootValue);
	const scaffold = asRecord(scaffoldValue);
	if (root === null || scaffold === null) return ['Both package manifests must be JSON objects.'];

	if (scaffold['packageManager'] !== root['packageManager']) {
		problems.push('scaffolding/package.json packageManager must match package.json.');
	}

	const rootEngines = asStringRecord(root['engines']);
	const scaffoldEngines = asStringRecord(scaffold['engines']);
	if (scaffoldEngines?.['bun'] !== rootEngines?.['bun']) {
		problems.push('scaffolding/package.json engines.bun must match package.json.');
	}

	const rootDependencies = asStringRecord(root['devDependencies']);
	const scaffoldDependencies = asStringRecord(scaffold['devDependencies']);
	if (rootDependencies === null || scaffoldDependencies === null) {
		problems.push('Both package manifests must define string-valued devDependencies.');
	} else {
		for (const [name, version] of Object.entries(scaffoldDependencies).sort(([a], [b]) =>
			a.localeCompare(b),
		)) {
			if (rootDependencies[name] !== version) {
				problems.push(
					`scaffolding/package.json devDependency ${name} must match package.json (${version} != ${rootDependencies[name] ?? 'missing'}).`,
				);
			}
		}
	}

	const scripts = asStringRecord(scaffold['scripts']);
	for (const name of ['format:check', 'lint', 'preinstall', 'smoke:qc', 'typecheck']) {
		if (scripts?.[name] === undefined) {
			problems.push(`scaffolding/package.json must define the ${name} script.`);
		}
	}

	return problems;
}

function normalizedPrettierConfig(value: unknown): null | string {
	const config = asRecord(value);
	if (config === null) return null;
	const normalized = { ...config };
	delete normalized['tailwindStylesheet'];
	return JSON.stringify(normalized);
}

export function findScaffoldParityProblems(rootDir = ROOT): string[] {
	const problems: string[] = [];
	for (const path of REQUIRED_SCAFFOLD_PATHS) {
		if (!existsSync(join(rootDir, path))) problems.push(`${path} is missing.`);
	}

	for (const [owner, scaffold] of EXACT_PAIRS) {
		const ownerPath = join(rootDir, owner);
		const scaffoldPath = join(rootDir, scaffold);
		if (!existsSync(ownerPath)) {
			problems.push(`${owner} is missing, so ${scaffold} has no owner.`);
			continue;
		}
		if (!existsSync(scaffoldPath)) continue;
		if (!readFileSync(ownerPath).equals(readFileSync(scaffoldPath))) {
			problems.push(`${scaffold} must be byte-identical to ${owner}.`);
		}
	}

	try {
		problems.push(
			...findManifestParityProblems(
				parseJson(join(rootDir, 'package.json')),
				parseJson(join(rootDir, 'scaffolding', 'package.json')),
			),
		);
	} catch (err) {
		problems.push(
			`Package manifest parsing failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	try {
		const owner = normalizedPrettierConfig(parseJson(join(rootDir, '.prettierrc')));
		const scaffold = normalizedPrettierConfig(
			parseJson(join(rootDir, 'scaffolding', '.prettierrc')),
		);
		if (owner === null || scaffold === null || owner !== scaffold) {
			problems.push(
				'scaffolding/.prettierrc must match .prettierrc except for tailwindStylesheet.',
			);
		}
	} catch (err) {
		problems.push(
			`Prettier config parsing failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	return problems;
}

export function runScaffoldCheck(rootDir = ROOT): number {
	const problems = findScaffoldParityProblems(rootDir);
	if (problems.length > 0) {
		console.error('[FAIL] Scaffold ownership and parity checks failed:\n');
		for (const problem of problems) console.error(`  - ${problem}`);
		return 1;
	}

	const result = Bun.spawnSync([process.execPath, 'run', 'smoke:qc'], {
		cwd: join(rootDir, 'scaffolding'),
		stderr: 'inherit',
		stdout: 'inherit',
		windowsHide: true,
	});
	if (!result.success) {
		console.error(`[FAIL] The scaffold's own smoke:qc exited ${result.exitCode}.`);
		return 1;
	}

	console.log(
		`[OK] check:scaffold — ${REQUIRED_SCAFFOLD_PATHS.length} scaffold path(s) present, ${EXACT_PAIRS.length} owner pair(s) identical, the scaffold's own smoke:qc passed.`,
	);
	return 0;
}

if (import.meta.main) exit(runScaffoldCheck());
