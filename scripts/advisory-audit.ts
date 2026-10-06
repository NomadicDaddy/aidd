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

import { auditTree, runBunAudit } from './lib/advisory-audit/audit.ts';
import { enumerateRoots, treeKey } from './lib/advisory-audit/enumerate.ts';
import { readHolds } from './lib/advisory-audit/holds.ts';
import { historyLine, renderReport } from './lib/advisory-audit/report.ts';

const DEFAULT_OUT = 'D:\\applications\\.advisory-audit';
/** The advisory duty's roots beyond the panel's allowed roots (D:\infra and D:\scripts are not aidd-managed). */
const EXTRA_ROOTS = ['D:\\infra', 'D:\\scripts'];

async function configuredScope(): Promise<{ ignored: Set<string>; roots: string[] }> {
	const config = await readConfig(getUserConfigPath());
	const allowed = config.web?.allowedRoots ?? [];
	const ignored = new Set((config.web?.ignoredFolders ?? []).map((name) => name.toLowerCase()));
	return { ignored, roots: [...new Set([...allowed, ...EXTRA_ROOTS])] };
}

async function previousRecord(runsDir: string, before: string): Promise<null | RunRecord> {
	let names: string[];
	try {
		names = await readdir(runsDir);
	} catch {
		return null;
	}
	const candidates = names.filter((n) => n.endsWith('.json') && n < before).sort();
	const latest = candidates.at(-1);
	if (latest === undefined) return null;
	return JSON.parse(await readFile(join(runsDir, latest), 'utf8')) as RunRecord;
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
	out: string;
	roots: string[];
	timeoutMs: number;
	tree?: string | undefined;
}): Promise<number> {
	const now = new Date();
	const stamp = now
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d+Z$/, 'Z');
	const runsDir = join(options.out, 'runs');
	await mkdir(runsDir, { recursive: true });
	const previous = await previousRecord(runsDir, stamp);
	const holds = readHolds(join(options.out, 'acknowledged-holds.json'));
	const owners = await readOwners(options.out);

	const scanned = options.tree
		? [
				{
					entries: (
						await enumerateRoots([options.tree], 0, options.ignored, owners)
					).flatMap((r) => r.entries),
					root: options.tree,
				},
			]
		: await enumerateRoots(options.roots, 4, options.ignored, owners);
	const trees: TreeAudit[] = [];
	const skipped: SkippedLockfile[] = [];
	const noSurface: string[] = [];
	for (const { entries, root } of scanned) {
		if (entries.length === 0) noSurface.push(root);
		for (const entry of entries) {
			if (entry.kind === 'artifact') {
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
			const previousPackages =
				previous?.trees.find((t) => t.key === key)?.findings.map((f) => f.package) ?? [];
			const audit = await auditTree({
				key,
				owners: entry.owners,
				previousPackages,
				runner: runBunAudit,
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
		generatedAt: now.toISOString(),
		noSurface,
		roots: scanned.map((s) => s.root),
		skipped,
		trees,
	};
	await writeFile(
		join(runsDir, `${stamp}.json`),
		`${JSON.stringify(record, null, '\t')}\n`,
		'utf8',
	);
	await writeFile(
		join(options.out, 'latest.md'),
		renderReport(record, previous, holds, now),
		'utf8',
	);
	const line = historyLine(record, previous, holds, now);
	await writeFile(join(options.out, 'history.md'), `${line}\n`, { encoding: 'utf8', flag: 'a' });
	console.log(line);
	const unswept = trees.filter((t) => t.status === 'unswept').length;
	if (unswept > 0)
		console.error(
			`[advisory-audit] ${String(unswept)} tree(s) UNSWEPT; the run is incomplete.`,
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
