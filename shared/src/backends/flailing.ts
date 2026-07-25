import type { AgentEvent } from './types.ts';

import {
	bashToolPattern,
	commandFromArgs,
	editToolPattern,
	writeToolPattern,
} from '../orchestrator/details/tool-args.ts';

// Detects an agent stuck in a non-productive loop — consecutively repeating the same tool call, or
// thrashing on server-diagnostic/lifecycle shell commands (curl/ps/lsof/start:web ...) — without
// making any file changes. This is the "confused model burns 20 minutes hunting for a server"
// failure mode: the agent emits events continuously, so the idle timeout never fires, yet no real
// progress happens. A different tool call breaks the repeated-action streak, while a file
// edit/write resets all detection state. This allows legitimate observe-act-observe workflows
// (such as browser snapshots around clicks) without weakening diagnostic-thrash detection.

export interface FlailingDetectorConfig {
	/** Trip when at least this many diagnostic/lifecycle shell commands occur in the window. */
	diagnosticTripThreshold: number;
	/** Trip when one normalized tool-call signature repeats consecutively this many times. */
	repeatTripThreshold: number;
	/** How many recent tool calls to keep for diagnostic-thrash detection. */
	windowSize: number;
}

export const defaultFlailingConfig: FlailingDetectorConfig = {
	diagnosticTripThreshold: 10,
	repeatTripThreshold: 5,
	windowSize: 14,
};

// How many consecutive flailing iterations to tolerate before stopping the run. The first trip only
// nudges (the next iteration is recompiled with a corrective note); a second consecutive trip parks
// the feature as waiting_approval and ends the run, rather than looping the nudge forever.
export const maxFlailIterations = 2;

export type FlailingReason = 'diagnostic_thrash' | 'repeated_action';

export type FlailingSignal =
	| { count: number; kind: 'trip' | 'warn'; reason: FlailingReason; signature: string }
	| { kind: 'none' };

// Program tokens that, when a shell command leads with them and changes no files, indicate the agent
// is probing for / starting / killing a server rather than doing productive work.
const diagnosticVerbs: ReadonlySet<string> = new Set([
	'curl',
	'get-nettcpconnection',
	'get-process',
	'kill',
	'lsof',
	'nc',
	'ncat',
	'netstat',
	'ping',
	'pkill',
	'ps',
	'sleep',
	'ss',
	'start-process',
	'taskkill',
	'tasklist',
	'telnet',
	'timeout',
	'wget',
	'where',
	'whereis',
	'which',
]);

const lifecycleRunPattern =
	/\b(?:bun|bunx|npm|pnpm|yarn)(?:\.exe)?\s+run\s+(?:start|start:web|stop|dev|smoke:dev|smoke:preview)\b/i;

function leadingProgram(command: string): string {
	const trimmed = command.trim();
	if (lifecycleRunPattern.test(trimmed)) return 'lifecycle';
	// Drop leading `sudo` and `FOO=bar` env assignments, then take the first token's basename.
	const tokens = trimmed.split(/\s+/).filter((token) => token !== 'sudo' && !token.includes('='));
	const first = tokens[0] ?? '';
	const base = first.split(/[\\/]/).pop() ?? first;
	return base.replace(/\.(?:exe|cmd|bat|ps1)$/i, '').toLowerCase();
}

interface WindowEntry {
	isDiagnostic: boolean;
	signature: string;
}

function entryForToolCall(event: Extract<AgentEvent, { type: 'tool_call' }>): WindowEntry {
	if (bashToolPattern.test(event.tool)) {
		const command = commandFromArgs(event.args) ?? '';
		const normalized = command.trim().replace(/\s+/g, ' ').toLowerCase();
		const program = leadingProgram(command);
		return {
			isDiagnostic: program === 'lifecycle' || diagnosticVerbs.has(program),
			signature: `bash:${normalized}`,
		};
	}
	let argsKey: string;
	try {
		argsKey = JSON.stringify(event.args)?.slice(0, 200) ?? '';
	} catch {
		argsKey = '';
	}
	return { isDiagnostic: false, signature: `${event.tool.toLowerCase()}:${argsKey}` };
}

export class FlailingDetector {
	private readonly config: FlailingDetectorConfig;
	private repeatCount = 0;
	private repeatSignature: string | undefined;
	private warned = false;
	private window: WindowEntry[] = [];

	constructor(config: FlailingDetectorConfig = defaultFlailingConfig) {
		this.config = config;
	}

	/** Feed each agent event in order; returns whether this event pushes the run into flailing. */
	record(event: AgentEvent): FlailingSignal {
		if (event.type !== 'tool_call') return { kind: 'none' };
		// A file change is real progress — clear the window so prior churn is forgiven.
		if (editToolPattern.test(event.tool) || writeToolPattern.test(event.tool)) {
			this.repeatCount = 0;
			this.repeatSignature = undefined;
			this.window = [];
			this.warned = false;
			return { kind: 'none' };
		}
		const entry = entryForToolCall(event);
		if (entry.signature === this.repeatSignature) {
			this.repeatCount++;
		} else {
			this.repeatCount = 1;
			this.repeatSignature = entry.signature;
		}
		this.window.push(entry);
		if (this.window.length > this.config.windowSize) this.window.shift();

		const diagnosticCount = this.window.filter((e) => e.isDiagnostic).length;

		if (this.repeatCount >= this.config.repeatTripThreshold) {
			return {
				count: this.repeatCount,
				kind: 'trip',
				reason: 'repeated_action',
				signature: entry.signature,
			};
		}
		if (entry.isDiagnostic && diagnosticCount >= this.config.diagnosticTripThreshold) {
			return {
				count: diagnosticCount,
				kind: 'trip',
				reason: 'diagnostic_thrash',
				signature: entry.signature,
			};
		}
		if (!this.warned) {
			const repeatWarn = Math.max(2, this.config.repeatTripThreshold - 2);
			const diagnosticWarn = Math.max(3, this.config.diagnosticTripThreshold - 3);
			if (this.repeatCount >= repeatWarn) {
				this.warned = true;
				return {
					count: this.repeatCount,
					kind: 'warn',
					reason: 'repeated_action',
					signature: entry.signature,
				};
			}
			if (entry.isDiagnostic && diagnosticCount >= diagnosticWarn) {
				this.warned = true;
				return {
					count: diagnosticCount,
					kind: 'warn',
					reason: 'diagnostic_thrash',
					signature: entry.signature,
				};
			}
		}
		return { kind: 'none' };
	}
}

const FLAILING_DISABLE_ENV = 'AIDD_DISABLE_FLAILING_GUARD';

export function isFlailingGuardDisabled(
	env: Record<string, string | undefined> = process.env,
): boolean {
	const value = env[FLAILING_DISABLE_ENV];
	return value === '1' || value?.toLowerCase() === 'true';
}

export function formatFlailingSignature(signature: string): string {
	const trimmed = signature.length > 80 ? `${signature.slice(0, 77)}...` : signature;
	return trimmed;
}
