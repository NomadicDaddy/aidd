import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { cwd, exit } from 'node:process';

/**
 * Targeted check for accidental full-environment spreading to child processes.
 *
 * Enforces: SEC-002 -- child processes receive only the environment they need.
 *
 * aidd's policy (see `cli/src/subprocess-env.ts` header) is that backend and tool subprocesses
 * receive an allowlisted environment via `buildBackendSubprocessEnv` / `buildToolSubprocessEnv`.
 * Spreading the full parent environment into a Bun.spawn or child_process call bypasses that
 * allowlist and propagates unrelated parent variables (including unrelated secrets) verbatim.
 *
 * Bun exposes the same parent environment through both `process.env` and `Bun.env`, so the guard
 * forbids spreading either object — narrowing only `process.env` would let a full `Bun.env` spread
 * reintroduce the identical full-environment leak.
 *
 * This script scans `cli/src/`, `backend/src/`, `shared/src/`, and `scripts/` for the forbidden source patterns described in the
 * `forbiddenPatterns` table below. Lines that legitimately need to discuss the pattern (such as
 * this file's own scanner table) are exempt via the line-level `allow-env-spread-policy` marker.
 */

const scannedRoots = ['cli/src', 'backend/src', 'shared/src', 'scripts'];
const skippedDirs = new Set(['build', 'dist', 'node_modules', 'snapshots']);
const allowMarker = 'allow-env-spread-policy';

interface Finding {
	file: string;
	line: number;
	rule: string;
	text: string;
}

const forbiddenPatterns: { pattern: RegExp; rule: string }[] = [
	{ pattern: /\.{3}\s*process\.env\b/, rule: 'spread-process-env' },
	{ pattern: /\benv\s*:\s*process\.env\b/, rule: 'env-equals-process-env' },
	{ pattern: /\.{3}\s*Bun\.env\b/, rule: 'spread-bun-env' },
	{ pattern: /\benv\s*:\s*Bun\.env\b/, rule: 'env-equals-bun-env' },
];

function isScannedFile(path: string): boolean {
	return /\.(?:ts|tsx|js|mjs|cjs)$/i.test(path) && !path.endsWith('.d.ts');
}

async function collectFiles(path: string): Promise<string[]> {
	const info = await stat(path);
	if (info.isFile()) return isScannedFile(path) ? [path] : [];
	const entries = await readdir(path, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		if (skippedDirs.has(entry.name)) continue;
		const child = join(path, entry.name);
		if (entry.isDirectory()) files.push(...(await collectFiles(child)));
		else if (entry.isFile() && isScannedFile(child)) files.push(child);
	}
	return files;
}

function scanFile(relPath: string, text: string): Finding[] {
	const findings: Finding[] = [];
	const lines = text.split(/\r?\n/);
	for (const [index, line] of lines.entries()) {
		if (line.includes(allowMarker)) continue;
		for (const { pattern, rule } of forbiddenPatterns) {
			if (pattern.test(line)) {
				findings.push({ file: relPath, line: index + 1, rule, text: line.trim() });
			}
		}
	}
	return findings;
}

export async function runCheckEnvSpread(projectRoot = cwd()): Promise<number> {
	const findings: Finding[] = [];
	for (const root of scannedRoots) {
		const fullRoot = join(projectRoot, root);
		try {
			await stat(fullRoot);
		} catch {
			continue;
		}
		const files = await collectFiles(fullRoot);
		for (const file of files) {
			const text = await readFile(file, 'utf8');
			const relPath = relative(projectRoot, file).split(sep).join('/');
			findings.push(...scanFile(relPath, text));
		}
	}

	if (findings.length > 0) {
		console.error('[FAIL] aidd env-spread check.');
		console.error(
			'Child processes must receive an allowlisted environment via buildBackendSubprocessEnv / buildToolSubprocessEnv.',
		);
		for (const finding of findings) {
			console.error(`- ${finding.file}:${finding.line} [${finding.rule}] ${finding.text}`);
		}
		return 1;
	}

	console.log('[OK] aidd env-spread check passed.');
	return 0;
}

if (import.meta.main) {
	exit(await runCheckEnvSpread());
}
