import type { PersistedReasoningEffortValue } from 'aidd-shared/args/constants';

export interface DirectAiReasoningEffortInputs {
	directAiEffort: PersistedReasoningEffortValue | undefined;
	fallbackEffort: PersistedReasoningEffortValue;
	providerEffort: PersistedReasoningEffortValue | undefined;
	requestEffort: PersistedReasoningEffortValue | undefined;
}

export function resolveDirectAiReasoningEffort(
	inputs: DirectAiReasoningEffortInputs
): PersistedReasoningEffortValue {
	return (
		inputs.requestEffort ??
		inputs.directAiEffort ??
		inputs.providerEffort ??
		inputs.fallbackEffort
	);
}

export function extractJsonObject(text: string): null | unknown {
	// Models were told to return a bare JSON object, but some wrap it in a ```json
	// fence and some prepend reasoning prose. Try, in order: a fenced block, the
	// whole trimmed response, then the span from the FIRST '{' to the last '}'.
	const candidates: string[] = [];
	const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
	if (fenced?.[1]) candidates.push(fenced[1].trim());
	const trimmed = text.trim();
	if (trimmed) candidates.push(trimmed);
	const firstOpen = text.indexOf('{');
	const lastClose = text.lastIndexOf('}');
	if (firstOpen !== -1 && lastClose > firstOpen) {
		candidates.push(text.slice(firstOpen, lastClose + 1));
	}
	for (const candidate of candidates) {
		try {
			return JSON.parse(candidate);
		} catch {
			// Try the next likely JSON block.
		}
	}
	return null;
}
