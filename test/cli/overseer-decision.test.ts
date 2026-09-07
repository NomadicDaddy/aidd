import { describe, expect, test } from 'bun:test';
import {
	buildDecisionArtifact,
	parseOverseerDecision,
} from '../../cli/src/orchestrator/triumvirate/overseer-decision.ts';

describe('parseOverseerDecision', () => {
	test('parses an execute decision with consistency issues', () => {
		const decision = parseOverseerDecision({
			consistencyIssues: ['unmet assertion A', 'missing acceptance criterion'],
			decision: 'execute',
			finalActions: 'do the thing',
		});
		expect(decision).toEqual({
			consistencyIssues: ['unmet assertion A', 'missing acceptance criterion'],
			finalActions: 'do the thing',
			status: 'execute',
		});
	});

	test('omits consistencyIssues when absent or empty', () => {
		expect(parseOverseerDecision({ decision: 'execute', finalActions: 'go' })).toEqual({
			finalActions: 'go',
			status: 'execute',
		});
		expect(
			parseOverseerDecision({
				consistencyIssues: [],
				decision: 'execute',
				finalActions: 'go',
			}),
		).toEqual({ finalActions: 'go', status: 'execute' });
	});

	test('filters non-string / blank consistency issues', () => {
		const decision = parseOverseerDecision({
			consistencyIssues: ['real', '', '   ', 42, null, 'also real'],
			decision: 'execute',
			finalActions: 'go',
		});
		expect(decision).toMatchObject({ consistencyIssues: ['real', 'also real'] });
	});

	test('abort and invalid decisions are unchanged', () => {
		expect(parseOverseerDecision({ decision: 'abort', reason: 'contradicts spec' })).toEqual({
			reason: 'contradicts spec',
			status: 'abort',
		});
		expect(parseOverseerDecision(undefined)).toMatchObject({ status: 'invalid' });
		expect(parseOverseerDecision({ decision: 'execute' })).toMatchObject({ status: 'invalid' });
	});
});

describe('buildDecisionArtifact', () => {
	test('records consistency issues on an execute decision', () => {
		const artifact = buildDecisionArtifact(
			{ consistencyIssues: ['gap X'], finalActions: 'go', status: 'execute' },
			undefined,
		);
		expect(artifact).toMatchObject({
			consistencyIssues: ['gap X'],
			finalActions: 'go',
			status: 'execute',
		});
	});
});
