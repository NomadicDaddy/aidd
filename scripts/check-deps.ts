import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';

import { checkBunPinDrift, readPinnedBunVersion } from './lib/check-deps/bun-pins.ts';

/**
 * Read-only dependency version validation for aidd.
 *
 * Enforces: QUAL-003 -- the workspace stays type-safe and ESM-only, which depends on every
 * workspace agreeing on the version of each shared dependency and on a parseable lockfile.
 *
 * Validates that cross-workspace shared dependencies carry consistent version
 * specifiers across root, frontend, backend, cli, and shared package.json files,
 * and that the bun.lock lockfile is present and parseable.
 *
 * This script does NOT mutate any files. It only reads and compares.
 */

/**
 * Bun's lockfile (bun.lock) may contain JSONC features like trailing commas.
 * This helper strips trailing commas before the closing brace/bracket so
 * standard JSON.parse can handle the content.
 */
function parseJsonc(text: string): unknown {
	const stripped = text.replace(/,\s*([\]}])/g, '$1');
	return JSON.parse(stripped);
}

interface DepVersion {
	source: string;
	specifier: string;
}

interface Finding {
	message: string;
	severity: 'error' | 'warn';
}

const WORKSPACE_PACKAGE_FILES = [
	'package.json',
	'frontend/package.json',
	'backend/package.json',
	'cli/package.json',
	'shared/package.json',
] as const;

/**
 * Dependencies that MUST be pinned to the same version across all workspaces
 * that list them. The map value is a human-readable label for error messages.
 */
const CONSISTENCY_KEYS: Record<string, string> = {
	'@types/bun': '@types/bun',
	'@types/node': '@types/node',
	typescript: 'TypeScript',
	zod: 'Zod',
};

/**
 * Engine fields that should stay consistent across workspaces that declare them.
 */
const CONSISTENT_ENGINES: string[] = ['bun', 'node'];

function collectDepVersions(
	pkg: Record<string, unknown>,
	pkgPath: string,
): Map<string, DepVersion[]> {
	const versions = new Map<string, DepVersion[]>();

	function addDeps(deps: Record<string, string> | undefined): void {
		if (!deps || typeof deps !== 'object') return;
		for (const [name, spec] of Object.entries(deps)) {
			if (typeof spec !== 'string') continue;
			const existing = versions.get(name) ?? [];
			existing.push({ source: pkgPath, specifier: spec });
			versions.set(name, existing);
		}
	}

	addDeps(pkg.dependencies as Record<string, string> | undefined);
	addDeps(pkg.devDependencies as Record<string, string> | undefined);

	return versions;
}

function collectEngineVersions(
	pkg: Record<string, unknown>,
	pkgPath: string,
): Map<string, DepVersion[]> {
	const versions = new Map<string, DepVersion[]>();
	const engines = pkg.engines as Record<string, string> | undefined;
	if (!engines || typeof engines !== 'object') return versions;

	for (const field of CONSISTENT_ENGINES) {
		const spec = engines[field];
		if (typeof spec !== 'string') continue;
		const existing = versions.get(field) ?? [];
		existing.push({ source: pkgPath, specifier: spec });
		versions.set(field, existing);
	}

	return versions;
}

function checkConsistency(collection: Map<string, DepVersion[]>): Finding[] {
	const findings: Finding[] = [];

	for (const [name, entries] of collection) {
		const isConsistencyKey = name in CONSISTENCY_KEYS || CONSISTENT_ENGINES.includes(name);
		if (!isConsistencyKey) continue;
		if (entries.length < 2) continue;

		const uniqueSpecifiers = new Set(entries.map((e: DepVersion) => e.specifier));
		if (uniqueSpecifiers.size <= 1) continue;

		const humanLabel = CONSISTENCY_KEYS[name] ?? `engine:${name}`;
		const details = entries.map((e: DepVersion) => `  ${e.source}: ${e.specifier}`).join('\n');
		findings.push({
			message: `${humanLabel} (${name}) version mismatch across workspaces:\n${details}`,
			severity: 'error',
		});
	}

	return findings;
}

async function checkLockfile(projectRoot: string): Promise<Finding[]> {
	const findings: Finding[] = [];
	const lockPath = join(projectRoot, 'bun.lock');

	try {
		const lockStat = await stat(lockPath);
		if (!lockStat.isFile()) {
			findings.push({
				message: 'bun.lock exists but is not a regular file.',
				severity: 'error',
			});
			return findings;
		}

		const content = await readFile(lockPath, 'utf8');
		try {
			parseJsonc(content);
		} catch {
			findings.push({
				message:
					'bun.lock is not valid JSON. If using binary lockfile format (bun.lockb), regenerate as text: bun install --save-lockfile.',
				severity: 'error',
			});
		}
	} catch {
		findings.push({
			message: 'bun.lock not found. Run `bun install` to generate the lockfile.',
			severity: 'error',
		});
	}

	return findings;
}

async function checkPackageManager(projectRoot: string): Promise<Finding[]> {
	const findings: Finding[] = [];

	const pinnedVersion = await readPinnedBunVersion(projectRoot);

	if (pinnedVersion === null) {
		findings.push({
			message: 'Root packageManager should be "bun@<version>", got: undefined or malformed.',
			severity: 'warn',
		});
		return findings;
	}

	// The pinned version identifies the corresponding LGPL source: the release source
	// manifest names the Bun tag (and the WebKit/TinyCC submodule commits it pins) by
	// this version, so a literal pin elsewhere that disagrees names the wrong source.
	findings.push(...(await checkBunPinDrift(projectRoot, pinnedVersion)));

	return findings;
}

export async function runCheckDeps(projectRoot = cwd()): Promise<number> {
	const findings: Finding[] = [];

	// Load all workspace package.json files
	const allDepVersions = new Map<string, DepVersion[]>();
	const allEngineVersions = new Map<string, DepVersion[]>();

	for (const relPath of WORKSPACE_PACKAGE_FILES) {
		const fullPath = join(projectRoot, relPath);
		let content: string;
		try {
			content = await readFile(fullPath, 'utf8');
		} catch {
			findings.push({
				message: `Could not read ${relPath}.`,
				severity: 'warn',
			});
			continue;
		}

		let pkg: Record<string, unknown>;
		try {
			pkg = JSON.parse(content);
		} catch {
			findings.push({
				message: `${relPath} is not valid JSON.`,
				severity: 'error',
			});
			continue;
		}

		// Collect dependency versions
		const depVersions = collectDepVersions(pkg, relPath);
		for (const [name, entries] of depVersions) {
			const existing = allDepVersions.get(name) ?? [];
			allDepVersions.set(name, [...existing, ...entries]);
		}

		// Collect engine versions
		const engineVersions = collectEngineVersions(pkg, relPath);
		for (const [field, entries] of engineVersions) {
			const existing = allEngineVersions.get(field) ?? [];
			allEngineVersions.set(field, [...existing, ...entries]);
		}
	}

	// Check dependency consistency
	findings.push(...checkConsistency(allDepVersions));

	// Check engine consistency
	findings.push(...checkConsistency(allEngineVersions));

	// Check lockfile
	findings.push(...(await checkLockfile(projectRoot)));

	// Check packageManager field
	findings.push(...(await checkPackageManager(projectRoot)));

	// Report results
	const errors = findings.filter((f) => f.severity === 'error');
	const warnings = findings.filter((f) => f.severity === 'warn');

	if (errors.length > 0) {
		console.error('aidd dependency version check failed.\n');
		for (const f of errors) {
			console.error(`[ERROR] ${f.message}`);
		}
		for (const f of warnings) {
			console.error(`[WARN]  ${f.message}`);
		}
		return 1;
	}

	if (warnings.length > 0) {
		console.error('aidd dependency version check passed with warnings.\n');
		for (const f of warnings) {
			console.error(`[WARN]  ${f.message}`);
		}
	}

	console.log('aidd dependency version check passed.');
	return 0;
}

if (import.meta.main) {
	exit(await runCheckDeps());
}
