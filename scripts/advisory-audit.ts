#!/usr/bin/env bun
/**
 * advisory-audit.ts
 *
 * Runs `bun audit --json` in every project tree under the configured roots and writes one record of
 * the estate's dependency advisories: findings with severity and range per tree, trees that could
 * not be audited (UNSWEPT), build-artifact lockfiles skipped by name, LOCK-ONLY trees whose store
 * still links a version the lock has moved past, acknowledged holds with their age, and what is new
 * or closed since the previous run. A run that finds nothing still writes its record and its history
 * line, so a missing line is the alarm.
 *
 * Window independent by design: the daily digest names packages from a publication window and the
 * lockfile sweep greps for those names, which cannot find an advisory the digest never named. This
 * audit evaluates the whole resolved tree against the full database.
 *
 * Reads and reports only. Nothing is installed or upgraded; owners fix their own trees.
 *
 * Run: bun scripts/advisory-audit.ts [--tree <dir>] [--out <dir>] [--timeout-ms <n>]
 * Design: scratch/shared/alice/periodic-bun-audit-design.md (card 68f11e17).
 */
import { getUserConfigPath, readConfig } from 'aidd-shared/config';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

import type { RunRecord, SkippedLockfile, TreeAudit } from './lib/advisory-audit/types.ts';

import { type AuditRunner, auditTree, runBunAudit } from './lib/advisory-audit/audit.ts';
import {
	type DirectoryLister,
	enumerateRoots,
	listDirectory,
	treeKey,
} from './lib/advisory-audit/enumerate.ts';
import { readHolds } from './lib/advisory-audit/holds.ts';
import { historyLine, renderReport } from './lib/advisory-audit/report.ts';

const DEFAULT_OUT = 'D:\\applications\\.advisory-audit';
/** The advisory duty's roots beyond the panel's allowed roots (D:\infra and D:\scripts are not aidd-managed). */
const EXTRA_ROOTS = ['D:\\infra', 'D:\\scripts'];
/** How many retained records the baseline reads back through for a tree's last audited state. */
const BASELINE_DEPTH = 50;

async function configuredScope(): Promise<{ ignored: Set<string>; roots: string[] }> {
	const config = await readConfig(getUserConfigPath());
	const allowed = config.web?.allowedRoots ?? [];
	const ignored = new Set((config.web?.ignoredFolders ?? []).map((name) => name.toLowerCase()));
	return { ignored, roots: [...new Set([...allowed, ...EXTRA_ROOTS])] };
}

/**
 * Writes the record as `<stamp>.json`, or `<stamp>-<n>.json` when that name is taken. The name is
 * reserved by the exclusive create itself (`wx`), not by a look-before-write, so two runs in the
 * same millisecond, or a stamp that already exists, both keep their own record.
 */
async function reserveRecord(runsDir: string, stamp: string, text: string): Promise<string> {
	for (let n = 0; ; n++) {
		const name = n === 0 ? `${stamp}.json` : `${stamp}-${String(n)}.json`;
		try {
			await writeFile(join(runsDir, name), text, { encoding: 'utf8', flag: 'wx' });
			return name;
		} catch (err) {
			if (!(err instanceof Error && 'code' in err && err.code === 'EEXIST')) throw err;
		}
	}
}

/**
 * The last audited state of every tree, read back through the retained records newest first. A
 * tree's entry comes from the most recent record in which it was audited, so a run that was
 * UNSWEPT or interrupted in between neither erases the packages it must re-check nor makes a
 * finding that persisted read as new again. The walk stops after BASELINE_DEPTH records.
 */
async function baselineRecord(runsDir: string, before: string): Promise<null | RunRecord> {
	let names: string[];
	try {
		names = await readdir(runsDir);
	} catch {
		return null;
	}
	const candidates = names
		.filter((n) => n.endsWith('.json') && n < before)
		.sort()
		.reverse()
		.slice(0, BASELINE_DEPTH);
	let newest: null | RunRecord = null;
	const trees = new Map<string, TreeAudit>();
	for (const name of candidates) {
		const record = JSON.parse(await readFile(join(runsDir, name), 'utf8')) as RunRecord;
		newest ??= record;
		for (const tree of record.trees)
			if (tree.status === 'audited' && !trees.has(tree.key)) trees.set(tree.key, tree);
	}
	return newest === null ? null : { ...newest, trees: [...trees.values()] };
}

/**
 * Owners by tree name, from `<out>/owners.json` (`{ "<tree>": ["<name>", ...] }`). The map lives
 * outside the repository on purpose: several tree names are private patterns the leak guard
 * refuses in tracked files, and which name owns what is the operator's to settle. A missing file
 * means every tree reports as unowned.
 */
async function readOwners(out: string): Promise<Record<string, string[]>> {
	let text: string;
	try {
		text = await readFile(join(out, 'owners.json'), 'utf8');
	} catch {
		return {};
	}
	const parsed = JSON.parse(text) as unknown;
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
		throw new Error('owners.json: expected an object of tree name to owner names');
	const owners: Record<string, string[]> = {};
	for (const [tree, names] of Object.entries(parsed as Record<string, unknown>)) {
		if (!Array.isArray(names) || !names.every((n) => typeof n === 'string'))
			throw new Error(`owners.json: ${tree} must list owner names`);
		owners[tree] = names as string[];
	}
	return owners;
}

export async function runAdvisoryAudit(options: {
	ignored: ReadonlySet<string>;
	/** Injected by tests; the script lists real directories. */
	list?: DirectoryLister | undefined;
	/** Injected by tests; the script runs the real `bun audit --json`. */
	now?: Date | undefined;
	out: string;
	roots: string[];
	runner?: AuditRunner | undefined;
	timeoutMs: number;
	tree?: string | undefined;
}): Promise<number> {
	const now = options.now ?? new Date();
	const stamp = now.toISOString().replace(/[-:]/g, '');
	const runsDir = join(options.out, 'runs');
	await mkdir(runsDir, { recursive: true });
	const previous = await baselineRecord(runsDir, stamp);
	const holds = readHolds(join(options.out, 'acknowledged-holds.json'));
	const owners = await readOwners(options.out);

	const list = options.list ?? listDirectory;
	const scanned = options.tree
		? await enumerateRoots([options.tree], 0, options.ignored, owners, list)
		: await enumerateRoots(options.roots, 4, options.ignored, owners, list);
	const trees: TreeAudit[] = [];
	const skipped: SkippedLockfile[] = [];
	const noSurface: string[] = [];
	const unreadable: string[] = [];
	const runner = options.runner ?? runBunAudit;
	for (const { entries, readable, root, unreadable: subtrees } of scanned) {
		// A directory that cannot be listed is UNSWEPT, whether it is the root or a subtree; only a
		// root listed in full with no lockfile has no surface.
		if (!readable) {
			unreadable.push(root);
			console.error(`[advisory-audit] ${root}: UNSWEPT (root cannot be read)`);
			continue;
		}
		for (const dir of subtrees) {
			unreadable.push(dir);
			console.error(`[advisory-audit] ${dir}: UNSWEPT (directory cannot be read)`);
		}
		if (entries.length === 0 && subtrees.length === 0) noSurface.push(root);
		for (const entry of entries) {
			if (entry.kind === 'artifact' || entry.kind === 'foreign') {
				skipped.push({
					key: treeKey(entry),
					lockPath: entry.lockPath,
					reason: entry.reason ?? '',
				});
				continue;
			}
			// A clone reports under its parent with its own path named, since its lock can differ;
			// the full relative path keeps a clone's nested workspaces apart.
			const key =
				entry.kind === 'clone'
					? `${basename(entry.root)}/${entry.parentTree ?? ''} (clone ${relative(entry.root, entry.treeDir).split('\\').join('/')})`
					: treeKey(entry);
			// Re-check what the previous record named as a finding OR as LOCK-ONLY: a store that
			// still links the old version must keep being reported after the audit goes clean.
			const previousTree = previous?.trees.find((t) => t.key === key);
			const previousPackages = [
				...(previousTree?.findings.map((f) => f.package) ?? []),
				...(previousTree?.lockOnly.map((l) => l.package) ?? []),
			];
			const audit = await auditTree({
				key,
				owners: entry.owners,
				previousPackages,
				runner,
				timeoutMs: options.timeoutMs,
				treeDir: entry.treeDir,
			});
			trees.push(audit);
			const status =
				audit.status === 'unswept'
					? `UNSWEPT (${audit.error ?? ''})`
					: `${String(audit.findings.length)} finding(s)${audit.lockOnly.length > 0 ? ', LOCK-ONLY' : ''}`;
			console.log(`[advisory-audit] ${key}: ${status}`);
		}
	}
	const record: RunRecord = {
		command: 'bun audit --json',
		generatedAt: now.toISOString(),
		noSurface,
		roots: scanned.map((s) => s.root),
		skipped,
		trees,
		unreadable,
	};
	const recordName = await reserveRecord(
		runsDir,
		stamp,
		`${JSON.stringify(record, null, '\t')}\n`,
	);
	await writeFile(
		join(options.out, 'latest.md'),
		renderReport(record, previous, holds, now),
		'utf8',
	);
	const line = historyLine(record, previous, holds, now, `runs/${recordName}`);
	await writeFile(join(options.out, 'history.md'), `${line}\n`, { encoding: 'utf8', flag: 'a' });
	console.log(line);
	const unswept = trees.filter((t) => t.status === 'unswept').length + record.unreadable.length;
	if (unswept > 0)
		console.error(
			`[advisory-audit] ${String(unswept)} tree(s) or director(ies) UNSWEPT; the run is incomplete.`,
		);
	return unswept > 0 ? 1 : 0;
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			out: { type: 'string' },
			'timeout-ms': { type: 'string' },
			tree: { type: 'string' },
		},
		strict: true,
	});
	const timeoutMs = Number(values['timeout-ms'] ?? '120000');
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		console.error('[advisory-audit] --timeout-ms must be a positive number');
		exit(2);
	}
	try {
		const scope = await configuredScope();
		exit(
			await runAdvisoryAudit({
				ignored: scope.ignored,
				out: values.out ?? DEFAULT_OUT,
				roots: values.tree ? [] : scope.roots,
				timeoutMs,
				tree: values.tree,
			}),
		);
	} catch (err) {
		console.error(`[advisory-audit] ${err instanceof Error ? err.message : String(err)}`);
		exit(2);
	}
}
