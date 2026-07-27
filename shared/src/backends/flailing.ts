import type { AgentEvent } from './types.ts';

import { editToolPattern, writeToolPattern } from '../orchestrator/details/tool-args.ts';
import { digestResult, entryForToolCall, type WindowEntry } from './flailing-classify.ts';

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
	/**
	 * Trip a repeating signature whose results keep changing only after this many consecutive
	 * repeats — the backstop on the changing-output exemption below.
	 */
	variedRepeatTripThreshold: number;
	/** How many recent tool calls to keep for diagnostic-thrash detection. */
	windowSize: number;
}

export const defaultFlailingConfig: FlailingDetectorConfig = {
	diagnosticTripThreshold: 10,
	repeatTripThreshold: 5,
	variedRepeatTripThreshold: 25,
	windowSize: 14,
};

// How many consecutive flailing iterations to tolerate before stopping the run. The first trip only
// nudges (the next iteration is recompiled with a corrective note); a second consecutive trip parks
// the feature as waiting_approval and ends the run, rather than looping the nudge forever.
export const maxFlailIterations = 2;

// How many nudges a single run may spend. The nudge iteration is deliberately not charged against
// `--max-iterations` (a corrective retry is not productive work), so this cap — not the iteration
// budget — is what bounds it. Without the exemption a single-iteration run (every pipeline skill
// step launches with `--max-iterations 1`) dies on its first trip, never seeing the note the
// guardrail exists to deliver.
export const maxFlailNudgeGrants = 2;

export type FlailingReason = 'diagnostic_thrash' | 'repeated_action';

export type FlailingSignal =
	| { count: number; kind: 'trip' | 'warn'; reason: FlailingReason; signature: string }
	| { kind: 'none' };

export class FlailingDetector {
	private readonly config: FlailingDetectorConfig;
	private repeatCount = 0;
	private repeatResultDigests = new Set<string>();
	private repeatSignature: string | undefined;
	private warned = false;
	private window: WindowEntry[] = [];

	constructor(config: FlailingDetectorConfig = defaultFlailingConfig) {
		this.config = config;
	}

	/** Feed each agent event in order; returns whether this event pushes the run into flailing. */
	record(event: AgentEvent): FlailingSignal {
		// Results never trip anything themselves; they record what the current streak is producing
		// so a repeat with changing output can be told apart from one replaying a dead action.
		if (event.type === 'tool_result') {
			if (this.repeatSignature !== undefined) {
				this.repeatResultDigests.add(digestResult(event));
			}
			return { kind: 'none' };
		}
		if (event.type !== 'tool_call') return { kind: 'none' };
		// A file change is real progress — clear the window so prior churn is forgiven.
		if (editToolPattern.test(event.tool) || writeToolPattern.test(event.tool)) {
			this.resetStreak();
			this.window = [];
			this.warned = false;
			return { kind: 'none' };
		}
		const entry = entryForToolCall(event);
		if (entry.signature === this.repeatSignature) {
			this.repeatCount++;
		} else {
			this.resetStreak();
			this.repeatCount = 1;
			this.repeatSignature = entry.signature;
		}
		this.window.push(entry);
		if (this.window.length > this.config.windowSize) this.window.shift();

		const diagnosticCount = this.window.filter((e) => e.isDiagnostic).length;

		// A repeated call whose results keep changing is an agent observing a system in flux —
		// polling CI checks, tailing a build, watching a queue drain — not one replaying the same
		// dead action. Let it continue, bounded by variedRepeatTripThreshold so a poll that never
		// resolves still ends. Deliberately scoped to repeated_action: diagnostic thrash is judged
		// on a window of varied commands, and its output varies by nature (pids, timestamps).
		if (this.repeatCount >= this.config.repeatTripThreshold && !this.resultsAreVarying()) {
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

	private resetStreak(): void {
		this.repeatCount = 0;
		this.repeatResultDigests.clear();
		this.repeatSignature = undefined;
	}

	// True while the streak has produced more than one distinct result and has not yet exhausted
	// the varied-repeat allowance.
	private resultsAreVarying(): boolean {
		return (
			this.repeatResultDigests.size > 1 &&
			this.repeatCount < this.config.variedRepeatTripThreshold
		);
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
