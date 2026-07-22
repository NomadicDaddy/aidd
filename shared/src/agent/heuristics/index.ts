import { extractMalformedResultMarker, hasParseableResult } from '../result-marker.ts';

export interface AgentHeuristicState {
	consecutiveBashCalls: number;
	continuationNudges: number;
	hallucinationNudges: number;
	stuckNudges: number;
}

export type AgentHeuristicMode = 'default' | 'planning';

export interface AgentHeuristicOptions {
	mode?: AgentHeuristicMode;
}

export type AgentHeuristicResult =
	| { action: 'abort'; reason: string }
	| { action: 'complete' }
	| { action: 'nudge'; prompt: string; reason: string; state: AgentHeuristicState };

const maxContinuationNudges = 3;
const maxHallucinationNudges = 2;
const maxStuckNudges = 2;
const stuckInvestigatingThreshold = 25;

// Re-emit prompt for a brace-balanced but unparseable AIDD_RESULT marker. The agent signalled
// completion with a placeholder body instead of the real JSON; this asks for the complete,
// valid object while the turn's context is still live, before the backend exits with no result.
// Deliberately mode-agnostic: this fires for every mode, and each mode's result contract
// defines its own fields (coding: featureId/status/passes; audit: reportMarkdown/findings;
// planning: planMarkdown). Naming any one mode's fields here would instruct the others to
// emit fields their contract does not have.
const malformedResultMarkerNudge =
	'The final AIDD_RESULT marker you emitted was malformed: it looked like a placeholder ' +
	'(for example `{ ... }` or `{ … }`) or was not valid JSON, so it could not be parsed. ' +
	'Re-emit the marker now as a single complete, valid JSON object with the real contents for ' +
	'this run — every field your result contract requires, in full, with no field elided or ' +
	'summarized. Do not use ellipses, placeholders, or abbreviations. Emit the corrected ' +
	'marker; nothing else is required.';

export function initialHeuristicState(): AgentHeuristicState {
	return {
		consecutiveBashCalls: 0,
		continuationNudges: 0,
		hallucinationNudges: 0,
		stuckNudges: 0,
	};
}

export function afterToolCalls(
	state: AgentHeuristicState,
	toolNames: string[]
): { nudge?: AgentHeuristicResult; state: AgentHeuristicState } {
	let consecutiveBashCalls = state.consecutiveBashCalls;
	for (const toolName of toolNames) {
		if (toolName === 'bash') {
			consecutiveBashCalls++;
		} else if (
			toolName === 'read_file' ||
			toolName === 'edit_file' ||
			toolName === 'write_file'
		) {
			consecutiveBashCalls = 0;
		}
	}
	const next = { ...state, consecutiveBashCalls };
	if (consecutiveBashCalls >= stuckInvestigatingThreshold && state.stuckNudges < maxStuckNudges) {
		const nudged = {
			...next,
			consecutiveBashCalls: 0,
			stuckNudges: state.stuckNudges + 1,
		};
		return {
			nudge: {
				action: 'nudge',
				prompt:
					`You have made ${consecutiveBashCalls} consecutive bash calls without reading or editing any files. ` +
					'This is the stuck investigating pattern. Stop probing shell or PATH issues. Run the equivalent individual checks, note one concise status line if needed, and continue with the feature work using read_file, edit_file, or write_file next.',
				reason: 'stuck_investigating',
				state: nudged,
			},
			state: nudged,
		};
	}
	return { state: next };
}

export function evaluateTextOnlyResponse(
	content: string,
	state: AgentHeuristicState,
	options: AgentHeuristicOptions = {}
): AgentHeuristicResult {
	// A fully-formed AIDD_RESULT block is the protocol's explicit completion
	// signal. Once it parses, the response is the deliverable — never nudge it
	// as incomplete or hallucinated just because report content happens to
	// contain phrases like "remaining" or "generated audit report". A truncated
	// result fails to parse and falls through to the continuation nudge below.
	if (hasParseableResult(content)) {
		return { action: 'complete' };
	}

	// The agent emitted an AIDD_RESULT-shaped marker (the braces balanced) but the body was not
	// valid JSON — typically a placeholder like `AIDD_RESULT: { … }`. It signalled completion yet
	// delivered nothing parseable, so without intervention the turn ends "complete" with no result
	// and the whole run is discarded. Nudge a re-emit while the turn's context is still live,
	// reusing the bounded continuation budget.
	if (extractMalformedResultMarker(content) && state.continuationNudges < maxContinuationNudges) {
		const next = {
			...state,
			continuationNudges: state.continuationNudges + 1,
		};
		return {
			action: 'nudge',
			prompt: malformedResultMarkerNudge,
			reason: 'malformed_result_marker',
			state: next,
		};
	}

	if (detectsDegeneration(content)) {
		return { action: 'abort', reason: 'degenerate_output' };
	}

	const hallucinationType = detectsHallucinatedActions(content);
	if (hallucinationType && state.hallucinationNudges < maxHallucinationNudges) {
		const next = {
			...state,
			hallucinationNudges: state.hallucinationNudges + 1,
		};
		return {
			action: 'nudge',
			prompt:
				options.mode === 'planning'
					? 'CRITICAL ERROR: This is a read-only Triumvirate planning stage. Do not edit files, run formatters, update metadata, or commit. Return only a concrete plan using AIDD_RESULT: {"planMarkdown":"..."} and leave execution to the execution stage.'
					: 'CRITICAL ERROR: You described creating files, committing changes, or showed tool results, but you did not actually call any tools. Text descriptions do not execute actions. Use write_file, edit_file, bash, or the appropriate tool to perform the work.',
			reason: hallucinationType,
			state: next,
		};
	}
	if (hallucinationType) {
		return { action: 'abort', reason: hallucinationType };
	}

	if (looksIncomplete(content) && state.continuationNudges < maxContinuationNudges) {
		const next = {
			...state,
			continuationNudges: state.continuationNudges + 1,
		};
		return {
			action: 'nudge',
			prompt:
				options.mode === 'planning'
					? 'You are still in a read-only Triumvirate planning stage. Do not execute the plan and do not modify files. Finish by returning exactly one AIDD_RESULT: {"planMarkdown":"<your actionable plan as markdown>"} marker.'
					: 'You stopped before completing the task. Continue where you left off. Use tools to complete the remaining work. Do not summarize the plan; perform the next concrete action.',
			reason: 'incomplete_response',
			state: next,
		};
	}

	return { action: 'complete' };
}

function looksIncomplete(content: string): boolean {
	const lower = content.toLowerCase();
	return [
		'let me continue',
		'let me now',
		'next, i',
		'i will now',
		'i need to',
		'moving on to',
		'now let me',
		'let me create',
		'let me also',
		'i should also',
		'remaining',
		'still need to',
		'continue with',
		'let me proceed',
		'let me check',
		'let me examine',
		'let me look',
		'let me scan',
		'let me review',
	].some((signal) => lower.includes(signal));
}

function detectsHallucinatedActions(content: string): null | string {
	const lower = content.toLowerCase();
	const fakeToolOutput = [
		'[result]',
		'[exit code:',
		'[commit ',
		'created 10 feature',
		'created feature',
		'creating feature directory',
		'feature.json file:',
		'committing audit',
		'updating changelog',
	];
	const fakeToolCount = fakeToolOutput.filter((signal) => lower.includes(signal)).length;
	if (fakeToolCount >= 2) return 'hallucinated_tool_results';

	if (
		[
			'batch 1:',
			'batch 2:',
			'creating feature directory:',
			'created 10 ',
			'created audit report',
			'generated audit report',
		].some((signal) => lower.includes(signal))
	) {
		return 'hallucinated_file_creation';
	}

	return null;
}

function detectsDegeneration(content: string): boolean {
	const lines = content.split('\n').filter((line) => line.trim().length > 20);
	if (lines.length < 10) return false;

	const frequencies = new Map<string, number>();
	for (const line of lines) {
		const trimmed = line.trim();
		frequencies.set(trimmed, (frequencies.get(trimmed) ?? 0) + 1);
	}

	for (const [line, count] of frequencies) {
		if (count >= 5 && line.length > 30) return true;
	}

	if (content.length > 3000) {
		const jsonishLines = lines.filter((line) => {
			const trimmed = line.trim();
			return trimmed.startsWith('"') || trimmed.startsWith('{') || trimmed.startsWith('}');
		});
		return jsonishLines.length > 20;
	}

	return false;
}
