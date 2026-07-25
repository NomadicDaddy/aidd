import { describe, expect, test } from 'bun:test';

import {
	createCliActiveRunRecord,
	parseCliActiveRunRecord,
} from '../../shared/src/metadata/active-runs/record.ts';

function baseRecordJson(): Record<string, unknown> {
	// A terminal record as an older CLI version wrote it: no provenance or output metrics.
	const record = createCliActiveRunRecord({
		backend: 'native',
		mode: 'coding',
		model: undefined,
		projectDir: 'd:/applications/demo',
		provider: undefined,
		reasoningEffort: 'medium',
	});
	const json = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
	for (const key of [
		'aiddDirty',
		'aiddRevision',
		'aiddVersion',
		'cachedTokens',
		'filesChanged',
		'inputTokens',
		'linesAdded',
		'linesRemoved',
		'outputTokens',
		'reasoningTokens',
	]) {
		delete json[key];
	}
	return json;
}

describe('active-run record output metrics', () => {
	test('records without metric fields (older CLI versions) parse with nulls', () => {
		const parsed = parseCliActiveRunRecord(baseRecordJson());
		expect(parsed).toBeDefined();
		expect(parsed).toMatchObject({
			aiddDirty: null,
			aiddRevision: null,
			aiddVersion: null,
			cachedTokens: null,
			filesChanged: null,
			inputTokens: null,
			linesAdded: null,
			linesRemoved: null,
			outputTokens: null,
			reasoningTokens: null,
		});
	});

	test('run provenance round-trips through the parser', () => {
		const parsed = parseCliActiveRunRecord({
			...baseRecordJson(),
			aiddDirty: true,
			aiddRevision: '0123456789abcdef',
			aiddVersion: '2.125.0',
		});
		expect(parsed).toMatchObject({
			aiddDirty: true,
			aiddRevision: '0123456789abcdef',
			aiddVersion: '2.125.0',
		});
	});

	test('finite metric values round-trip through the parser', () => {
		const parsed = parseCliActiveRunRecord({
			...baseRecordJson(),
			cachedTokens: 5,
			filesChanged: 2,
			inputTokens: 1_000,
			linesAdded: 42,
			linesRemoved: 7,
			outputTokens: 250,
			reasoningTokens: 0,
		});
		expect(parsed).toMatchObject({
			cachedTokens: 5,
			filesChanged: 2,
			inputTokens: 1_000,
			linesAdded: 42,
			linesRemoved: 7,
			outputTokens: 250,
			reasoningTokens: 0,
		});
	});

	test('a non-numeric metric value rejects the record', () => {
		expect(
			parseCliActiveRunRecord({ ...baseRecordJson(), linesAdded: 'lots' }),
		).toBeUndefined();
		expect(parseCliActiveRunRecord({ ...baseRecordJson(), inputTokens: NaN })).toBeUndefined();
	});
});
