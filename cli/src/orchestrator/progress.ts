import type { AgentEvent } from 'aidd-shared/backends/types';

export const defaultProgressHeartbeatMs = 30_000;

export interface ProgressReporterOptions {
	backend?: string;
	heartbeatMs?: number;
	iteration?: number;
	iterationStartedAtMs?: number;
	now?: () => number;
	runStartedAtMs: number;
	stagePrefix?: string;
	write?: (line: string) => void;
}

export interface ProgressStageOptions {
	activity?: boolean;
	backend?: string;
	force?: boolean;
	last?: string;
}

export class OrchestratorProgressReporter {
	private readonly heartbeatMs: number;
	private readonly iteration: number | undefined;
	private readonly iterationStartedAtMs: number | undefined;
	private readonly now: () => number;
	private readonly runStartedAtMs: number;
	private readonly stagePrefix: string | undefined;
	private readonly write: (line: string) => void;
	private backend: string | undefined;
	private lastActivityAtMs: number;
	private lastActivityLabel = 'none';
	private stage = 'starting';
	private timer: ReturnType<typeof setInterval> | undefined;

	constructor(options: ProgressReporterOptions) {
		this.backend = options.backend;
		this.heartbeatMs = options.heartbeatMs ?? defaultProgressHeartbeatMs;
		this.iteration = options.iteration;
		this.iterationStartedAtMs = options.iterationStartedAtMs;
		this.now = options.now ?? Date.now;
		this.runStartedAtMs = options.runStartedAtMs;
		this.stagePrefix = options.stagePrefix;
		this.write = options.write ?? ((line) => process.stdout.write(line));
		this.lastActivityAtMs = options.iterationStartedAtMs ?? options.runStartedAtMs;
	}

	start(): void {
		if (this.timer !== undefined || this.heartbeatMs <= 0) return;
		this.timer = setInterval(() => this.writeHeartbeat(), this.heartbeatMs);
		unrefTimer(this.timer);
	}

	stop(): void {
		if (this.timer === undefined) return;
		clearInterval(this.timer);
		this.timer = undefined;
	}

	setStage(stage: string, options: ProgressStageOptions = {}): void {
		const nextStage = this.formatStage(stage);
		const nextBackend = options.backend ?? this.backend;
		const nextLast = options.last ?? this.lastActivityLabel;
		const changed =
			this.stage !== nextStage ||
			this.backend !== nextBackend ||
			this.lastActivityLabel !== nextLast;
		this.stage = nextStage;
		this.backend = nextBackend;
		this.lastActivityLabel = nextLast;
		if (options.activity) this.lastActivityAtMs = this.now();
		if (changed || options.force) this.writeProgressLine();
	}

	recordAgentEvent(event: AgentEvent): void {
		switch (event.type) {
			case 'assistant_text':
				this.setStage('assistant_output', { activity: true, last: 'assistant text' });
				break;
			case 'done':
				this.setStage('backend_done', {
					activity: true,
					last: `backend done exit=${event.exitCode}`,
				});
				break;
			case 'error':
				this.setStage('backend_error', {
					activity: true,
					last: `error ${event.reason}`,
				});
				break;
			case 'idle_warning':
				this.setStage('idle_warning', {
					last: `idle warning after ${formatProgressDuration(event.afterMs)}`,
				});
				break;
			case 'rate_limit':
				this.setStage('rate_limit', { activity: true, last: 'rate_limit' });
				break;
			case 'raw_log':
				this.setStage('raw_log', { activity: true, last: `raw ${event.stream}` });
				break;
			case 'started':
				this.setStage('waiting_for_backend', {
					activity: true,
					backend: event.backend,
					last:
						event.pid === undefined
							? `backend ${event.backend} started`
							: `backend ${event.backend} started pid=${event.pid}`,
				});
				break;
			case 'tool_call':
				this.setStage('tool_call', {
					activity: true,
					last: `tool ${event.tool}${formatProgressArgs(event.args)}`,
				});
				break;
			case 'tool_result':
				this.setStage('tool_result', {
					activity: true,
					last: `tool_result ${event.tool}`,
				});
				break;
			case 'usage':
				this.setStage('usage', { activity: true, last: 'token usage' });
				break;
		}
	}

	writeHeartbeat(): void {
		this.writeProgressLine();
	}

	private formatStage(stage: string): string {
		return this.stagePrefix === undefined ? stage : `${this.stagePrefix}_${stage}`;
	}

	private writeProgressLine(): void {
		const nowMs = this.now();
		const fields = [formatProgressDuration(nowMs - this.runStartedAtMs)];
		if (this.iterationStartedAtMs !== undefined) {
			fields.push(
				this.iteration === undefined
					? `-- | ${formatProgressDuration(nowMs - this.iterationStartedAtMs)}`
					: `${(this.iteration + 1).toString().padStart(2, '0')} | ${formatProgressDuration(nowMs - this.iterationStartedAtMs)}`
			);
		} else if (this.iteration !== undefined) {
			fields.push(`${(this.iteration + 1).toString().padStart(2, '0')} | --:--:--`);
		}
		fields.push(formatProgressStage(this.stage));
		fields.push(`idle ${formatProgressDuration(nowMs - this.lastActivityAtMs)}`);
		fields.push(`last ${trimProgressValue(this.lastActivityLabel)}`);
		this.write(`[${formatProgressTimestamp(nowMs)}] | ${fields.join(' | ')}\n`);
	}
}

export function formatProgressDuration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remainder = seconds % 60;
	return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainder
		.toString()
		.padStart(2, '0')}`;
}

function formatProgressArgs(args: unknown): string {
	if (args === undefined || args === null) return '';
	if (typeof args === 'string') return ` "${trimProgressValue(args)}"`;
	if (typeof args !== 'object') return ` "${trimProgressValue(String(args))}"`;
	const record = args as Record<string, unknown>;
	for (const key of ['command', 'file_path', 'path', 'pattern', 'description']) {
		const value = record[key];
		if (typeof value === 'string') return ` "${trimProgressValue(value)}"`;
	}
	return '';
}

function trimProgressValue(value: string): string {
	const normalized = value.replace(/\s+/g, ' ').trim();
	return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function formatProgressStage(stage: string): string {
	return stage.replace(/_/g, ' ');
}

function formatProgressTimestamp(ms: number): string {
	const d = new Date(ms);
	return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}:${d.getUTCSeconds().toString().padStart(2, '0')}`;
}

function unrefTimer(timer: ReturnType<typeof setInterval>): void {
	const candidate = timer as { unref?: () => void };
	candidate.unref?.();
}
