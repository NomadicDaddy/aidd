import { describe, expect, test } from 'bun:test';

import {
	declaresNumericScore,
	enforceInstrumentBackedScore,
	measurementAudits,
	structuredInstruments,
	validateInstruments,
	withheldScoreValue,
} from '../../cli/src/modes/audit-instruments.ts';

function instrument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		name: 'check:critical-path',
		kind: 'script',
		target: 'frontend/dist',
		evidence: 'logs/critical-path.json (mtime 2026-07-20T03:11:02Z)',
		measured: 'entry + modulepreload brotli bytes; build=preview',
		verified: true,
		...overrides,
	};
}

function report(scoreLine: string): string {
	return [
		'# PERFORMANCE Audit Report - 2026-07-20',
		'',
		'## Executive Summary',
		'',
		'**Audit Name:** PERFORMANCE',
		scoreLine,
		'**Critical/High/Medium/Low:** 0/0/0/0',
		'',
		'## Key Findings',
		'',
		'- No logs/crawltest.json present; scored code-level only.',
		'',
	].join('\n');
}

describe('instrument parsing and validation', () => {
	test('reads the instruments array off the structured result', () => {
		expect(structuredInstruments({ instruments: [instrument()] })).toHaveLength(1);
		expect(structuredInstruments({ instruments: 'check:critical-path' })).toEqual([]);
		expect(structuredInstruments(undefined)).toEqual([]);
	});

	test('accepts a fully specified verified instrument', () => {
		const { rejected, validated } = validateInstruments([instrument()]);

		expect(rejected).toEqual([]);
		expect(validated).toEqual([
			{
				name: 'check:critical-path',
				kind: 'script',
				target: 'frontend/dist',
				evidence: 'logs/critical-path.json (mtime 2026-07-20T03:11:02Z)',
				measured: 'entry + modulepreload brotli bytes; build=preview',
				verified: true,
			},
		]);
	});

	test('rejects malformed entries without throwing', () => {
		const { rejected, validated } = validateInstruments([
			'check:critical-path',
			null,
			instrument({ verified: false }),
			instrument({ evidence: '   ', measured: undefined }),
		]);

		expect(validated).toEqual([]);
		expect(rejected).toEqual([
			{ index: 0, label: 'instruments[0]', reasons: ['entry is not an object'] },
			{ index: 1, label: 'instruments[1]', reasons: ['entry is not an object'] },
			{
				index: 2,
				label: 'check:critical-path',
				reasons: ['verified is not true'],
			},
			{
				index: 3,
				label: 'check:critical-path',
				reasons: ['missing evidence', 'missing measured'],
			},
		]);
	});

	test('rejects instrument kinds outside the result-contract enum', () => {
		const { rejected, validated } = validateInstruments([instrument({ kind: 'banana' })]);

		expect(validated).toEqual([]);
		expect(rejected).toEqual([
			{
				index: 0,
				label: 'check:critical-path',
				reasons: ['invalid kind (expected artifact, probe, or script)'],
			},
		]);
	});
});

describe('score detection', () => {
	test('matches the labelled score formats the shipped reports use', () => {
		expect(declaresNumericScore('**Overall Performance Score:** 84/100')).toBe(true);
		expect(declaresNumericScore('**Overall Performance Score**: 88/100')).toBe(true);
		expect(declaresNumericScore('**Overall Score:** 92/100')).toBe(true);
		expect(declaresNumericScore('**Overall Score**: 90/100')).toBe(true);
		expect(declaresNumericScore('Overall Score: 84/100')).toBe(true);
		expect(declaresNumericScore('- **Score:** 20/25')).toBe(true);
		expect(declaresNumericScore('### Overall Score: 84/100')).toBe(true);
		expect(
			declaresNumericScore(
				'## Overall Score Comparison\n\n| Category | Mobile | Desktop |\n| --- | ---: | ---: |\n| Performance | 65 | 92 |'
			)
		).toBe(true);
	});

	test('ignores non-numeric scores and scores quoted inside prose', () => {
		expect(declaresNumericScore('**Overall Score:** N/A')).toBe(false);
		expect(declaresNumericScore('Summary: 2 verified findings. Overall Score: 86/100.')).toBe(
			false
		);
		expect(declaresNumericScore('**Critical/High/Medium/Low:** 0/0/0/0')).toBe(false);
		expect(declaresNumericScore('| Findings | 2 | 4 |')).toBe(false);
	});
});

describe('instrument-backed score enforcement', () => {
	test('leaves a score backed by a validated instrument untouched', () => {
		const markdown = report('**Overall Performance Score:** 84/100');

		const enforced = enforceInstrumentBackedScore(
			'PERFORMANCE',
			{ instruments: [instrument()] },
			markdown
		);

		expect(enforced.withheld).toBe(false);
		expect(enforced.reportMarkdown).toBe(markdown);
	});

	test('withholds a score when no instruments were declared', () => {
		const markdown = report('**Overall Performance Score:** 84/100');

		const enforced = enforceInstrumentBackedScore('PERFORMANCE', {}, markdown);

		expect(enforced.withheld).toBe(true);
		expect(enforced.reportMarkdown).toContain(
			`**Overall Performance Score:** ${withheldScoreValue}`
		);
		expect(enforced.reportMarkdown).not.toContain('84/100');
		expect(enforced.reportMarkdown).toContain('## Score Withheld - No Validated Instrument');
		expect(enforced.reportMarkdown).toContain('No `instruments[]` entries were declared.');
		// The rest of the report survives.
		expect(enforced.reportMarkdown).toContain('# PERFORMANCE Audit Report - 2026-07-20');
		expect(enforced.reportMarkdown).toContain('- No logs/crawltest.json present');
		expect(enforced.rejected).toEqual([]);
	});

	test('withholds a score when every declared instrument fails validation', () => {
		const markdown = report('**Overall Score**: 84/100');

		const enforced = enforceInstrumentBackedScore(
			'LIGHTHOUSE',
			{ instruments: [instrument({ verified: false }), { name: 'lighthouse' }] },
			markdown
		);

		expect(enforced.withheld).toBe(true);
		expect(enforced.reportMarkdown).toContain(`**Overall Score**: ${withheldScoreValue}`);
		expect(enforced.reportMarkdown).toContain('Instruments declared but rejected:');
		expect(enforced.reportMarkdown).toContain('- `check:critical-path`: verified is not true');
		expect(enforced.reportMarkdown).toContain(
			'- `lighthouse`: missing evidence; missing kind; missing measured; missing target; verified is not true'
		);
		expect(enforced.rejected).toHaveLength(2);
	});

	test('leaves a measurement report that declares no score alone', () => {
		const markdown = report('**Overall Performance Score:** N/A');

		const enforced = enforceInstrumentBackedScore('BUILD_OUTPUT', {}, markdown);

		expect(enforced.withheld).toBe(false);
		expect(enforced.reportMarkdown).toBe(markdown);
	});

	test('leaves a non-measurement audit score alone', () => {
		const markdown = report('**Overall Score:** 84/100');

		expect(measurementAudits.has('SECURITY')).toBe(false);

		const enforced = enforceInstrumentBackedScore('SECURITY', {}, markdown);

		expect(enforced.withheld).toBe(false);
		expect(enforced.reportMarkdown).toBe(markdown);
	});

	test('rewrites every score line in a withheld report', () => {
		const markdown = [
			'**Overall Score:** 84/100',
			'',
			'### Bundle',
			'',
			'- **Score:** 20/25',
			'',
			'Prose mentioning Overall Score: 84/100 mid-sentence stays put.',
			'',
		].join('\n');

		const enforced = enforceInstrumentBackedScore('PERFORMANCE', { instruments: [] }, markdown);

		expect(enforced.withheld).toBe(true);
		expect(enforced.reportMarkdown).toContain(`**Overall Score:** ${withheldScoreValue}`);
		expect(enforced.reportMarkdown).toContain(`- **Score:** ${withheldScoreValue}`);
		expect(enforced.reportMarkdown).toContain(
			'Prose mentioning Overall Score: 84/100 mid-sentence stays put.'
		);
	});

	test('rewrites scores in the standard Lighthouse comparison table', () => {
		const markdown = [
			'# Lighthouse Audit Report',
			'',
			'## Overall Score Comparison',
			'',
			'| Category | Mobile | Desktop | Interpretation |',
			'| --- | ---: | ---: | --- |',
			'| Performance | 65/100 (Poor) | **92** | Mobile needs work |',
			'| Accessibility | 95 | 95 | Good |',
			'',
			'## Core Web Vitals',
			'',
			'| LCP | 3.5 | 1.4 |',
		].join('\n');

		const enforced = enforceInstrumentBackedScore('LIGHTHOUSE', {}, markdown);

		expect(enforced.withheld).toBe(true);
		expect(enforced.reportMarkdown).toContain(
			`| Performance | ${withheldScoreValue} (Poor) | **${withheldScoreValue}** | Mobile needs work |`
		);
		expect(enforced.reportMarkdown).toContain(
			`| Accessibility | ${withheldScoreValue} | ${withheldScoreValue} | Good |`
		);
		expect(enforced.reportMarkdown).toContain('| LCP | 3.5 | 1.4 |');
		expect(enforced.reportMarkdown).toContain('## Score Withheld - No Validated Instrument');
	});
});
