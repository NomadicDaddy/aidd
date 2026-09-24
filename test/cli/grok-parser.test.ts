import { describe, expect, test } from 'bun:test';
import {
	createGrokBackendParser,
	parseGrokBackendOutput,
	parseGrokLine,
} from 'aidd-shared/backends/parsers/grok';

// Envelope shapes captured from a real `grok --output-format streaming-json` run (grok 1.0.41).
const toolCall =
	'{"type":"tool_call","toolCallId":"call-9-0","title":"list_dir","kind":"list","status":"pending","toolName":"list_dir","rawInput":{"target_directory":"/tmp/demo"},"content":[],"locations":[]}';
const toolUpdatePending =
	'{"type":"tool_call_update","toolCallId":"call-9-0","status":null,"content":[],"rawOutput":null,"locations":[{"path":"/tmp/demo"}]}';
const toolUpdateCompleted =
	'{"type":"tool_call_update","toolCallId":"call-9-0","status":"completed","content":[],"rawOutput":{"type":"ListDir","Content":{"content":"- /tmp/demo/"}},"locations":[]}';
const midStreamUsage =
	'{"type":"usage","usage":{"input_tokens":60,"output_tokens":4,"cache_read_input_tokens":20,"cache_creation_input_tokens":0,"reasoning_tokens":2}}';
const endEnvelope =
	'{"type":"end","stopReason":"EndTurn","usage":{"input_tokens":100,"cache_read_input_tokens":50,"output_tokens":10,"reasoning_tokens":4,"total_tokens":160},"total_cost_usd":0.0125}';

describe('grok parser', () => {
	test('reports a tool call with its name and input', () => {
		const events = createGrokBackendParser().parseLine(toolCall);
		expect(events).toEqual([
			{ args: { target_directory: '/tmp/demo' }, tool: 'list_dir', type: 'tool_call' },
		]);
	});

	test('names the result after the call it belongs to', () => {
		const parser = createGrokBackendParser();
		parser.parseLine(toolCall);
		const events = parser.parseLine(toolUpdateCompleted);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ tool: 'list_dir', type: 'tool_result' });
	});

	// A mid-flight update carries no outcome. Emitting a result for it would fabricate one and
	// clear the flailing detector's pending-call count before the action reported back.
	test('ignores a tool_call_update that is not terminal', () => {
		const parser = createGrokBackendParser();
		parser.parseLine(toolCall);
		expect(parser.parseLine(toolUpdatePending)).toEqual([]);
	});

	// The stateless entry point has no call to match against, so it falls back to the payload's
	// own discriminator rather than dropping the result.
	test('stateless parse names the result from its payload', () => {
		const events = parseGrokLine(toolUpdateCompleted);
		expect(events[0]).toMatchObject({ tool: 'ListDir', type: 'tool_result' });
	});

	// end.usage is the exact sum of the per-call usage envelopes, and aidd's result aggregation
	// adds every usage event, so honoring both would double a run's tokens.
	test('counts usage once, from the end envelope, with reported cost', () => {
		const parser = createGrokBackendParser();
		expect(parser.parseLine(midStreamUsage)).toEqual([]);
		expect(parser.parseLine(endEnvelope)).toEqual([
			{
				cachedTokens: 50,
				costUsd: 0.0125,
				inputTokens: 150,
				outputTokens: 10,
				reasoningTokens: 4,
				type: 'usage',
			},
		]);
	});

	test('ignores the repeated session preamble', () => {
		expect(
			parseGrokLine('{"type":"available_commands","tools":["read_file"],"commands":[]}'),
		).toEqual([]);
	});

	test('full-output parse surfaces the tool round trip', () => {
		const stdout = [
			toolCall,
			toolUpdateCompleted,
			'{"type":"text","data":"Done."}',
			endEnvelope,
		].join('\n');
		const events = parseGrokBackendOutput(stdout, '', 0);
		expect(events.some((event) => event.type === 'tool_call')).toBe(true);
		expect(
			events.some((event) => event.type === 'tool_result' && event.tool === 'list_dir'),
		).toBe(true);
		expect(
			events.some((event) => event.type === 'assistant_text' && event.chunk === 'Done.'),
		).toBe(true);
	});
});
