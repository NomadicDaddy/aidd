import { describe, expect, test } from 'bun:test';
import {
	afterToolCalls,
	evaluateTextOnlyResponse,
	initialHeuristicState,
} from 'aidd-shared/agent/heuristics/index';

describe('Native loop heuristics', () => {
	test('nudges hallucinated tool results before aborting', () => {
		const result = evaluateTextOnlyResponse(
			'I created feature files.\n[result]\n[exit code: 0]',
			initialHeuristicState(),
		);

		expect(result).toMatchObject({
			action: 'nudge',
			reason: 'hallucinated_tool_results',
		});
	});

	test('nudges incomplete text-only responses', () => {
		const result = evaluateTextOnlyResponse(
			'I need to inspect the route next, and then I will now update the file.',
			initialHeuristicState(),
		);

		expect(result).toMatchObject({
			action: 'nudge',
			reason: 'incomplete_response',
		});
	});

	test('uses read-only planning nudges during triumvirate planning', () => {
		const result = evaluateTextOnlyResponse(
			'I need to inspect the route next, and then I will now update the file.',
			initialHeuristicState(),
			{ mode: 'planning' },
		);

		expect(result).toMatchObject({
			action: 'nudge',
			reason: 'incomplete_response',
		});
		expect(result.action === 'nudge' ? result.prompt : '').toContain(
			'read-only Triumvirate planning stage',
		);
		expect(result.action === 'nudge' ? result.prompt : '').not.toContain(
			'perform the next concrete action',
		);
		expect(result.action === 'nudge' ? result.prompt : '').not.toContain(
			'Use tools to complete the remaining work',
		);
	});

	test('uses read-only planning hallucination nudges during triumvirate planning', () => {
		const result = evaluateTextOnlyResponse(
			'I created feature files.\n[result]\n[exit code: 0]',
			initialHeuristicState(),
			{ mode: 'planning' },
		);

		expect(result).toMatchObject({
			action: 'nudge',
			reason: 'hallucinated_tool_results',
		});
		expect(result.action === 'nudge' ? result.prompt : '').toContain(
			'read-only Triumvirate planning stage',
		);
		expect(result.action === 'nudge' ? result.prompt : '').not.toContain('write_file');
		expect(result.action === 'nudge' ? result.prompt : '').not.toContain('edit_file');
	});

	test('treats a parseable AIDD_RESULT block as complete despite incomplete-looking prose', () => {
		const content =
			'Now I have comprehensive evidence. Let me produce the final result with all reports.\n' +
			'AIDD_RESULT: {"auditReports":[{"auditName":"SECURITY","auditFindings":[],' +
			'"reportMarkdown":"# SECURITY\\n\\n## 6-9. Remaining Categories\\n\\nContinue with review. Still need to verify nothing."}]}';

		const result = evaluateTextOnlyResponse(content, initialHeuristicState());

		expect(result).toEqual({ action: 'complete' });
	});

	test('does not flag a result that contains hallucination-trigger phrasing in report markdown', () => {
		const content =
			'AIDD_RESULT: {"auditReports":[{"auditName":"DOCUMENTATION","auditFindings":[],' +
			'"reportMarkdown":"# DOCUMENTATION\\n\\nGenerated audit report covering created audit report references."}]}';

		const result = evaluateTextOnlyResponse(content, initialHeuristicState());

		expect(result).toEqual({ action: 'complete' });
	});

	test('still nudges when the AIDD_RESULT payload is truncated (braces unbalanced)', () => {
		const content =
			'I need to finish writing the report.\n' +
			'AIDD_RESULT: {"auditReports":[{"auditName":"SECURITY","reportMarkdown":"# SECURITY';

		const result = evaluateTextOnlyResponse(content, initialHeuristicState());

		expect(result).toMatchObject({
			action: 'nudge',
			reason: 'incomplete_response',
		});
	});

	test('nudges a brace-balanced placeholder result marker to re-emit valid JSON', () => {
		const result = evaluateTextOnlyResponse(
			'I have completed the audit. Here is my final assessment.\nAIDD_RESULT: { \u2026 }',
			initialHeuristicState(),
		);

		expect(result).toMatchObject({
			action: 'nudge',
			reason: 'malformed_result_marker',
		});
	});

	test('stops nudging a malformed result marker once the continuation budget is spent', () => {
		const exhausted = { ...initialHeuristicState(), continuationNudges: 3 };
		const result = evaluateTextOnlyResponse('AIDD_RESULT: { ... }', exhausted);

		expect(result).toEqual({ action: 'complete' });
	});

	test('nudges repeated bash calls without file work', () => {
		const result = afterToolCalls(
			initialHeuristicState(),
			Array.from({ length: 25 }, () => 'bash'),
		);

		expect(result.nudge).toMatchObject({
			action: 'nudge',
			reason: 'stuck_investigating',
		});
		expect(result.state.consecutiveBashCalls).toBe(0);
	});
});
