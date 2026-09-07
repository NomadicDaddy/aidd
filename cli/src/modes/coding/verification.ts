import type { AgentEvent } from 'aidd-shared/backends/types';
import type { AiddStore } from 'aidd-shared/metadata/store';
import type { SelectedWork } from 'aidd-shared/modes/types';

import { readFeatureIfPresent } from 'aidd-shared/metadata/store/read-optional';

export interface BlockedVerificationAdmission {
	excerpt: string;
	phrase: string;
}

// Admissions that the feature's designated live/runtime verification was blocked or skipped.
// These only run against a response that simultaneously claims completed/passes:true, and a match
// parks the feature as waiting_approval, so every pattern must be an unambiguous admission of
// "could not verify" — not general verification chatter. An agent that genuinely verified never
// needs these phrasings; one that could not must not claim passes:true (see the
// verification-blocked-should-park feature and the coding result contract's live-verification
// gate).
const blockedVerificationPatterns = [
	/\bverification (?:was|is|got) blocked\b/i,
	/\bverification (?:was |has been )?skipped\b/i,
	/\b(?:skipped|skipping) (?:the )?(?:live |browser |runtime |manual )?verification\b/i,
	/\b(?:live|browser|runtime|manual) verification could not\b/i,
	/\b(?:could not|couldn't|cannot|can't|unable to) (?:be )?(?:fully )?verif(?:y|ied)\b/i,
	/\bwas not verified\b/i,
	/\bcould not (?:be )?(?:run|executed) in[- ](?:this )?session\b/i,
	/\bmanual (?:browser |ui )?verification is (?:required|needed)\b/i,
	/\b(?:requires|needs) manual (?:browser |ui )?verification\b/i,
	/\bmust be verified manually\b/i,
	/\bhuman (?:should|must|needs to) verify\b/i,
];

/**
 * Scan the agent's own prose (assistant_text events only — never tool output or raw logs) for an
 * admission that the feature's live verification was blocked or skipped. Returns the matched
 * phrase plus its containing line as evidence, or undefined when the response makes no such
 * admission.
 *
 * Only the trailing assistant-only segment — prose after the final tool event — counts. An
 * admission followed by further tool work is a mid-run status the agent then acted on (fixed
 * the blocker, ran the verification); parking on it would reject genuinely verified work.
 * An admission with no tool work after it is the agent's final word on what never happened.
 */
export function detectBlockedVerificationAdmission(
	events: AgentEvent[],
): BlockedVerificationAdmission | undefined {
	let lastToolIndex = -1;
	for (let i = events.length - 1; i >= 0; i--) {
		const type = events[i]?.type;
		if (type === 'tool_call' || type === 'tool_result') {
			lastToolIndex = i;
			break;
		}
	}
	for (const event of events.slice(lastToolIndex + 1)) {
		if (event.type !== 'assistant_text') continue;
		for (const line of event.chunk.split('\n')) {
			for (const pattern of blockedVerificationPatterns) {
				const match = pattern.exec(line);
				if (match) {
					return {
						excerpt: line.trim().replace(/\s+/g, ' ').slice(0, 500),
						phrase: match[0],
					};
				}
			}
		}
	}
	return undefined;
}

/**
 * Route a completed/passes:true claim whose response admitted blocked live verification to
 * waiting_approval instead: "could not verify" is "not done", not "done with a caveat". The
 * admission is persisted as the feature's blockingContext so the decision queue (and the next
 * run's agent) sees exactly which verification never happened.
 *
 * Returns whether the park actually happened. It cannot when the record was deleted mid-iteration
 * by a concurrent run — there is nothing left to park — and the caller must report that rather
 * than claim a park that never landed.
 */
export async function parkBlockedVerificationFeature(
	store: AiddStore,
	featureId: string,
	admission: BlockedVerificationAdmission,
): Promise<boolean> {
	const feature = await readFeatureIfPresent(store, featureId);
	if (feature === undefined) return false;
	const parkedAt = new Date().toISOString();
	await store.writeFeature({
		...feature,
		blockingContext: {
			commands: [],
			outcomeStatus: 'verification_blocked_claimed_complete',
			outputExcerpt: admission.excerpt,
			parkedAt,
			reason: 'verification_blocked_claimed_complete',
		},
		passes: false,
		status: 'waiting_approval',
		updatedAt: parkedAt,
	});
	return true;
}

/** The selected feature's status as of work selection, read from the Feature that coding mode's
 * selectWork attaches as SelectedWork.data. This is the only record of what the feature looked like
 * before the agent touched it, and the park signal below is a transition, not a state. */
export function featureStatusAtSelection(work: SelectedWork | undefined): string | undefined {
	if (work?.kind !== 'feature' || typeof work.data !== 'object' || work.data === null) {
		return undefined;
	}
	const status = (work.data as { status?: unknown }).status;
	return typeof status === 'string' ? status : undefined;
}

/** The agent's last word, used as the parked feature's blockingContext excerpt so the decision
 * queue shows its own explanation of what could not be verified. */
export function trailingAgentExplanation(events: AgentEvent[]): string | undefined {
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i];
		if (event?.type !== 'assistant_text') continue;
		const text = event.chunk.trim().replace(/\s+/g, ' ');
		if (text) return text.slice(0, 500);
	}
	return undefined;
}

/**
 * The honest counterpart to parkBlockedVerificationFeature: the agent claimed no completion at
 * all, parked the selected feature itself, and (per the result contract's "do not emit the marker
 * for blocked work") emitted no AIDD_RESULT. Without this, that iteration is indistinguishable
 * from an agent that simply did nothing and lands on missing_aidd_result / exit 73 — punishing the
 * honest park harder than the dishonest claim above, which parks cleanly and lets the run continue.
 *
 * The signal is the TRANSITION into waiting_approval during this iteration, not the end state.
 * Reading the end state alone was wrong: `--feature <id>` re-dispatches an already-parked feature,
 * so "it is waiting_approval now" says nothing about what this iteration did, and a run that merely
 * re-examined parked work would launder itself into a park. Requiring an actionable status at
 * selection also means a no-op iteration cannot qualify — it leaves the status untouched.
 *
 * Deliberately does not consult the agent's prose. detectBlockedVerificationAdmission exists to
 * catch a *dishonest* claim, where the hedging vocabulary is narrow and predictable; an honest
 * park's phrasing is open-ended ("live CLS verification remains unavailable" matches none of those
 * patterns), so gating on it silently dropped real parks. The status transition is the fact.
 *
 * Records the blockingContext the decision queue reads. A fresh park always overwrites an older
 * one: keeping the previous context left the queue describing a stale blocker — a real run parked
 * for "localhost:3000 refused the DevTools connection", then a later run reproduced the failure
 * properly and parked for "CLS reproduced but no LayoutShift event captured", and the queue still
 * showed the first, a wrong-port problem that no longer existed. The context must describe the park
 * it belongs to.
 */
export async function recordVerificationSelfPark(
	store: AiddStore,
	featureId: string,
	statusAtSelection: string | undefined,
	explanation: string | undefined,
): Promise<boolean> {
	// Unknown prior status means no provable transition, so fail closed and report none.
	if (statusAtSelection === undefined || statusAtSelection === 'waiting_approval') return false;
	const feature = await readFeatureIfPresent(store, featureId);
	// Deleted mid-iteration by a concurrent run: no record, so no provable transition into a park.
	if (feature === undefined) return false;
	if (feature.status !== 'waiting_approval' || feature.passes === true) return false;
	const parkedAt = new Date().toISOString();
	await store.writeFeature({
		...feature,
		blockingContext: {
			commands: [],
			outcomeStatus: 'verification_blocked_self_parked',
			outputExcerpt: explanation ?? 'Agent parked the feature without a stated reason.',
			parkedAt,
			reason: 'verification_blocked_self_parked',
		},
		updatedAt: parkedAt,
	});
	return true;
}
