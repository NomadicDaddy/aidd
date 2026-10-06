import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AuditFinding, LockOnly, TreeAudit } from './types.ts';

export interface CommandOutput {
	exitCode: number;
	stderr: string;
	stdout: string;
	timedOut: boolean;
}

/** Runs `bun audit --json` in a tree. Injected so tests never audit a real tree. */
export type AuditRunner = (treeDir: string, timeoutMs: number) => Promise<CommandOutput>;

export async function runBunAudit(treeDir: string, timeoutMs: number): Promise<CommandOutput> {
	const proc = Bun.spawn(['bun', 'audit', '--json'], {
		cwd: treeDir,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const timer = setTimeout(() => proc.kill(), timeoutMs);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	clearTimeout(timer);
	// A killed process reports a signal exit; the timer is the only thing that kills it here.
	const timedOut = exitCode !== 0 && exitCode !== 1 && stdout.length === 0;
	return { exitCode, stderr, stdout, timedOut };
}

interface RawAdvisory {
	severity?: unknown;
	title?: unknown;
	url?: unknown;
	vulnerable_versions?: unknown;
}

/** `bun audit --json` prints `{ "<package>": [advisory, ...] }`, and `{}` when clean. */
export function parseAuditJson(stdout: string): AuditFinding[] | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return null;
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
	const findings: AuditFinding[] = [];
	for (const [pkg, list] of Object.entries(parsed as Record<string, unknown>)) {
		if (!Array.isArray(list)) continue;
		for (const raw of list as RawAdvisory[]) {
			const url = typeof raw.url === 'string' ? raw.url : '';
			findings.push({
				ghsa: url.split('/').pop() ?? '',
				package: pkg,
				severity: typeof raw.severity === 'string' ? raw.severity : 'unknown',
				title: typeof raw.title === 'string' ? raw.title : '',
				url,
				vulnerableVersions:
					typeof raw.vulnerable_versions === 'string' ? raw.vulnerable_versions : '',
			});
		}
	}
	return findings;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\/]/g, (c) => `\\${c}`);
}

/** The lock line that resolves `key` to a version of `pkg`: `"key": ["pkg@<version>", ...`. */
function entryVersion(lock: string, key: string, pkg: string): null | string {
	const pattern = new RegExp(
		`^\\s*"${escapeRegExp(key)}": \\["${escapeRegExp(pkg)}@([^"]+)"`,
		'm',
	);
	return pattern.exec(lock)?.[1] ?? null;
}

/**
 * The version `pkg` resolves to for the lock entry keyed `dependentKey`. A nested entry is keyed
 * by its dependent chain (`eslint/minimatch/brace-expansion`), so the nearest `<prefix>/<pkg>`
 * line wins, walking the chain upward, before the top-level line.
 */
export function lockedVersion(lock: string, pkg: string, dependentKey?: string): null | string {
	if (dependentKey !== undefined) {
		const parts = dependentKey.split('/');
		for (let depth = parts.length; depth > 0; depth--) {
			const scoped = entryVersion(lock, `${parts.slice(0, depth).join('/')}/${pkg}`, pkg);
			if (scoped !== null) return scoped;
		}
	}
	return entryVersion(lock, pkg, pkg);
}

export interface LockDependent {
	/** The entry's lock key, which is its dependent chain for a nested entry. */
	key: string;
	name: string;
	version: string;
}

interface LockEntryMeta {
	dependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
}

/**
 * Every lock entry whose own dependencies include `pkg`. A peer dependency is not one: the
 * isolated store never links a peer inside the dependent (update-browserslist-db never links
 * browserslist), so counting peers reported nine trees LOCK-ONLY that were not.
 */
export function dependentsOf(lock: string, pkg: string): LockDependent[] {
	const result: LockDependent[] = [];
	for (const line of lock.split('\n')) {
		const head = /^\s*"([^"]+)": \[/.exec(line);
		if (!head) continue;
		let entry: unknown;
		try {
			entry = JSON.parse(line.slice(line.indexOf('['), line.lastIndexOf(']') + 1));
		} catch {
			continue;
		}
		if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
		const meta = (entry[2] ?? {}) as LockEntryMeta;
		const own = { ...(meta.dependencies ?? {}), ...(meta.optionalDependencies ?? {}) };
		if (!(pkg in own)) continue;
		const resolved = entry[0];
		const at = resolved.lastIndexOf('@');
		result.push({
			key: head[1] ?? '',
			name: resolved.slice(0, at),
			version: resolved.slice(at + 1),
		});
	}
	return result;
}

function linkedVersion(path: string): null | string {
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown };
		return typeof parsed.version === 'string' ? parsed.version : null;
	} catch {
		return null;
	}
}

/**
 * `bun audit` reads the lockfile, not the store. For each named package, resolve what each
 * dependent at its locked version actually links under node_modules/.bun, and what the tree's own
 * node_modules links; a version other than the lock's is LOCK-ONLY. Superseded dependents' leftover
 * directories are never consulted, since nothing loads them.
 */
export function storeMismatches(treeDir: string, lock: string, packages: string[]): LockOnly[] {
	const mismatches: LockOnly[] = [];
	for (const pkg of packages) {
		const topLocked = lockedVersion(lock, pkg);
		if (topLocked === null) continue;
		const direct = join(treeDir, 'node_modules', pkg, 'package.json');
		if (existsSync(direct)) {
			const linked = linkedVersion(direct);
			if (linked !== topLocked)
				mismatches.push({ dependent: '(root)', linked, locked: topLocked, package: pkg });
		}
		for (const dependent of dependentsOf(lock, pkg)) {
			const locked = lockedVersion(lock, pkg, dependent.key) ?? topLocked;
			const dependentDir = join(
				treeDir,
				'node_modules',
				'.bun',
				`${dependent.name}@${dependent.version}`,
			);
			const linked = linkedVersion(join(dependentDir, 'node_modules', pkg, 'package.json'));
			// A missing link is not evidence: a hoisted install has no per-dependent tree at all.
			if (linked === null || linked === locked) continue;
			mismatches.push({
				dependent: `${dependent.name}@${dependent.version}`,
				linked,
				locked,
				package: pkg,
			});
		}
	}
	return mismatches;
}

function readLock(treeDir: string): string {
	try {
		return readFileSync(join(treeDir, 'bun.lock'), 'utf8');
	} catch {
		return '';
	}
}

export async function auditTree(input: {
	key: string;
	owners: string[];
	previousPackages: string[];
	runner: AuditRunner;
	timeoutMs: number;
	treeDir: string;
}): Promise<TreeAudit> {
	const started = Date.now();
	const base = {
		durationMs: 0,
		key: input.key,
		lockOnly: [],
		notInstalled: false,
		owners: input.owners,
		treeDir: input.treeDir,
	};
	const output = await input.runner(input.treeDir, input.timeoutMs);
	const findings = parseAuditJson(output.stdout);
	// bun audit exits 0 clean and 1 with findings. Any other code is a failed audit even when
	// stdout parses (an empty `{}` beside exit 2 is not a clean tree), so it is UNSWEPT.
	const failed = output.exitCode !== 0 && output.exitCode !== 1;
	if (output.timedOut || findings === null || failed) {
		const firstStderr = output.stderr.trim().split('\n')[0] ?? '';
		const error = output.timedOut
			? `bun audit timed out after ${String(input.timeoutMs)}ms`
			: findings === null
				? `bun audit exited ${String(output.exitCode)} with no parseable JSON: ${firstStderr}`
				: `bun audit exited ${String(output.exitCode)}: ${firstStderr}`;
		return {
			...base,
			durationMs: Date.now() - started,
			error,
			exitCode: output.exitCode,
			findings: [],
			status: 'unswept',
		};
	}
	const notInstalled = !existsSync(join(input.treeDir, 'node_modules'));
	const named = [...new Set([...findings.map((f) => f.package), ...input.previousPackages])];
	const lock = readLock(input.treeDir);
	const lockOnly =
		notInstalled || lock.length === 0 ? [] : storeMismatches(input.treeDir, lock, named);
	return {
		...base,
		durationMs: Date.now() - started,
		exitCode: output.exitCode,
		findings,
		lockOnly,
		notInstalled,
		status: 'audited',
	};
}
