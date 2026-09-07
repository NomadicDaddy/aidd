import { metadataPath } from 'aidd-shared/metadata/paths';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { CommitsNumstat } from '../git/commitsNumstat.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { runs, settings } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { readTextOrNull } from '../fsHelpers.ts';
import { readCommitsNumstat } from '../git/commitsNumstat.ts';
import {
	commitRefsFromUnknown,
	type RawRunLedgerEntry,
} from '../projectMetadata/iterationParseHelpers.ts';
import { TERMINAL_STATUSES } from './types.ts';

/** Settings key marking the one-shot output-metrics backfill as done. The flag — rather than
 * rescanning for NULL columns — is what stops runs that can never be filled (no ledger entry,
 * GC'd commits) from re-triggering ledger reads and git spawns on every boot. */
export const OUTPUT_METRICS_BACKFILL_KEY = 'runs.outputMetricsBackfill';
export const RUN_COST_BACKFILL_KEY = 'runs.costBackfill';

interface LedgerRunMetrics {
	commitHashes: string[];
	costUsd: null | number;
	diffStat: CommitsNumstat | null;
	tokens: {
		cachedTokens: null | number;
		inputTokens: number;
		outputTokens: number;
		reasoningTokens: null | number;
	} | null;
}

function recordValue(value: unknown): null | Record<string, unknown> {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function finiteNumber(value: unknown): null | number {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function tokensFromTotals(value: unknown): LedgerRunMetrics['tokens'] {
	const totals = recordValue(value);
	if (!totals) return null;
	const inputTokens = finiteNumber(totals.inputTokens);
	const outputTokens = finiteNumber(totals.outputTokens);
	// Input/output are the load-bearing pair; a totals blob without both is treated as
	// token-less rather than half-filled.
	if (inputTokens === null || outputTokens === null) return null;
	return {
		cachedTokens: finiteNumber(totals.cachedTokens),
		inputTokens,
		outputTokens,
		reasoningTokens: finiteNumber(totals.reasoningTokens),
	};
}

function costFromTotals(value: unknown): null | number {
	const totals = recordValue(value);
	const costUsd = finiteNumber(totals?.costUsd);
	return costUsd !== null && costUsd > 0 ? costUsd : null;
}

function diffStatFromEntry(value: unknown): CommitsNumstat | null {
	const diffStat = recordValue(value);
	if (!diffStat) return null;
	const deletions = finiteNumber(diffStat.deletions);
	const filesChanged = finiteNumber(diffStat.filesChanged);
	const insertions = finiteNumber(diffStat.insertions);
	if (deletions === null || filesChanged === null || insertions === null) return null;
	return { deletions, filesChanged, insertions };
}

async function readLedgerMetrics(projectPath: string): Promise<Map<string, LedgerRunMetrics>> {
	const metrics = new Map<string, LedgerRunMetrics>();
	const content = await readTextOrNull(metadataPath(projectPath, 'runs.jsonl'));
	if (content === null) return metrics;
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let parsed: RawRunLedgerEntry;
		try {
			parsed = JSON.parse(trimmed) as RawRunLedgerEntry;
		} catch {
			continue;
		}
		if (typeof parsed.runId !== 'string' || parsed.runId.length === 0) continue;
		// Last entry wins: a crash-fallback line can precede the real summary for the same run.
		metrics.set(parsed.runId, {
			commitHashes: commitRefsFromUnknown(parsed.commitsCreated).map((ref) => ref.hash),
			costUsd: costFromTotals(parsed.totals),
			diffStat: diffStatFromEntry(parsed.diffStat),
			tokens: tokensFromTotals(parsed.totals),
		});
	}
	return metrics;
}

/**
 * One-shot backfill for the cost column. It uses a flag distinct from the output-metrics sweep's
 * because an installation may have completed that sweep without this one.
 * Only positive provider-reported totals are persisted; zero and absence both remain SQL NULL.
 * @param db
 * @returns The number of rows updated with a provider-reported cost.
 */
export async function backfillRunCosts(db: WebDatabase): Promise<number> {
	const flag = await db
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, RUN_COST_BACKFILL_KEY))
		.limit(1);
	if (flag[0]) return 0;

	const candidates = await db
		.select({ id: runs.id, projectPath: runs.projectPath })
		.from(runs)
		.where(and(isNull(runs.costUsd), inArray(runs.status, [...TERMINAL_STATUSES])));
	const byProject = new Map<string, string[]>();
	for (const row of candidates) {
		const ids = byProject.get(row.projectPath) ?? [];
		ids.push(row.id);
		byProject.set(row.projectPath, ids);
	}

	let updated = 0;
	for (const [projectPath, runIds] of byProject) {
		const ledger = await readLedgerMetrics(projectPath).catch((error: unknown) => {
			webLogger.warn({ error, projectPath }, 'Run-cost backfill: ledger read failed');
			return new Map<string, LedgerRunMetrics>();
		});
		for (const runId of runIds) {
			const costUsd = ledger.get(runId)?.costUsd ?? null;
			if (costUsd === null) continue;
			try {
				await withSqliteRetry(
					() => db.update(runs).set({ costUsd }).where(eq(runs.id, runId)),
					{
						label: 'runs.costBackfill',
					},
				);
				updated++;
			} catch (err) {
				webLogger.warn({ err, runId }, 'Run-cost backfill: row update failed');
			}
		}
	}

	const value = JSON.stringify({ completedAt: Date.now(), scanned: candidates.length, updated });
	await withSqliteRetry(
		() =>
			db
				.insert(settings)
				.values({ key: RUN_COST_BACKFILL_KEY, value })
				.onConflictDoUpdate({
					set: { updatedAt: Date.now(), value },
					target: settings.key,
				}),
		{ label: 'runs.costBackfill.flag' },
	);
	if (updated > 0) webLogger.info({ updated }, 'Backfilled run costs');
	return updated;
}

/**
 * One-shot backfill of the run output-metric columns (lines added/removed, tokens) for rows
 * with none captured. Tokens come from the ledger's `totals`; line counts from the ledger's
 * `diffStat` when present, otherwise re-derived from git numstat over the recorded commit
 * hashes (best-effort — GC'd/rebased history degrades to partial or absent line data).
 * Idempotent and gated by a settings flag, so it costs one SELECT per boot after completion.
 * @param db
 * @returns The number of rows updated.
 */
export async function backfillRunOutputMetrics(db: WebDatabase): Promise<number> {
	const flag = await db
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, OUTPUT_METRICS_BACKFILL_KEY))
		.limit(1);
	if (flag[0]) return 0;

	// Both NULL means "never captured". Tokens-only rows (NULL lines, non-NULL tokens) are
	// commit-less runs the new capture path already handled — not backfill candidates.
	const candidates = await db
		.select({ id: runs.id, projectPath: runs.projectPath })
		.from(runs)
		.where(
			and(
				isNull(runs.inputTokens),
				isNull(runs.linesAdded),
				inArray(runs.status, [...TERMINAL_STATUSES]),
			),
		);

	const byProject = new Map<string, string[]>();
	for (const row of candidates) {
		const ids = byProject.get(row.projectPath) ?? [];
		ids.push(row.id);
		byProject.set(row.projectPath, ids);
	}

	let updated = 0;
	for (const [projectPath, runIds] of byProject) {
		const ledger = await readLedgerMetrics(projectPath).catch((error: unknown) => {
			webLogger.warn({ error, projectPath }, 'Output-metrics backfill: ledger read failed');
			return new Map<string, LedgerRunMetrics>();
		});
		if (ledger.size === 0) continue;
		for (const runId of runIds) {
			const entry = ledger.get(runId);
			if (!entry) continue;
			const lines =
				entry.diffStat ??
				(entry.commitHashes.length > 0
					? await readCommitsNumstat(projectPath, entry.commitHashes)
					: null);
			const set: Partial<typeof runs.$inferInsert> = {
				...(entry.tokens ?? {}),
				...(lines
					? {
							filesChanged: lines.filesChanged,
							linesAdded: lines.insertions,
							linesRemoved: lines.deletions,
						}
					: {}),
			};
			if (Object.keys(set).length === 0) continue;
			try {
				await withSqliteRetry(() => db.update(runs).set(set).where(eq(runs.id, runId)), {
					label: 'runs.outputMetricsBackfill',
				});
				updated++;
			} catch (err) {
				webLogger.warn({ err, runId }, 'Output-metrics backfill: row update failed');
			}
		}
	}

	const value = JSON.stringify({
		completedAt: Date.now(),
		scanned: candidates.length,
		updated,
	});
	await withSqliteRetry(
		() =>
			db
				.insert(settings)
				.values({ key: OUTPUT_METRICS_BACKFILL_KEY, value })
				.onConflictDoUpdate({
					set: { updatedAt: Date.now(), value },
					target: settings.key,
				}),
		{ label: 'runs.outputMetricsBackfill.flag' },
	);
	if (updated > 0) {
		webLogger.info({ scanned: candidates.length, updated }, 'Backfilled run output metrics');
	}
	return updated;
}
