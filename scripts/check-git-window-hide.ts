#!/usr/bin/env bun
/**
 * Git Subprocess Window Visibility Check
 *
 * Enforces: ASSERT-024 (spernakit) / SEC-006 (aidd) -- every direct git subprocess passes
 * `windowsHide: true`.
 *
 * Every direct Git subprocess must pass `windowsHide: true`. On Windows a spawn without it
 * flashes a real console window, so a background gate or a hook run visibly blinks the desktop
 * — and in a packaged app it looks like a crash. The flag is inert everywhere else, so the rule
 * is unconditional rather than platform-gated.
 *
 * This scans for *direct* spawns only. Local helpers that wrap a spawn (`run(['git', …])`) are
 * intentionally not flagged: the flag belongs on the helper's own spawn call, which this check
 * sees at that call site.
 *
 * This file is delivered by `sync-shared-core.ts`, so `SCAN_ROOTS` is the union across carriers and
 * a root that does not exist here is skipped rather than failed. The union is load-bearing rather
 * than tidy: this rule was previously enforced twice, once here and once as a hand-rolled bun:test
 * in another repository, and the two copies had drifted to different root lists. The gap that
 * opened was a whole top-level directory (`skills/`) holding a real unhidden spawn that neither
 * copy's own root list covered. Widen this list rather than narrowing it.
 *
 * Usage:
 *   bun scripts/check-git-window-hide.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { exit } from 'node:process';

const DEFAULT_PROJECT_ROOT = join(import.meta.dir, '..');
const SCAN_ROOTS = [
	'backend/src',
	'cli/src',
	'frontend/src',
	'scripts',
	'shared/src',
	'skills',
	'test',
];
const SKIP_DIRS = new Set([
	'.aidd',
	'.git',
	'build',
	'coverage',
	'data',
	'dist',
	'logs',
	'node_modules',
]);
const SCANNED_EXTENSIONS = ['.js', '.mjs', '.ts', '.tsx'];

interface Violation {
	content: string;
	file: string;
	line: number;
}

function* walkDir(dir: string): Generator<string> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walkDir(fullPath);
		} else if (entry.isFile() && SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
			yield fullPath;
		}
	}
}

/**
 * Sync forms must be matched too: `Bun.spawnSync(['git', …])` spawns a console window exactly as
 * the async form does, but a `Bun\.spawn\(\s*\[` pattern cannot match it — the `Sync` sits
 * between `spawn` and the paren — which would leave those call sites invisible here.
 */
function isDirectGitSpawnLine(lines: string[], index: number): boolean {
	const line = lines[index] ?? '';
	if (
		/(?:Bun\.)?spawn(?:Sync)?\(\s*['"]git['"]/.test(line) ||
		/Bun\.spawn(?:Sync)?\(\s*\[\s*['"]git['"]/.test(line)
	) {
		return true;
	}
	if (!line.includes("['git'") && !line.includes('["git"')) return false;
	const previous = lines.slice(Math.max(0, index - 3), index + 1).join(' ');
	return /\bBun\.spawn(?:Sync)?\(\s*$|\bBun\.spawn(?:Sync)?\(\s+\[/.test(previous);
}

function checkFile(projectRoot: string, filePath: string): Violation[] {
	const relativePath = relative(projectRoot, filePath).replace(/\\/g, '/');
	if (relativePath === 'scripts/check-git-window-hide.ts') return [];

	const lines = readFileSync(filePath, 'utf-8').split(/\r?\n/);
	const violations: Violation[] = [];

	for (let index = 0; index < lines.length; index++) {
		if (!isDirectGitSpawnLine(lines, index)) continue;
		const block = lines.slice(index, Math.min(index + 14, lines.length)).join('\n');
		if (!/windowsHide:\s*true/.test(block)) {
			violations.push({
				content: (lines[index] ?? '').trim(),
				file: relativePath,
				line: index + 1,
			});
		}
	}

	return violations;
}

export function runGitWindowHide(projectRoot = DEFAULT_PROJECT_ROOT): number {
	const allViolations: Violation[] = [];
	let examined = 0;

	for (const root of SCAN_ROOTS) {
		const absoluteRoot = join(projectRoot, root);
		try {
			statSync(absoluteRoot);
		} catch {
			continue;
		}
		for (const filePath of walkDir(absoluteRoot)) {
			examined++;
			allViolations.push(...checkFile(projectRoot, filePath));
		}
	}

	if (allViolations.length > 0) {
		console.error('[FAIL] Found direct Git subprocesses spawned without windowsHide:\n');
		for (const v of allViolations) {
			console.error(`  ${v.file}:${v.line}: ${v.content}`);
		}
		console.error(
			'\nAdd `windowsHide: true` to the spawn options so no console window appears.',
		);
		return 1;
	}

	// Skipping an absent root is deliberate (see SCAN_ROOTS), but skipping every one of them is a
	// carrier this file should never have been delivered to. Reporting [OK] there would be a pass
	// earned by looking at nothing.
	if (examined === 0) {
		console.error(
			`[FAIL] No source files were examined. None of the scanned roots exist under ` +
				`${projectRoot}: ${SCAN_ROOTS.join(', ')}.`,
		);
		return 1;
	}

	console.log(
		`[OK] Git subprocess window visibility check passed (${examined} file(s) examined).`,
	);
	return 0;
}

if (import.meta.main) exit(runGitWindowHide());
