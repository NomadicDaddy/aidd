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
		'driverId',
		'driverKind',
		'driverSha256',
		'costUsd',
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
			driverId: null,
			driverKind: null,
			driverSha256: null,
			costUsd: null,
			cachedTokens: null,
			filesChanged: null,
			inputTokens: null,
			linesAdded: null,
			linesRemoved: null,
			outputTokens: null,
			reasoningTokens: null,
		});
	});

	test('run driver provenance round-trips through the parser', () => {
		const parsed = parseCliActiveRunRecord({
			...baseRecordJson(),
			driverId: 'demo-skill',
			driverKind: 'skill',
			driverSha256: 'b'.repeat(64),
		});
		expect(parsed).toMatchObject({
			driverId: 'demo-skill',
			driverKind: 'skill',
			driverSha256: 'b'.repeat(64),
		});
	});

	test('a driver this reader cannot interpret degrades to null fields and keeps the record', () => {
		const base = baseRecordJson();
		const unknownKind = parseCliActiveRunRecord({
			...base,
			driverId: 'step-review',
			driverKind: 'recipe',
			driverSha256: 'a'.repeat(64),
		});
		expect(unknownKind).toMatchObject({
			driverId: null,
			driverKind: null,
			driverSha256: null,
			id: base.id,
			state: base.state,
		});
		expect(
			parseCliActiveRunRecord({ ...base, driverKind: 'skill', driverSha256: 'not-a-sha' }),
		).toMatchObject({ driverId: null, driverKind: null, driverSha256: null, id: base.id });
	});

	test('run provenance round-trips through the parser', () => {
		const parsed = parseCliActiveRunRecord({
			...baseRecordJson(),
			aiddDirty: true,
			aiddRevision: '0123456789abcdef',
			aiddVersion: '3.0.0',
		});
		expect(parsed).toMatchObject({
			aiddDirty: true,
			aiddRevision: '0123456789abcdef',
			aiddVersion: '3.0.0',
		});
	});

	test('scheduled launch provenance round-trips through the parser', () => {
		expect(parseCliActiveRunRecord({ ...baseRecordJson(), source: 'scheduled' })?.source).toBe(
			'scheduled',
		);
	});

	test('finite metric values round-trip through the parser', () => {
		const parsed = parseCliActiveRunRecord({
			...baseRecordJson(),
			cachedTokens: 5,
			costUsd: 1.25,
			filesChanged: 2,
			inputTokens: 1_000,
			linesAdded: 42,
			linesRemoved: 7,
			outputTokens: 250,
			reasoningTokens: 0,
		});
		expect(parsed).toMatchObject({
			cachedTokens: 5,
			costUsd: 1.25,
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
		expect(parseCliActiveRunRecord({ ...baseRecordJson(), costUsd: 'free' })).toBeUndefined();
	});
});
