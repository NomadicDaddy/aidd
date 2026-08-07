import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { cwd, exit } from 'node:process';

/**
 * Targeted check for accidental full-environment spreading to child processes.
 *
 * Enforces: SEC-002 (aidd) / ASSERT-038 (spernakit) -- child processes receive only the
 * environment they need.
 *
 * aidd's policy (see `shared/src/subprocess-env.ts` header) is that backend and tool subprocesses
 * receive an allowlisted environment via `buildBackendSubprocessEnv` / `buildToolSubprocessEnv`.
 * Spreading the full parent environment into a Bun.spawn or child_process call bypasses that
 * allowlist and propagates unrelated parent variables (including unrelated secrets) verbatim.
 *
 * Bun exposes the same parent environment through both `process.env` and `Bun.env`, so the guard
 * forbids spreading either object — narrowing only `process.env` would let a full `Bun.env` spread
 * reintroduce the identical full-environment leak.
 *
 * This file is delivered by `sync-shared-core.ts`, so its output names no repository and its scan
 * roots are the union across carriers: a root that does not exist here is skipped rather than
 * failed, which is what lets one copy serve a repository with a `cli/` package and one without.
 * Skipping every root is a different case and fails, because a pass over zero files is a pass
 * earned by looking at nothing.
 * Lines that legitimately need to discuss the pattern (such as this file's own scanner table) are
 * exempt via the line-level `allow-env-spread-policy` marker, which should carry a comment saying
 * why that particular process needs the whole environment.
 *
 * Known limit, stated so nobody reads a pass as more than it is: this catches an EXPLICIT spread,
 * not the default. `Bun.spawn` inherits the parent environment when the `env` option is omitted, so
 * deleting a spread line silences the finding without narrowing anything at all. Narrow the
 * environment or mark the line; do not delete the spread.
 *
 * (This header deliberately does not spell the forbidden expression out. A scanner that reads every
 * file in `scripts/` reads this one, and prose describing the pattern would otherwise have to waive
 * itself -- which is exactly the shape of waiver the gate exists to discourage.)
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
	let examined = 0;
	for (const root of scannedRoots) {
		const fullRoot = join(projectRoot, root);
		try {
			await stat(fullRoot);
		} catch {
			continue;
		}
		const files = await collectFiles(fullRoot);
		for (const file of files) {
			examined++;
			const text = await readFile(file, 'utf8');
			const relPath = relative(projectRoot, file).split(sep).join('/');
			findings.push(...scanFile(relPath, text));
		}
	}

	if (findings.length > 0) {
		console.error('[FAIL] env-spread check.');
		console.error(
			'Child processes must receive only the environment they need. Narrow the spread, or mark ' +
				'the line with `allow-env-spread-policy` and say why that process needs all of it.',
		);
		for (const finding of findings) {
			console.error(`- ${finding.file}:${finding.line} [${finding.rule}] ${finding.text}`);
		}
		return 1;
	}

	// Skipping an absent root is deliberate (see `scannedRoots`), but skipping every one of them
	// means this file was delivered somewhere none of the layouts it knows about exist. Reporting
	// `[OK]` there would be a pass earned by looking at nothing.
	if (examined === 0) {
		console.error(
			`[FAIL] No files were examined. None of the scanned roots exist under ${projectRoot}: ` +
				`${scannedRoots.join(', ')}.`,
		);
		return 1;
	}

	console.log(`[OK] env-spread check passed (${examined} file(s) examined).`);
	return 0;
}

if (import.meta.main) {
	exit(await runCheckEnvSpread());
}
