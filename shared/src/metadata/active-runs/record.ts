import { basename } from 'node:path';

import { backendNames, modeNames, type AiddMode, type BackendName } from '../../plan/types.ts';
import { parseAiddRunProvenance, type AiddRunProvenance } from '../../run-provenance.ts';
import { metadataPath, stopFilePath } from '../paths.ts';

export const ACTIVE_RUNS_DIR = 'active-runs';
export const CLI_ACTIVE_RUN_STALE_MS = 120_000;
// Atomic-write temp files older than this are assumed orphaned by a crashed/killed writer and are
// swept. The window is comfortably longer than any single write+rename so a temp belonging to a
// live concurrent writer (e.g. the web supervisor mid-write) is never removed out from under it.
export const ACTIVE_RUN_TEMP_STALE_MS = 60_000;
export const COMPLETED_RUN_TTL_MS = 86_400_000;
export const SUPPRESS_CLI_ACTIVE_RUN_ENV = 'AIDD_SUPPRESS_CLI_HEARTBEAT';
export const EXT_RUN_ID_ENV = 'AIDD_EXT_RUN_ID';
export const EXT_RUN_SOURCE_ENV = 'AIDD_EXT_RUN_SOURCE';
export const EXT_LOG_PATH_ENV = 'AIDD_EXT_LOG_PATH';
// Live URL of the launcher-managed app this run can verify against (e.g. the web panel that
// launched a web/dogfood run). Handed to the detached CLI so the prompt can tell the agent to
// reuse the already-running instance instead of bootstrapping its own server.
export const EXT_APP_URL_ENV = 'AIDD_EXT_APP_URL';

export const TERMINAL_STATES: ReadonlySet<string> = new Set([
	'blocked',
	'completed',
	'failed',
	'stopped',
	'waiting_approval',
]);

export type CliActiveRunSource = 'cli' | 'director' | 'web';

const SOURCE_VALUES: ReadonlySet<string> = new Set<CliActiveRunSource>(['cli', 'web', 'director']);

export interface CliActiveRunRecord extends AiddRunProvenance {
	aiSummary: null | string;
	backend: BackendName;
	cachedTokens: null | number;
	commandArgs: null | string[];
	completedAt: null | number;
	durationMs: null | number;
	exitCode: null | number;
	filesChanged: null | number;
	heartbeatAt: number;
	id: string;
	inputTokens: null | number;
	linesAdded: null | number;
	linesRemoved: null | number;
	logPath: null | string;
	mode: AiddMode;
	model: null | string;
	outputTokens: null | number;
	pid: null | number;
	projectName: string;
	projectPath: string;
	provider: null | string;
	reasoningEffort: null | string;
	reasoningTokens: null | number;
	source: CliActiveRunSource;
	startedAt: number;
	state: string;
	stopFile: string;
	stopReason: null | string;
	summary: null | string;
}

// Terminal-only output metrics: git diffstat over the run's attributed commits plus the run's
// token totals. Null until the final summary lands (and forever, for records written by older
// CLI versions — parsers must treat absence as null, never reject the record).
export const CLI_RUN_OUTPUT_METRIC_KEYS = [
	'cachedTokens',
	'filesChanged',
	'inputTokens',
	'linesAdded',
	'linesRemoved',
	'outputTokens',
	'reasoningTokens',
] as const satisfies readonly (keyof CliActiveRunRecord)[];

export type CliRunOutputMetricKey = (typeof CLI_RUN_OUTPUT_METRIC_KEYS)[number];

const backendNameSet = new Set<string>(backendNames);
const modeNameSet = new Set<string>(modeNames);

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isStringOrNull(value: unknown): value is null | string {
	return typeof value === 'string' || value === null;
}

export function parseCliActiveRunRecord(value: unknown): CliActiveRunRecord | undefined {
	if (!isObject(value)) return undefined;
	const aiddProvenance = parseAiddRunProvenance(value);
	if (!aiddProvenance) return undefined;
	const {
		aiSummary,
		backend,
		commandArgs,
		completedAt,
		durationMs,
		exitCode,
		heartbeatAt,
		id,
		logPath,
		mode,
		model,
		pid,
		projectName,
		projectPath,
		provider,
		reasoningEffort,
		source,
		startedAt,
		state,
		stopFile,
		stopReason,
		summary,
	} = value;
	if (typeof source !== 'string' || !SOURCE_VALUES.has(source)) return undefined;
	if (typeof backend !== 'string' || !backendNameSet.has(backend)) return undefined;
	if (!(completedAt === undefined || completedAt === null || isFiniteNumber(completedAt)))
		return undefined;
	if (!(durationMs === undefined || durationMs === null || isFiniteNumber(durationMs)))
		return undefined;
	if (!(exitCode === undefined || exitCode === null || isFiniteNumber(exitCode)))
		return undefined;
	if (!isFiniteNumber(heartbeatAt)) return undefined;
	if (typeof id !== 'string' || id.length === 0) return undefined;
	if (!(logPath === undefined || logPath === null || typeof logPath === 'string'))
		return undefined;
	if (typeof mode !== 'string' || !modeNameSet.has(mode)) return undefined;
	if (!isStringOrNull(model)) return undefined;
	if (!(pid === null || isFiniteNumber(pid))) return undefined;
	if (typeof projectName !== 'string' || projectName.length === 0) return undefined;
	if (typeof projectPath !== 'string' || projectPath.length === 0) return undefined;
	if (!(provider === undefined || provider === null || typeof provider === 'string')) {
		return undefined;
	}
	if (!(
		reasoningEffort === undefined ||
		reasoningEffort === null ||
		typeof reasoningEffort === 'string'
	)) {
		return undefined;
	}
	if (!isFiniteNumber(startedAt)) return undefined;
	if (typeof state !== 'string' || state.length === 0) return undefined;
	if (typeof stopFile !== 'string' || stopFile.length === 0) return undefined;
	if (!(stopReason === undefined || stopReason === null || typeof stopReason === 'string'))
		return undefined;
	if (!isStringOrNull(summary)) return undefined;
	// aiSummary is optional; absent values normalize to null below.
	if (aiSummary !== undefined && aiSummary !== null && typeof aiSummary !== 'string') {
		return undefined;
	}
	if (!(
		commandArgs === undefined ||
		commandArgs === null ||
		(Array.isArray(commandArgs) &&
			commandArgs.every((item): item is string => typeof item === 'string'))
	)) {
		return undefined;
	}
	// Output metrics are optional (records from older CLI versions omit them); a present value
	// must be a finite number or null.
	const outputMetrics: Partial<Record<CliRunOutputMetricKey, null | number>> = {};
	for (const key of CLI_RUN_OUTPUT_METRIC_KEYS) {
		const metric = value[key];
		if (!(metric === undefined || metric === null || isFiniteNumber(metric))) return undefined;
		outputMetrics[key] = metric ?? null;
	}
	return {
		...aiddProvenance,
		aiSummary: aiSummary ?? null,
		backend,
		commandArgs: commandArgs ? [...commandArgs] : null,
		completedAt: completedAt ?? null,
		durationMs: durationMs ?? null,
		exitCode: exitCode ?? null,
		heartbeatAt,
		id,
		logPath: logPath ?? null,
		mode,
		model,
		pid,
		projectName,
		projectPath,
		provider: provider ?? null,
		reasoningEffort: reasoningEffort ?? null,
		source: source as CliActiveRunSource,
		startedAt,
		state,
		stopFile,
		stopReason: stopReason ?? null,
		summary,
		...outputMetrics,
	} as CliActiveRunRecord;
}

export function assertRunIdFileSafe(id: string): string {
	if (
		id.length === 0 ||
		id !== basename(id) ||
		id.includes('/') ||
		id.includes('\\') ||
		id.includes('..')
	) {
		throw new Error(`Invalid active run id: ${id}`);
	}
	return id;
}

export function activeRunsDir(projectDir: string): string {
	return metadataPath(projectDir, ACTIVE_RUNS_DIR);
}

export function activeRunFilePath(projectDir: string, id: string): string {
	return metadataPath(projectDir, ACTIVE_RUNS_DIR, `${assertRunIdFileSafe(id)}.json`);
}

export function createCliActiveRunId(now = Date.now(), randomId = crypto.randomUUID()): string {
	return `cli_${now}_${randomId.replaceAll('-', '').slice(0, 8)}`;
}

export function isCliActiveRunSuppressed(env: NodeJS.ProcessEnv = process.env): boolean {
	return env[SUPPRESS_CLI_ACTIVE_RUN_ENV] === '1';
}

export function createCliActiveRunRecord(input: {
	aiddProvenance?: AiddRunProvenance;
	backend: BackendName;
	commandArgs?: null | readonly string[];
	id?: string;
	logPath?: null | string;
	mode: AiddMode;
	model: string | undefined;
	projectDir: string;
	provider: string | undefined;
	reasoningEffort: string;
	source?: CliActiveRunSource;
}): CliActiveRunRecord {
	const now = Date.now();
	const id = input.id ?? createCliActiveRunId(now);
	assertRunIdFileSafe(id);
	return {
		aiddDirty: input.aiddProvenance?.aiddDirty ?? null,
		aiddRevision: input.aiddProvenance?.aiddRevision ?? null,
		aiddVersion: input.aiddProvenance?.aiddVersion ?? null,
		aiSummary: null,
		backend: input.backend,
		cachedTokens: null,
		commandArgs: input.commandArgs ? [...input.commandArgs] : null,
		completedAt: null,
		durationMs: null,
		exitCode: null,
		filesChanged: null,
		heartbeatAt: now,
		id,
		inputTokens: null,
		linesAdded: null,
		linesRemoved: null,
		logPath: input.logPath ?? null,
		mode: input.mode,
		model: input.model ?? null,
		outputTokens: null,
		pid: typeof process.pid === 'number' ? process.pid : null,
		projectName: basename(input.projectDir),
		projectPath: input.projectDir,
		provider: input.provider ?? null,
		reasoningEffort: input.reasoningEffort,
		reasoningTokens: null,
		source: input.source ?? 'cli',
		startedAt: now,
		state: 'starting',
		stopFile: stopFilePath(input.projectDir),
		stopReason: null,
		summary: null,
	};
}

export function isCliRunTerminal(record: CliActiveRunRecord): boolean {
	return TERMINAL_STATES.has(record.state);
}
