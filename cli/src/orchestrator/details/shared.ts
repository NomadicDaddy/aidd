import type { AgentEvent } from 'aidd-shared/backends/types';

export function eventTextForClassification(event: AgentEvent): string | undefined {
	if (event.type === 'tool_result') {
		return typeof event.result === 'string' ? event.result : JSON.stringify(event.result);
	}
	if (event.type === 'error') {
		return typeof event.meta === 'string' ? event.meta : JSON.stringify(event.meta ?? '');
	}
	if (event.type === 'assistant_text') return event.chunk;
	return undefined;
}

export function isAskUserQuestionEvent(event: AgentEvent): boolean {
	return event.type === 'tool_call' && /askuserquestion/i.test(event.tool);
}

// Only the native loop has an AskUserQuestion tool. A CLI backend with no such tool asks in prose
// and ends its turn, so isAskUserQuestionEvent never matches and the run records `completed` — a
// real skill run stopped at "Please choose: 1. … 2. … 3." with its deliverable untouched and still
// reported "finished with exit code 0". These patterns are the imperative forms of handing the
// decision back, which an agent that is still working has no reason to write.
const userDecisionRequestPatterns = [
	/\bplease (?:choose|confirm|decide|advise|specify|clarify|pick)\b/i,
	// "let me know which option" hands the decision back; bare "let me know if you want…" is how an
	// agent signs off *after* finishing, and matching it parked completed work as blocked.
	/\b(?:let me know|tell me) which\b/i,
	/\bwhich (?:option|approach|one) (?:would you|do you) (?:prefer|want)\b/i,
	/\bwaiting (?:on|for) (?:your|a human) (?:decision|input|choice|confirmation)\b/i,
	/\bneed(?:s)? (?:your|a human) (?:decision|input|confirmation|approval) (?:to|before)\b/i,
	// A skill that gates its writes ends by naming the phrase that unblocks it: "Phase 5 requires
	// approval before writing. Reply `apply everything` to approve…". Neither form matched the
	// patterns above, and the run reported `completed` with nothing written.
	/\brequires? approval before\b/i,
	/\breply\b[^.\n]{0,80}\bto (?:approve|confirm|proceed|continue)\b/i,
];

/**
 * Whether the agent's closing prose hands a decision back to the operator.
 *
 * Scoped to the trailing assistant-only segment — prose after the final tool event — for the same
 * reason the blocked-verification detector is: a question mid-run is one the agent then answered
 * itself by doing the work, while a question with no tool work after it is where the turn actually
 * stopped. Deliberately narrow; a false positive parks a run that was merely being conversational.
 */
export function asksUserDecisionInProse(events: AgentEvent[]): boolean {
	let lastToolIndex = -1;
	for (let i = events.length - 1; i >= 0; i--) {
		const type = events[i]?.type;
		if (type === 'tool_call' || type === 'tool_result') {
			lastToolIndex = i;
			break;
		}
	}
	return events.slice(lastToolIndex + 1).some((event) => {
		if (event.type !== 'assistant_text') return false;
		return userDecisionRequestPatterns.some((pattern) => pattern.test(event.chunk));
	});
}

export function uniqueOrdered(values: Iterable<string>): string[] {
	return [...new Set(values)];
}
