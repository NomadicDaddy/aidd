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

function findingKeys(record: RunRecord): Set<string> {
	const keys = new Set<string>();
	for (const tree of record.trees)
		for (const f of tree.findings) keys.add(findingKey(tree.key, f.package, f.ghsa));
	return keys;
}

/** Findings present now and absent last run, and the reverse. A first run has no "closed". */
export function diffRuns(
	current: RunRecord,
	previous: null | RunRecord,
): { closed: string[]; opened: string[] } {
	const now = findingKeys(current);
	const before = previous === null ? new Set<string>() : findingKeys(previous);
	return {
		closed: [...before].filter((key) => !now.has(key)).sort(),
		opened: [...now].filter((key) => !before.has(key)).sort(),
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
	if (sorted.length === 0)
		lines.push(`Findings: none (bun audit exit 0, ${String(tree.durationMs)}ms).`);
	for (const f of sorted) {
		const hold = findHold(holds, tree.key, f.package, f.ghsa);
		const suffix =
			hold === undefined
				? ''
				: (() => {
						const status = holdStatus(hold, now);
						return ` — held by ${hold.owner} since ${hold.date} (${String(status.ageDays)} days, ${hold.blockedOn})${status.stale ? ' **STALE HOLD**' : ''}: ${hold.reason}`;
					})();
		lines.push(
			`- ${f.severity}: ${f.package} ${f.vulnerableVersions} — [${f.ghsa}](${f.url}) ${f.title}${suffix}`,
		);
	}
	lines.push('');
	return lines;
}

export function renderReport(
	record: RunRecord,
	previous: null | RunRecord,
	holds: Hold[],
	now: Date,
): string {
	const { closed, opened } = diffRuns(record, previous);
	const unswept = record.trees.filter((t) => t.status === 'unswept');
	const lockOnlyTrees = record.trees.filter((t) => t.lockOnly.length > 0);
	const staleHolds = holds.map((h) => holdStatus(h, now)).filter((s) => s.stale);
	const lines: string[] = [
		`# Advisory audit — ${record.generatedAt}`,
		'',
		`Roots: ${record.roots.join(', ')}. Trees audited: ${String(record.trees.length)}. UNSWEPT: ${unswept.length === 0 ? 'none' : unswept.map((t) => t.key).join(', ')}. Artifact lockfiles skipped: ${String(record.skipped.length)}. No npm surface: ${record.noSurface.length === 0 ? 'none' : record.noSurface.join(', ')}.`,
		'',
		`Findings: ${countBySeverity(record.trees)}. LOCK-ONLY trees: ${lockOnlyTrees.length === 0 ? 'none' : lockOnlyTrees.map((t) => t.key).join(', ')}. Stale holds: ${String(staleHolds.length)}.`,
		'',
		'## New since last report',
		'',
		...(opened.length === 0 ? ['none'] : opened.map((k) => `- ${k}`)),
		'',
		'## Closed since last report',
		'',
		...(previous === null
			? ['first run, nothing to compare']
			: closed.length === 0
				? ['none']
				: closed.map((k) => `- ${k}`)),
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

/** One line per run, written even when nothing was found, so a missing line is the alarm. */
export function historyLine(
	record: RunRecord,
	previous: null | RunRecord,
	holds: Hold[],
	now: Date,
): string {
	const { closed, opened } = diffRuns(record, previous);
	const unswept = record.trees.filter((t) => t.status === 'unswept').map((t) => t.key);
	const lockOnly = record.trees.filter((t) => t.lockOnly.length > 0).map((t) => t.key);
	const stale = holds.filter((h) => holdStatus(h, now).stale).length;
	return `${record.generatedAt} | trees ${String(record.trees.length)} | unswept: ${unswept.length === 0 ? 'none' : unswept.join(', ')} | lock-only: ${lockOnly.length === 0 ? 'none' : lockOnly.join(', ')} | findings: ${countBySeverity(record.trees)} | new ${String(opened.length)} | closed ${String(closed.length)} | stale holds ${String(stale)} | artifacts skipped ${String(record.skipped.length)}`;
}
