import type { BackendName } from '../plan/types.ts';

/**
 * Provider rest: a resting backend is not started for new runs until its rest ends. Runs already
 * going are never switched mid-run; rest is decided once, when a launch picks its backend.
 *
 * Who chose the backend decides what a rest does to the launch. A person who picked it for this
 * launch is refused, because quietly overriding a deliberate choice is the failure rest must not
 * cause. A default or standing configuration (a schedule's or recipe step's launch target, the
 * Director's automatic cycle) substitutes instead: nobody is there to answer a refusal, so refusing
 * would silently skip that work. In the 30 days before this existed, 478 of 571 runs named a
 * backend other than the configured default, so refusing every named backend would have refused
 * almost every launch during a rest.
 */

export type ProviderRestSource = 'manual' | 'rate_limit';

export interface ProviderRest {
	backend: BackendName;
	reason: string;
	/** ISO timestamp the rest was written. */
	setAt: string;
	source: ProviderRestSource;
	/** ISO timestamp the rest ends; a rest at or before now is over. */
	until: string;
}

/**
 * The backends a rate limit may rest on its own: the subscription CLIs, whose plan limits report a
 * reset time. The pay-per-token and local backends (native, openai, ollama, lmstudio) rest only
 * when a person rests them.
 */
export const AUTO_REST_BACKENDS: readonly BackendName[] = ['claude-code', 'codex', 'grok'];

/**
 * Where a launch goes when its backend rests, most used first: codex and claude-code carried nearly
 * every run in the 30 days measured, and native is the local fallback. `providerRestSubstitutes`
 * in config replaces it.
 */
export const DEFAULT_PROVIDER_REST_SUBSTITUTES: readonly BackendName[] = [
	'codex',
	'claude-code',
	'native',
];

export interface RestDecisionInput {
	/** Skip rest entirely: the person chose "run anyway", or a launcher already decided. */
	ignoreRest: boolean;
	now: Date;
	/** True only when a person picked `requested` for this very launch. */
	personPicked: boolean;
	requested: BackendName;
	rests: readonly ProviderRest[];
	substitutes: readonly BackendName[];
}

export interface RestSubstitution {
	from: BackendName;
	note: string;
	rest: ProviderRest;
}

export type RestDecision =
	| {
			/** Where a person can go instead: the first substitute not resting, if any. */
			alternative: BackendName | undefined;
			kind: 'refuse';
			message: string;
			rest: ProviderRest;
	  }
	| { backend: BackendName; kind: 'run'; substitution?: RestSubstitution };

export function activeRests(rests: readonly ProviderRest[], now: Date): ProviderRest[] {
	const out: ProviderRest[] = [];
	for (const rest of rests) {
		if (Date.parse(rest.until) > now.getTime()) out.push(rest);
	}
	return out;
}

function pad(value: number): string {
	return value < 10 ? `0${value}` : String(value);
}

// Templates below interpolate plain variables only, never calls: Bun 1.4 on Windows has crashed
// on expressions nested in template substitutions.

/** Local wall-clock end time; the date is added only when the rest does not end today. */
export function formatRestUntil(until: string, now: Date): string {
	const end = new Date(until);
	const hours = pad(end.getHours());
	const minutes = pad(end.getMinutes());
	const time = `${hours}:${minutes}`;
	if (end.toDateString() === now.toDateString()) return time;
	const year = String(end.getFullYear());
	const month = pad(end.getMonth() + 1);
	const day = pad(end.getDate());
	return `${year}-${month}-${day} ${time}`;
}

function describe(rest: ProviderRest, now: Date): string {
	const reason = rest.reason.trim();
	const suffix = reason.length > 0 ? ` (${reason})` : '';
	const until = formatRestUntil(rest.until, now);
	return `resting until ${until}${suffix}`;
}

function firstAvailable(
	substitutes: readonly BackendName[],
	skip: BackendName,
	resting: ReadonlyMap<BackendName, ProviderRest>,
): BackendName | undefined {
	for (const candidate of substitutes) {
		if (candidate !== skip && !resting.has(candidate)) return candidate;
	}
	return undefined;
}

export function decideRestedBackend(input: RestDecisionInput): RestDecision {
	const run = { backend: input.requested, kind: 'run' } as const;
	if (input.ignoreRest) return run;
	const resting = new Map<BackendName, ProviderRest>();
	for (const rest of activeRests(input.rests, input.now)) resting.set(rest.backend, rest);
	const rest = resting.get(input.requested);
	if (rest === undefined) return run;

	const alternative = firstAvailable(input.substitutes, input.requested, resting);
	const requested = input.requested;
	const restText = describe(rest, input.now);
	if (input.personPicked) {
		return { alternative, kind: 'refuse', message: `${requested} is ${restText}`, rest };
	}
	if (alternative === undefined) {
		// Everything that could take the launch is resting: name the rest that ends first, since
		// that is when the launch could next succeed.
		let earliest = rest;
		for (const candidate of input.substitutes) {
			const other = resting.get(candidate);
			if (other !== undefined && Date.parse(other.until) < Date.parse(earliest.until)) {
				earliest = other;
			}
		}
		const ends = formatRestUntil(earliest.until, input.now);
		const first = earliest.backend;
		return {
			alternative: undefined,
			kind: 'refuse',
			message: `${requested} and every substitute are resting; the first rest ends at ${ends} (${first})`,
			rest: earliest,
		};
	}
	return {
		backend: alternative,
		kind: 'run',
		substitution: {
			from: requested,
			note: `${alternative}, substituted for ${requested}: ${restText}`,
			rest,
		},
	};
}
