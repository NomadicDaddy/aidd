import type { CliActiveRunRecord } from 'aidd-shared/metadata/active-runs';

import { parseArgs } from 'aidd-shared/args/parse';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { hasStructuredAuditOutput } from 'aidd-shared/modes/audit-parsing';
import { persistAuditReports } from 'aidd-shared/modes/audit-persist';
import { discoverProjectAuditNames } from 'aidd-shared/modes/audit-shared';
import { and, eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { HeartbeatWriteOutcome } from '../../db/commands.ts';
import type { RecoveredRunLogEvidence } from './staleResultRecovery.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { runs } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { appendRecoveredAgentResult, recoverRunLogEvidence } from './staleResultRecovery.ts';

export interface StaleAuditRecovery {
	completedAudits: string[];
	findingsCreated: number;
	findingsTotal: number;
	invalidReports: number;
	/** Sentence for the run summary, e.g. "recovered 43 audit report(s) and 20 new finding(s)". */
	note: string;
}

export interface StaleRunRecoveryPlan {
	/** Present only when the log's final agent message parsed; the payload eligible for replay. */
	evidence: RecoveredRunLogEvidence | undefined;
	/** The summary as the dying heartbeat left it, before the recovery marker was added. */
	priorSummary: null | string;
	/** The record to persist in the stale transition, with its summary corrected. */
	record: CliActiveRunRecord;
}

interface AuditLaunchArgs {
	all: boolean;
	names: string[];
	simulation: boolean;
}

/**
 * The persisted command line still carries its launcher prefix ("bun", the entry script), which
 * parseArgs rejects as an unknown option — so parsing starts at the first real flag.
 * @param commandArgs The run process argv as persisted on the active-run record.
 * @returns The audit selection, empty when the line is absent or cannot be parsed.
 */
function auditLaunchArgs(commandArgs: null | string[]): AuditLaunchArgs {
	const empty: AuditLaunchArgs = { all: false, names: [], simulation: false };
	if (!commandArgs) return empty;
	const firstFlag = commandArgs.findIndex((token) => token.startsWith('--'));
	if (firstFlag === -1) return empty;
	try {
		const parsed = parseArgs(commandArgs.slice(firstFlag));
		return { all: parsed.auditAll, names: parsed.auditNames, simulation: parsed.simulation };
	} catch {
		return empty;
	}
}

function declaredAuditNames(structured: Record<string, unknown>): string[] {
	const reports = structured.auditReports;
	if (!Array.isArray(reports)) return [];
	return reports
		.map((report) =>
			typeof report === 'object' && report !== null
				? (report as { auditName?: unknown }).auditName
				: undefined,
		)
		.filter((name): name is string => typeof name === 'string' && name.length > 0);
}

/**
 * structuredAuditReports rejects any report whose name was not requested, so recovery has to
 * reconstruct the selection the run was launched with: the explicit --audit list, or the
 * project's own audit set behind --audit-all. A recipe-launched run can carry neither, and the
 * only remaining hint is the name each report claims — which is untrusted, so it is admitted
 * strictly as a filter over `.aidd/audits/`. The payload may pick from the project's catalog; it
 * can never introduce a name that catalog does not already define.
 * @param record The dead run whose launch arguments name the requested audits.
 * @param structured The recovered result, read only when the arguments name nothing.
 * @returns The audit names to accept reports for, plus the launch flags shaping the write.
 */
async function auditSelection(
	record: CliActiveRunRecord,
	structured: Record<string, unknown>,
): Promise<AuditLaunchArgs> {
	const launch = auditLaunchArgs(record.commandArgs);
	if (launch.names.length > 0) return launch;
	const catalog = await discoverProjectAuditNames(record.projectPath);
	if (launch.all) return { ...launch, names: catalog };
	const known = new Set(catalog);
	return { ...launch, names: declaredAuditNames(structured).filter((name) => known.has(name)) };
}

/**
 * Replay a recovered AIDD_RESULT from a dead audit run into real artifacts.
 *
 * A batch audit can spend half an hour and tens of millions of tokens producing every report,
 * emit them all in one final message, and then lose the whole payload because the CLI process
 * died in the seconds between emitting the result and writing it out. The reports and findings
 * are fully determined by that payload, so the reaper writes them rather than discarding work
 * that already happened — through the same validation the CLI applies, so an invented or
 * malformed report is dropped here exactly as it would have been there. The run row itself stays
 * failed: the process really did die, and the rest of its finalization never ran.
 * @param record The dead run being reaped.
 * @param evidence The result recovered from its run log, with the surrounding transcript.
 * @returns What was written, or undefined when the run was not a replayable audit.
 */
export async function recoverStaleAuditArtifacts(
	record: CliActiveRunRecord,
	evidence: RecoveredRunLogEvidence,
): Promise<StaleAuditRecovery | undefined> {
	if (record.mode !== 'audit') return undefined;
	const launch = await auditSelection(record, evidence.result);
	if (!hasStructuredAuditOutput(evidence.result, launch.names.length > 1)) return undefined;
	try {
		const persisted = await persistAuditReports({
			projectDir: record.projectPath,
			runId: record.id,
			selectedAudits: launch.names,
			simulated: launch.simulation,
			store: new FileAiddStore(record.projectPath),
			structured: evidence.result,
		});
		if (persisted.completedAudits.length === 0) return undefined;
		const invalidReports = persisted.invalid.length;
		const invalidSuffix = invalidReports > 0 ? `, ${invalidReports} invalid report(s)` : '';
		const skippedSuffix =
			persisted.skippedLedgerLines > 0
				? `, ${persisted.skippedLedgerLines} malformed findings-ledger line(s) skipped`
				: '';
		return {
			completedAudits: persisted.completedAudits,
			findingsCreated: persisted.totalCreated,
			findingsTotal: persisted.totalFindings,
			invalidReports,
			note: `recovered ${persisted.completedAudits.length} audit report(s) and ${persisted.totalCreated} new finding(s) from the run log${invalidSuffix}${skippedSuffix}`,
		};
	} catch (err) {
		webLogger.warn(
			{ err, runId: record.id },
			'Failed to persist recovered audit artifacts for a stale run',
		);
		return undefined;
	}
}

/**
 * Read what a dying run left in its log, without writing anything.
 *
 * Split from the replay deliberately: the read informs the summary the stale transition persists,
 * but nothing may touch the filesystem until that transition has actually been won.
 * @param record The dead run being reaped.
 * @returns The record to persist, the payload eligible for replay, and the pre-marker summary.
 */
export async function prepareStaleRunRecovery(
	record: CliActiveRunRecord,
): Promise<StaleRunRecoveryPlan> {
	const evidence = await recoverRunLogEvidence(record.logPath);
	const priorSummary = record.summary;
	if (evidence === undefined) return { evidence, priorSummary, record };
	return {
		evidence,
		priorSummary,
		record: { ...record, summary: appendRecoveredAgentResult(priorSummary) },
	};
}

/**
 * Replay recovered artifacts, but only for the writer that won the terminal transition.
 *
 * The stale transition is the claim: exactly one caller sees `inserted` or `updated` for a given
 * run, and every later sweep sees `already-terminal`. Gating the filesystem write on that outcome
 * makes replay run at most once, so a duplicate sweep cannot overwrite that day's report with a
 * second pass, and a failed database write leaves no artifacts behind a still-retryable row. The
 * summary note is then written compare-and-set against the summary this transition wrote, so a
 * later authoritative runs.jsonl backfill is never clobbered.
 * @param db The web database handle, used only for the follow-up summary note.
 * @param plan The recovery plan produced before the transition.
 * @param outcome How the stale transition resolved; only a won claim replays.
 * @returns The summary now on the row, whether or not anything was replayed.
 */
export async function replayStaleRunArtifacts(
	db: WebDatabase,
	plan: StaleRunRecoveryPlan,
	outcome: HeartbeatWriteOutcome['kind'],
): Promise<null | string> {
	const { evidence, priorSummary, record } = plan;
	if (evidence === undefined || outcome === 'already-terminal') return record.summary;
	const recovered = await recoverStaleAuditArtifacts(record, evidence);
	if (recovered === undefined) return record.summary;
	webLogger.warn(
		{
			findings: recovered.findingsCreated,
			reports: recovered.completedAudits.length,
			runId: record.id,
		},
		'Recovered audit artifacts from a stale run log',
	);
	const summary = appendRecoveredAgentResult(priorSummary, recovered.note);
	try {
		await withSqliteRetry(
			() =>
				db
					.update(runs)
					.set({ summary })
					.where(and(eq(runs.id, record.id), eq(runs.summary, record.summary ?? ''))),
			{ label: 'heartbeat.staleRecoveryNote' },
		);
	} catch (err) {
		webLogger.warn({ err, runId: record.id }, 'Failed to note recovered artifacts on the run');
		return record.summary;
	}
	return summary;
}
