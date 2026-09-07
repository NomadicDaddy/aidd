import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';

import {
	isCliRunTerminal,
	readCliActiveRunRecords,
	removeCliActiveRunRecord,
} from 'aidd-shared/metadata/active-runs';
import { resolve } from 'node:path';

import type { WebDatabase } from '../../db/client.ts';
import type { DbCommands, HeartbeatWriteOutcome } from '../../db/commands.ts';
import type { WebRunStatus } from '../../types.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { webLogger } from '../../logger.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { scanCliActiveRunProjectDirs } from './cliActiveRuns.ts';
import { resolveHeartbeatContinuationValue } from './continuation.ts';

interface IngestContext {
	commands: DbCommands;
	config: { web: ResolvedWebConfig } & ResolvedConfig;
	db: WebDatabase;
	onProjectChanged?: (projectPath: string) => void;
}

export async function ingestCompletedCliRuns(ctx: IngestContext): Promise<number> {
	const projectDirs = new Set<string>();
	await Promise.all(
		ctx.config.web.allowedRoots.map(async (root) => {
			for (const projectDir of await scanCliActiveRunProjectDirs(
				root,
				ctx.config.web.ignoredFolders,
			)) {
				projectDirs.add(resolve(projectDir));
			}
		}),
	);
	let ingested = 0;
	for (const projectDir of projectDirs) {
		const records = await readCliActiveRunRecords(projectDir, {
			includeCompleted: true,
		}).catch((error: unknown) => {
			webLogger.warn({ error, projectDir }, 'Failed to read CLI runs for ingestion');
			return [];
		});
		for (const record of records) {
			if (!isCliRunTerminal(record)) continue;
			// Route every terminal CLI record through the same atomic terminalizeRun command the
			// HeartbeatWatcher uses. It inserts a brand-new row for a direct-CLI run the web never
			// tracked, drives an existing non-terminal row (a finished run still marked `running`)
			// to its terminal status, or no-ops when the row is already terminal. Terminalize before
			// deleting the heartbeat so HeartbeatWatcher never loses the evidence needed to update a row.
			const completedAt = record.completedAt ?? Date.now();
			const durationMs = record.durationMs ?? completedAt - record.startedAt;
			const finalStatus: WebRunStatus =
				record.state === 'completed'
					? 'completed'
					: record.state === 'stopped'
						? 'stopped'
						: 'failed';
			// Persist continuation eligibility for runs that finished while the panel was down so
			// the Continue affordance still surfaces. Ingest never auto-chains — a boot-time launch
			// burst would be surprising; the opt-in auto path is reserved for live terminalization.
			const continuationValue = await resolveHeartbeatContinuationValue(record, finalStatus);
			let outcome: HeartbeatWriteOutcome;
			try {
				outcome = await withSqliteRetry(
					() =>
						ctx.commands.terminalizeRun({
							completedAt,
							continuationValue,
							durationMs,
							finalStatus,
							record,
						}),
					{ label: 'run.ingestCli.terminalize' },
				);
			} catch (err) {
				// Leave the heartbeat file in place so a later sweep retries rather than dropping
				// the terminal signal on a transient lock failure.
				webLogger.warn({ err, runId: record.id }, 'Failed to ingest completed CLI run');
				continue;
			}
			if (outcome.kind !== 'already-terminal') {
				recordDataMovement({
					category: 'database',
					operation: 'run.ingest_cli',
					status: 'success',
					summary: { runId: record.id, state: record.state },
					target: 'runs',
				});
				if (record.mode === 'audit') {
					ctx.onProjectChanged?.(record.projectPath);
				}
				ingested++;
			}
			await removeCliActiveRunRecord(projectDir, record.id).catch(() => {});
		}
	}
	if (ingested > 0) {
		webLogger.info({ count: ingested }, 'Ingested completed CLI runs into database');
	}
	return ingested;
}
