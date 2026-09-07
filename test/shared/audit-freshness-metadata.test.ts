import { describe, expect, test } from 'bun:test';

import {
	parseAuditReportMetadata,
	prependAuditReportMetadata,
} from '../../shared/src/metadata/audit-freshness.ts';

describe('audit report metadata versions', () => {
	test('continues to parse version 1 headers', () => {
		const metadata = {
			generatedAt: '2026-08-24T12:00:00.000Z',
			gitHead: 'abc123',
			version: 1 as const,
		};

		expect(
			parseAuditReportMetadata(prependAuditReportMetadata('# Report\n', metadata)),
		).toEqual(metadata);
	});

	test('parses version 2 finding references', () => {
		const metadata = {
			findings: [
				{
					featureId: 'audit-security-current',
					fingerprint: `f1-${'a'.repeat(64)}`,
				},
			],
			generatedAt: '2026-08-24T12:00:00.000Z',
			gitHead: null,
			version: 2 as const,
		};

		expect(
			parseAuditReportMetadata(prependAuditReportMetadata('# Report\n', metadata)),
		).toEqual(metadata);
	});

	// A hand-edited or truncated findings block must not erase the freshness data the report
	// still carries: the header degrades to the version 1 shape instead of parsing as nothing.
	test('degrades a version 2 header with malformed findings to version 1', () => {
		const header = [
			'<!-- aidd:audit-report-meta',
			JSON.stringify({
				findings: [{ featureId: 'audit-security-current' }],
				generatedAt: '2026-08-24T12:00:00.000Z',
				gitHead: 'abc123',
				version: 2,
			}),
			'-->',
			'',
			'# Report',
			'',
		].join('\n');

		expect(parseAuditReportMetadata(header)).toEqual({
			generatedAt: '2026-08-24T12:00:00.000Z',
			gitHead: 'abc123',
			version: 1,
		});
	});
});
