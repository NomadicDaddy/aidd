import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';

import { eq } from 'drizzle-orm';
import { open, readFile, stat } from 'node:fs/promises';

import type { WebDatabase } from '../../db/client.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';

import { directorCycles } from '../../db/schema.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { findCliActiveRun } from './cliActiveRuns.ts';
import { directorCycleArtifacts, directorCycleStage } from './directorCycleRuns.ts';
import { getRun } from './queries.ts';

interface OutputContext {
	config: { web: ResolvedWebConfig } & ResolvedConfig;
	db: WebDatabase;
	hub: WebSocketHub;
}

export type RunOutputState = 'cli-only' | 'empty' | 'ok' | 'unavailable';

export interface RunOutputResult {
	output: string;
	reason: null | string;
	state: RunOutputState;
	/** Size of the full transcript on disk in bytes, regardless of how much `output` carries. */
	totalBytes: number;
	/** True when `output` is only the trailing window of a transcript larger than the cap. */
	truncated: boolean;
}

// A long run can stream a multi-megabyte transcript (17 MB observed in dogfooding). Returning the
// whole file means a full read + JSON transfer + client-side parse on every selection, and the
// browser then has to lay it out. Cap the response to the trailing window — the part an operator
// actually wants live — and report the true size so the UI can say what was trimmed. The render
// window in LiveConsole is smaller still, so 2 MiB leaves comfortable headroom for scrollback.
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

async function readLogFile(logPath: string, id: string): Promise<RunOutputResult> {
	try {
		const totalBytes = (await stat(logPath)).size;
		if (totalBytes <= MAX_OUTPUT_BYTES) {
			const output = await readFile(logPath, 'utf8');
			recordDataMovement({
				category: 'file',
				operation: 'run.output.read',
				status: 'hit',
				summary: { bytes: output.length, runId: id },
				target: logPath,
			});
			return {
				output,
				reason: null,
				state: output.length === 0 ? 'empty' : 'ok',
				totalBytes,
				truncated: false,
			};
		}
		// Read only the trailing MAX_OUTPUT_BYTES. Decode from the first newline inside the window so
		// the visible head starts on a clean line boundary — which also sidesteps splitting a
		// multi-byte UTF-8 sequence, since every byte after an ASCII '\n' is a valid sequence start.
		const handle = await open(logPath, 'r');
		try {
			const buffer = Buffer.allocUnsafe(MAX_OUTPUT_BYTES);
			await handle.read(buffer, 0, MAX_OUTPUT_BYTES, totalBytes - MAX_OUTPUT_BYTES);
			const firstNewline = buffer.indexOf(0x0a);
			const output = buffer.toString('utf8', firstNewline === -1 ? 0 : firstNewline + 1);
			recordDataMovement({
				category: 'file',
				operation: 'run.output.read',
				status: 'hit',
				summary: { bytes: output.length, runId: id, totalBytes, truncated: true },
				target: logPath,
			});
			return { output, reason: null, state: 'ok', totalBytes, truncated: true };
		} finally {
			await handle.close();
		}
	} catch (err) {
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
			recordDataMovement({
				category: 'file',
				operation: 'run.output.read',
				status: 'miss',
				summary: { runId: id },
				target: logPath,
			});
			return {
				output: '',
				reason: `Log file is missing on disk: ${logPath}`,
				state: 'unavailable',
				totalBytes: 0,
				truncated: false,
			};
		}
		throw err;
	}
}

function textOutput(output: string): RunOutputResult {
	return {
		output,
		reason: null,
		state: output.length === 0 ? 'empty' : 'ok',
		totalBytes: Buffer.byteLength(output),
		truncated: false,
	};
}

async function readDirectorCycleOutput(
	ctx: OutputContext,
	id: string,
): Promise<RunOutputResult | undefined> {
	const cycle = (
		await ctx.db.select().from(directorCycles).where(eq(directorCycles.id, id)).limit(1)
	)[0];
	if (!cycle) return undefined;
	const queryCtx = { config: ctx.config, db: ctx.db, hub: ctx.hub };
	const artifacts = directorCycleArtifacts(queryCtx, id);
	if (artifacts.outputExists) return readLogFile(artifacts.outputPath, id);
	const stage = directorCycleStage(queryCtx, cycle).replaceAll('_', ' ');
	if (cycle.status === 'running') {
		return textOutput(
			`Director cycle ${id} is ${stage}.\nOutput artifact has not been written yet.`,
		);
	}
	if (cycle.status === 'failed') {
		return textOutput(
			cycle.failureReason ?? `Director cycle ${id} failed before writing output.`,
		);
	}
	return {
		output: '',
		reason: `Director cycle ${id} completed without an output artifact.`,
		state: 'unavailable',
		totalBytes: 0,
		truncated: false,
	};
}

export async function readOutput(ctx: OutputContext, id: string): Promise<RunOutputResult> {
	const run = await getRun(ctx.db, id);
	if (run?.logPath) {
		return readLogFile(run.logPath, id);
	}
	const cliRun = await findCliActiveRun(ctx, id);
	if (cliRun) {
		// A CLI-launched run has no DB row, but its active-run record carries the same logPath the
		// CLI heartbeat streams the transcript into (canReadOutput mirrors logPath !== null). Read
		// that file so a completed or in-flight CLI run shows its output; reserve the terminal
		// cli-only state for records that genuinely have no readable log.
		if (cliRun.logPath) {
			return readLogFile(cliRun.logPath, id);
		}
		return {
			output: '',
			reason: 'Live output is unavailable for CLI-launched runs.',
			state: 'cli-only',
			totalBytes: 0,
			truncated: false,
		};
	}
	const directorOutput = await readDirectorCycleOutput(ctx, id);
	if (directorOutput) return directorOutput;
	return {
		output: '',
		reason: run ? 'No log path was recorded for this run.' : `Run not found: ${id}`,
		state: 'unavailable',
		totalBytes: 0,
		truncated: false,
	};
}
