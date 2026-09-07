const terminalSentencePattern = /[.!?…](?:['’"”)\]}]+)?$/u;
const runAiSummaryMaxLength = 400;

/** Mark a persisted run narrative that ends mid-sentence as visibly incomplete. */
export function formatRunNarrative(value: string): string {
	const trimmed = value.trimEnd();
	if (trimmed.length < runAiSummaryMaxLength || terminalSentencePattern.test(trimmed)) {
		return trimmed;
	}
	return `${trimmed}…`;
}
