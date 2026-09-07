import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';

import { asRunInitiator, type RunInitiator } from 'aidd-shared/metadata/active-runs';
import { eq } from 'drizzle-orm';
import { open, stat } from 'node:fs/promises';

import type { WebDatabase } from '../../db/client.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';

import { directorCycles } from '../../db/schema.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { HttpError } from '../errors.ts';
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
	/** Exclusive byte offset after the final returned byte. */
	endByte: number;
	/**
	 * Who caused the run this transcript belongs to, so an MCP agent reading output does not need
	 * a second call to tell whether a person asked for it. Null when the record has none
	 * recorded — never guessed from the surface it arrived through.
	 */
	initiator: null | RunInitiator;
	output: string;
	reason: null | string;
	/** Inclusive byte offset of the first returned byte. */
	startByte: number;
	state: RunOutputState;
	/** Size of the full transcript on disk in bytes, regardless of how much `output` carries. */
	totalBytes: number;
	/** True when `output` is only the trailing window of a transcript larger than the cap. */
	truncated: boolean;
	/** Maximum byte span accepted by one output request. */
	windowLimitBytes: number;
}

export interface RunOutputWindowRequest {
	endByte: number;
	startByte: number;
}

// A long run can stream a multi-megabyte transcript (17 MB observed in dogfooding). Returning the
// whole file means a full read + JSON transfer + client-side parse on every selection, and the
// browser then has to lay it out. Cap the response to the trailing window — the part an operator
// actually wants live — and report the true size so the UI can say what was trimmed. The render
// window in LiveConsole is smaller still, so 2 MiB leaves comfortable headroom for scrollback.
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const NO_LOG_PATH_REASON = 'No log path was recorded for this run.';

function validateWindow(totalBytes: number, window: RunOutputWindowRequest): void {
	const { endByte, startByte } = window;
	if (!Number.isSafeInteger(startByte) || !Number.isSafeInteger(endByte)) {
		throw new HttpError('Run output byte bounds must be safe integers.', 400);
	}
	if (startByte < 0 || endByte < 0 || startByte >= endByte) {
		throw new HttpError('Run output byte bounds must form a non-empty ascending range.', 400);
	}
	if (endByte > totalBytes) {
		throw new HttpError(
			`Run output byte range exceeds the ${totalBytes}-byte transcript.`,
			416,
		);
	}
	if (endByte - startByte > MAX_OUTPUT_BYTES) {
		throw new HttpError(
			`Run output byte range exceeds the ${MAX_OUTPUT_BYTES}-byte response limit.`,
			413,
		);
	}
}

function defaultWindow(totalBytes: number): RunOutputWindowRequest {
	return {
		endByte: totalBytes,
		startByte: Math.max(0, totalBytes - MAX_OUTPUT_BYTES),
	};
}

function emptyOutput(reason: null | string, state: RunOutputState): RunOutputResult {
	return {
		endByte: 0,
		initiator: null,
		output: '',
		reason,
		startByte: 0,
		state,
		totalBytes: 0,
		truncated: false,
		windowLimitBytes: MAX_OUTPUT_BYTES,
	};
}

async function readLogFile(
	logPath: string,
	id: string,
	requestedWindow?: RunOutputWindowRequest,
): Promise<RunOutputResult> {
	try {
		const totalBytes = (await stat(logPath)).size;
		if (requestedWindow) validateWindow(totalBytes, requestedWindow);
		if (totalBytes === 0) return emptyOutput(null, 'empty');
		const window = requestedWindow ?? defaultWindow(totalBytes);
		// Read only the requested bounded byte span. If either requested edge lands inside a line,
		// move it inward to the nearest newline. Paging from the returned endByte therefore remains
		// contiguous, and decoding can never begin halfway through a UTF-8 sequence.
		const handle = await open(logPath, 'r');
		try {
			const requestedBytes = window.endByte - window.startByte;
			const buffer = Buffer.allocUnsafe(requestedBytes);
			const { bytesRead } = await handle.read(buffer, 0, requestedBytes, window.startByte);
			let relativeStart = 0;
			let relativeEnd = bytesRead;
			if (window.startByte > 0) {
				const priorByte = Buffer.allocUnsafe(1);
				await handle.read(priorByte, 0, 1, window.startByte - 1);
				if (priorByte[0] !== 0x0a) {
					const firstNewline = buffer.indexOf(0x0a, 0);
					relativeStart = firstNewline === -1 ? bytesRead : firstNewline + 1;
				}
			}
			if (window.endByte < totalBytes && buffer[relativeEnd - 1] !== 0x0a) {
				const lastNewline = buffer.lastIndexOf(0x0a, relativeEnd - 1);
				relativeEnd = lastNewline < relativeStart ? relativeStart : lastNewline + 1;
			}
			if (relativeStart >= relativeEnd) {
				throw new HttpError('Requested run output range contains no complete line.', 416);
			}
			const startByte = window.startByte + relativeStart;
			const endByte = window.startByte + relativeEnd;
			const output = buffer.toString('utf8', relativeStart, relativeEnd);
			recordDataMovement({
				category: 'file',
				operation: 'run.output.read',
				status: 'hit',
				summary: { endByte, runId: id, startByte, totalBytes },
				target: logPath,
			});
			return {
				endByte,
				initiator: null,
				output,
				reason: null,
				startByte,
				state: 'ok',
				totalBytes,
				truncated: startByte > 0 || endByte < totalBytes,
				windowLimitBytes: MAX_OUTPUT_BYTES,
			};
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
			return emptyOutput(`Log file is missing on disk: ${logPath}`, 'unavailable');
		}
		throw err;
	}
}

function textOutput(output: string): RunOutputResult {
	const totalBytes = Buffer.byteLength(output);
	return {
		endByte: totalBytes,
		initiator: null,
		output,
		reason: null,
		startByte: 0,
		state: output.length === 0 ? 'empty' : 'ok',
		totalBytes,
		truncated: false,
		windowLimitBytes: MAX_OUTPUT_BYTES,
	};
}

// Every constructor above defaults `initiator` to null; the record that owns the transcript is
// only known at the chokepoints below, so they stamp the real value on the way out.
function withInitiator(result: RunOutputResult, initiator: null | RunInitiator): RunOutputResult {
	return { ...result, initiator };
}

async function readDirectorCycleOutput(
	ctx: OutputContext,
	id: string,
	window?: RunOutputWindowRequest,
): Promise<RunOutputResult | undefined> {
	const cycle = (
		await ctx.db.select().from(directorCycles).where(eq(directorCycles.id, id)).limit(1)
	)[0];
	if (!cycle) return undefined;
	return withInitiator(
		await directorCycleOutputBody(ctx, cycle, id, window),
		asRunInitiator(cycle.initiator),
	);
}

async function directorCycleOutputBody(
	ctx: OutputContext,
	cycle: typeof directorCycles.$inferSelect,
	id: string,
	window?: RunOutputWindowRequest,
): Promise<RunOutputResult> {
	const queryCtx = { config: ctx.config, db: ctx.db, hub: ctx.hub };
	const artifacts = directorCycleArtifacts(queryCtx, id);
	if (artifacts.outputExists) return readLogFile(artifacts.outputPath, id, window);
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
	return emptyOutput(`Director cycle ${id} completed without an output artifact.`, 'unavailable');
}

export async function readOutput(
	ctx: OutputContext,
	id: string,
	window?: RunOutputWindowRequest,
): Promise<RunOutputResult> {
	const run = await getRun(ctx.db, id);
	if (run?.logPath) {
		return withInitiator(
			await readLogFile(run.logPath, id, window),
			asRunInitiator(run.initiator),
		);
	}
	const cliRun = await findCliActiveRun(ctx, id);
	if (cliRun) {
		// A CLI-launched run has no DB row, but its active-run record carries the same logPath the
		// CLI heartbeat streams the transcript into (canReadOutput mirrors logPath !== null). Read
		// that file so a completed or in-flight CLI run shows its output; reserve the terminal
		// cli-only state for records that genuinely have no readable log.
		if (cliRun.logPath) {
			return withInitiator(await readLogFile(cliRun.logPath, id, window), cliRun.initiator);
		}
		return withInitiator(emptyOutput(NO_LOG_PATH_REASON, 'cli-only'), cliRun.initiator);
	}
	const directorOutput = await readDirectorCycleOutput(ctx, id, window);
	if (directorOutput) return directorOutput;
	return withInitiator(
		emptyOutput(run ? NO_LOG_PATH_REASON : `Run not found: ${id}`, 'unavailable'),
		run ? asRunInitiator(run.initiator) : null,
	);
}
