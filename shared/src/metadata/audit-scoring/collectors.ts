// I/O collectors for audit change-potential scoring: they read the run ledger, feature
// backlog, and audit-report coverage so the pure scorer in `./scorer.ts` stays testable.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { type Feature, featureSchema } from '../features.ts';
import { METADATA_DIR } from '../paths.ts';
import { type AuditPriority, extractPriorityFromFrontmatter } from './scorer.ts';

// Pinned format of the audit run summary line written by `audit.ts` into `.aidd/runs.jsonl`
// via `store.appendRunSummary`. If the writer format ever changes, update both ends
// together. The captured groups are <auditName> and <findingCount>.
export const AUDIT_RUN_SUMMARY_PATTERN = /^audit (\S+) finished with (\d+) finding\(s\) created$/;

// Per-root child-directory deny-list when enumerating projects. The leading `.`/`_`
// prefix filter handles dotted dirs (`.git`, `.aidd`, `.old`, `.next`, …) so this set
// only needs to name non-dot entries we want to skip.
export const IGNORED_DIRS: ReadonlySet<string> = new Set([
	'build',
	'coverage',
	'dist',
	'node_modules',
	'out',
	'temp',
	'tmp',
]);

// Tail-truncate the runs ledger so a long-lived project does not turn one scorer call
// into a megabyte read. Five hundred entries is well over a year of activity in practice.
const RUNS_LEDGER_TAIL_LINES = 500;

// Per-project counts keyed by uppercase audit name. Built once per project, reused
// across all audits via `buildScoreInput`.
export interface ProjectAuditEvidence {
	activeAuditFeatures: Map<string, number>;
	completedRunsWithFindings: Map<string, number>;
	hasAuditReport: Set<string>;
	hasCompletedAuditFeature: Set<string>;
	incompleteAuditRuns: Map<string, number>;
}

export async function collectProjectEvidence(projectDir: string): Promise<ProjectAuditEvidence> {
	const evidence: ProjectAuditEvidence = {
		activeAuditFeatures: new Map(),
		completedRunsWithFindings: new Map(),
		hasAuditReport: new Set(),
		hasCompletedAuditFeature: new Set(),
		incompleteAuditRuns: new Map(),
	};
	await collectRunLedger(projectDir, evidence);
	await collectFeatures(projectDir, evidence);
	await collectAuditReports(projectDir, evidence);
	return evidence;
}

async function collectRunLedger(projectDir: string, evidence: ProjectAuditEvidence): Promise<void> {
	const ledgerPath = join(projectDir, METADATA_DIR, 'runs.jsonl');
	let body: string;
	try {
		body = await readFile(ledgerPath, 'utf8');
	} catch {
		return;
	}
	const allLines = body.split(/\r?\n/).filter((line) => line.length > 0);
	const lines =
		allLines.length > RUNS_LEDGER_TAIL_LINES
			? allLines.slice(allLines.length - RUNS_LEDGER_TAIL_LINES)
			: allLines;
	for (const line of lines) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			continue;
		}
		if (typeof parsed !== 'object' || parsed === null) continue;
		const entry = parsed as { stopReason?: unknown; summary?: unknown };
		if (typeof entry.summary !== 'string') continue;
		const match = entry.summary.match(AUDIT_RUN_SUMMARY_PATTERN);
		if (!match) continue;
		const auditName = (match[1] ?? '').toUpperCase();
		if (!auditName) continue;
		const findingCount = Number(match[2] ?? 0);
		const stopReason = typeof entry.stopReason === 'string' ? entry.stopReason : '';
		if (stopReason === 'completed' && findingCount > 0) {
			incrementCounter(evidence.completedRunsWithFindings, auditName);
		} else {
			incrementCounter(evidence.incompleteAuditRuns, auditName);
		}
	}
}

async function collectFeatures(projectDir: string, evidence: ProjectAuditEvidence): Promise<void> {
	const featuresDir = join(projectDir, METADATA_DIR, 'features');
	let entries: string[];
	try {
		entries = await readdir(featuresDir);
	} catch {
		return;
	}
	for (const entry of entries) {
		const file = join(featuresDir, entry, 'feature.json');
		let raw: string;
		try {
			raw = await readFile(file, 'utf8');
		} catch {
			continue;
		}
		let feature: Feature;
		try {
			feature = featureSchema.parse(JSON.parse(raw));
		} catch {
			continue;
		}
		const auditName = auditNameFromFeature(feature, entry);
		if (!auditName) continue;
		if (feature.status === 'completed') {
			evidence.hasCompletedAuditFeature.add(auditName);
		} else {
			incrementCounter(evidence.activeAuditFeatures, auditName);
		}
	}
}

// Feature can declare its source either via the `auditSource` field or via the
// `audit-<lower-snake>-<timestamp>-<slug>` directory convention; check both.
function auditNameFromFeature(feature: Feature, directoryName: string): string | undefined {
	if (typeof feature.auditSource === 'string' && feature.auditSource.trim().length > 0) {
		return feature.auditSource.trim().toUpperCase();
	}
	const directoryMatch = directoryName.match(/^audit-([a-z][a-z0-9_-]*?)-\d+-/);
	if (!directoryMatch || !directoryMatch[1]) return undefined;
	return directoryMatch[1].replace(/-/g, '_').toUpperCase();
}

async function collectAuditReports(
	projectDir: string,
	evidence: ProjectAuditEvidence,
): Promise<void> {
	const reportsDir = join(projectDir, METADATA_DIR, 'audit-reports');
	let entries: string[];
	try {
		entries = await readdir(reportsDir);
	} catch {
		return;
	}
	for (const entry of entries) {
		if (!entry.endsWith('.md')) continue;
		// Report filenames are `<AUDIT_NAME>-YYYY-MM-DD.md`. The audit name is everything
		// before the trailing `-YYYY-MM-DD.md` segment.
		const dateBoundary = entry.search(/-\d{4}-\d{2}-\d{2}\.md$/);
		if (dateBoundary <= 0) continue;
		evidence.hasAuditReport.add(entry.slice(0, dateBoundary).toUpperCase());
	}
}

function incrementCounter(map: Map<string, number>, key: string): void {
	map.set(key, (map.get(key) ?? 0) + 1);
}

export async function loadAuditPriorities(
	catalogDir: string,
	auditNames: readonly string[],
): Promise<Map<string, AuditPriority | null>> {
	const map = new Map<string, AuditPriority | null>();
	await Promise.all(
		auditNames.map(async (name) => {
			const key = name.toUpperCase();
			const file = join(catalogDir, 'audits', `${name}.md`);
			try {
				const body = await readFile(file, 'utf8');
				map.set(key, extractPriorityFromFrontmatter(body));
			} catch {
				map.set(key, null);
			}
		}),
	);
	return map;
}

// Enumerate direct child directories of every configured root, deduplicated. Skips
// dotted, underscore-prefixed, and IGNORED_DIRS entries. Read failures on a root are
// silently skipped — a misconfigured allowedRoot should not break audit scoring.
export async function enumerateProjectsUnderRoots(roots: readonly string[]): Promise<string[]> {
	const seen = new Set<string>();
	for (const root of roots) {
		if (!root) continue;
		let entries: string[];
		try {
			entries = await readdir(root);
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.startsWith('.') || entry.startsWith('_')) continue;
			if (IGNORED_DIRS.has(entry)) continue;
			const full = join(root, entry);
			try {
				const info = await stat(full);
				if (info.isDirectory()) seen.add(full);
			} catch {
				continue;
			}
		}
	}
	return [...seen];
}
