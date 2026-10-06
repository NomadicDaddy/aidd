import type { Hold, RunRecord, TreeAudit } from './types.ts';

import { findHold, holdStatus } from './holds.ts';

const SEVERITY_ORDER = ['critical', 'high', 'moderate', 'low'];

function severityRank(severity: string): number {
	const index = SEVERITY_ORDER.indexOf(severity);
	return index === -1 ? SEVERITY_ORDER.length : index;
}

export function findingKey(tree: string, pkg: string, ghsa: string): string {
	return `${tree} ${pkg} ${ghsa}`;
}

function findingKeys(trees: TreeAudit[]): Set<string> {
	const keys = new Set<string>();
	for (const tree of trees)
		for (const f of tree.findings) keys.add(findingKey(tree.key, f.package, f.ghsa));
	return keys;
}

export interface RunDiff {
	/** Previous findings whose tree was audited this run and no longer reports them. */
	closed: string[];
	opened: string[];
	/** Previous findings whose tree is skipped by name this run: out of scope, neither closed nor owed. */
	outOfScope: string[];
	/** Previous findings whose tree is UNSWEPT or absent this run: unknown, not closed. */
	unverified: string[];
}

/**
 * What changed between two runs. A finding counts as closed only when its tree was audited this
 * run and no longer reports it; a tree that is UNSWEPT or missing now cannot close anything, and a
 * tree the run skips by name (an artifact or a foreign lockfile) is out of scope rather than owed.
 * bun audit can list one advisory twice for a package resolved at two versions, so each bucket is
 * a set.
 */
export function diffRuns(current: RunRecord, previous: null | RunRecord): RunDiff {
	const now = findingKeys(current.trees);
	const audited = new Set(current.trees.filter((t) => t.status === 'audited').map((t) => t.key));
	const skipped = new Set(current.skipped.map((s) => s.key));
	const closed = new Set<string>();
	const outOfScope = new Set<string>();
	const unverified = new Set<string>();
	for (const tree of previous?.trees ?? []) {
		for (const f of tree.findings) {
			const key = findingKey(tree.key, f.package, f.ghsa);
			if (now.has(key)) continue;
			if (audited.has(tree.key)) closed.add(key);
			else if (skipped.has(tree.key)) outOfScope.add(key);
			else unverified.add(key);
		}
	}
	const before = previous === null ? new Set<string>() : findingKeys(previous.trees);
	return {
		closed: [...closed].sort(),
		opened: [...now].filter((key) => !before.has(key)).sort(),
		outOfScope: [...outOfScope].sort(),
		unverified: [...unverified].sort(),
	};
}

function countBySeverity(trees: TreeAudit[]): string {
	const counts = new Map<string, number>();
	for (const tree of trees)
		for (const f of tree.findings) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
	if (counts.size === 0) return '0';
	return [...counts.entries()]
		.sort((a, b) => severityRank(a[0]) - severityRank(b[0]))
		.map(([severity, n]) => `${String(n)} ${severity}`)
		.join(', ');
}

function unsweptNames(record: RunRecord): string[] {
	return [
		...record.unreadable.map((dir) => `${dir} (unreadable)`),
		...record.trees.filter((t) => t.status === 'unswept').map((t) => t.key),
	];
}

function treeBlock(tree: TreeAudit, holds: Hold[], now: Date): string[] {
	const lines: string[] = [];
	const owners = tree.owners.length > 0 ? tree.owners.join(', ') : 'UNOWNED';
	lines.push(`### ${tree.key}`, '', `Owner: ${owners}. Lockfile: ${tree.treeDir}/bun.lock.`);
	if (tree.status === 'unswept') {
		lines.push('', `**UNSWEPT**: ${tree.error ?? 'unknown error'}`, '');
		return lines;
	}
	// The misleading state comes first: a clean audit over a stale store.
	for (const lockOnly of tree.lockOnly) {
		lines.push(
			'',
			`**LOCK-ONLY**: ${lockOnly.package} is ${lockOnly.locked} in the lock, but ${lockOnly.dependent} links ${lockOnly.linked ?? 'nothing'}. Run \`bun install --frozen-lockfile\` in this tree.`,
		);
	}
	if (tree.notInstalled)
		lines.push('', 'Not installed: no node_modules, so the store was not checked.');
	const sorted = [...tree.findings].sort(
		(a, b) => severityRank(a.severity) - severityRank(b.severity),
	);
	lines.push('');
	const exit = tree.exitCode === undefined ? 'unknown' : String(tree.exitCode);
	if (sorted.length === 0)
		lines.push(`Findings: none (bun audit exit ${exit}, ${String(tree.durationMs)}ms).`);
	for (const f of sorted) {
		const hold = findHold(holds, tree.key, f.package, f.ghsa);
		let suffix = '';
		if (hold !== undefined) {
			const status = holdStatus(hold, now);
			suffix = ` — held by ${hold.owner} since ${hold.date} (${String(status.ageDays)} days, ${hold.blockedOn})${status.stale ? ' **STALE HOLD**' : ''}: ${hold.reason}`;
		}
		lines.push(
			`- ${f.severity}: ${f.package} ${f.vulnerableVersions} — [${f.ghsa}](${f.url}) ${f.title}${suffix}`,
		);
	}
	lines.push('');
	return lines;
}

function list(items: string[], empty: string): string[] {
	return items.length === 0 ? [empty] : items.map((k) => `- ${k}`);
}

export function renderReport(
	record: RunRecord,
	previous: null | RunRecord,
	holds: Hold[],
	now: Date,
): string {
	const { closed, opened, outOfScope, unverified } = diffRuns(record, previous);
	const unswept = unsweptNames(record);
	const lockOnlyTrees = record.trees.filter((t) => t.lockOnly.length > 0);
	const staleHolds = holds.map((h) => holdStatus(h, now)).filter((s) => s.stale);
	const lines: string[] = [
		`# Advisory audit — ${record.generatedAt}`,
		'',
		`Roots: ${record.roots.join(', ')}. Trees audited: ${String(record.trees.filter((t) => t.status === 'audited').length)}. UNSWEPT: ${unswept.length === 0 ? 'none' : unswept.join(', ')}. Artifact lockfiles skipped: ${String(record.skipped.length)}. No npm surface: ${record.noSurface.length === 0 ? 'none' : record.noSurface.join(', ')}.`,
		'',
		`Findings: ${countBySeverity(record.trees)}. LOCK-ONLY trees: ${lockOnlyTrees.length === 0 ? 'none' : lockOnlyTrees.map((t) => t.key).join(', ')}. Stale holds: ${String(staleHolds.length)}.`,
		'',
		'## New since last report',
		'',
		...list(opened, 'none'),
		'',
		'## Closed since last report',
		'',
		...(previous === null ? ['first run, nothing to compare'] : list(closed, 'none')),
		'',
		'## Not re-checked (tree UNSWEPT or absent this run)',
		'',
		...list(unverified, 'none'),
		'',
		'## Out of scope (tree skipped by name this run)',
		'',
		...list(outOfScope, 'none'),
		'',
		'## Trees',
		'',
	];
	for (const tree of record.trees) lines.push(...treeBlock(tree, holds, now));
	if (record.skipped.length > 0) {
		lines.push('## Skipped lockfiles', '');
		for (const s of record.skipped) lines.push(`- ${s.lockPath}: ${s.reason}`);
		lines.push('');
	}
	return lines.join('\n');
}

/**
 * One line per run, written even when nothing was found, so a missing line is the alarm. It names
 * the record it summarizes and the roots that were scanned, so the line can be checked against its
 * record and a root dropped from the configuration shows in the history.
 */
export function historyLine(
	record: RunRecord,
	previous: null | RunRecord,
	holds: Hold[],
	now: Date,
	recordFile: string,
): string {
	const { closed, opened, outOfScope, unverified } = diffRuns(record, previous);
	const unswept = unsweptNames(record);
	const lockOnly = record.trees.filter((t) => t.lockOnly.length > 0).map((t) => t.key);
	const stale = holds.filter((h) => holdStatus(h, now).stale).length;
	return `${record.generatedAt} | record ${recordFile} | roots ${record.roots.join(', ')} | trees ${String(record.trees.length)} | unswept: ${unswept.length === 0 ? 'none' : unswept.join(', ')} | lock-only: ${lockOnly.length === 0 ? 'none' : lockOnly.join(', ')} | findings: ${countBySeverity(record.trees)} | new ${String(opened.length)} | closed ${String(closed.length)} | not re-checked ${String(unverified.length)} | out of scope ${String(outOfScope.length)} | stale holds ${String(stale)} | artifacts skipped ${String(record.skipped.length)} | no surface: ${record.noSurface.length === 0 ? 'none' : record.noSurface.join(', ')}`;
}
