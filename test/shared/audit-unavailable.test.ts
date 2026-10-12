import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { testTempRoot } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { evaluateAuditReportFreshness } from '../../shared/src/metadata/audit-freshness.ts';
import { FileAiddStore } from '../../shared/src/metadata/store.ts';
import {
	hasStructuredAuditOutput,
	structuredAuditReports,
} from '../../shared/src/modes/audit-parsing.ts';
import { persistAuditReports } from '../../shared/src/modes/audit-persist.ts';
import { simulationMarker, unavailableMarker } from '../../shared/src/modes/audit-shared.ts';

const rootDir = join(testTempRoot, 'audit-unavailable');
const justification = 'Inspected src/routes.ts and confirmed every route declares an input schema.';

afterEach(async () => {
	await removeTempTree(rootDir);
});

async function persist(
	name: string,
	selectedAudits: string[],
	structured: Record<string, unknown>,
) {
	const projectDir = join(rootDir, name);
	const store = new FileAiddStore(projectDir);
	const result = await persistAuditReports({
		projectDir,
		selectedAudits,
		simulated: false,
		store,
		structured,
	});
	return { projectDir, result, store };
}

async function onlyReport(store: FileAiddStore): Promise<string> {
	const reports = await store.listAuditReports();
	expect(reports).toHaveLength(1);
	return await store.readAuditReport(reports[0] ?? '');
}

describe('single-audit result parsing', () => {
	test('attributes a named result to the audit it names', () => {
		const structured = {
			auditFindings: [],
			auditName: 'DEAD_CODE',
			noFindingsJustification: justification,
		};
		expect(structuredAuditReports(structured, ['SECURITY', 'DEAD_CODE'])).toEqual({
			invalid: [],
			reports: [{ auditName: 'DEAD_CODE', structured }],
		});
	});

	test('rejects a result naming an audit that was not selected', () => {
		const structured = {
			auditFindings: [],
			auditName: 'LICENSES',
			noFindingsJustification: justification,
		};
		expect(structuredAuditReports(structured, ['SECURITY', 'DEAD_CODE'])).toEqual({
			invalid: [{ auditName: 'LICENSES', reason: 'auditName was not selected' }],
			reports: [],
		});
		// A name that is not even a string is rejected the same way, without a name to quote.
		expect(structuredAuditReports({ ...structured, auditName: 7 }, ['SECURITY'])).toEqual({
			invalid: [{ reason: 'auditName was not selected' }],
			reports: [],
		});
	});

	test('attributes an unlabelled result only when one audit could own it', () => {
		const structured = { auditFindings: [], noFindingsJustification: justification };
		expect(structuredAuditReports(structured, ['SECURITY']).reports).toEqual([
			{ auditName: 'SECURITY', structured },
		]);
		expect(structuredAuditReports(structured, ['SECURITY', 'DEAD_CODE'])).toEqual({
			invalid: [
				{
					reason: 'missing auditName: the result cannot be attributed to one of 2 selected audits',
				},
			],
			reports: [],
		});
	});

	test('no longer reads an array of reports as audit output', () => {
		const structured = {
			auditReports: [
				{
					auditFindings: [],
					auditName: 'SECURITY',
					noFindingsJustification: justification,
				},
			],
		};
		expect(hasStructuredAuditOutput(structured)).toBe(false);
		expect(structuredAuditReports(structured, ['SECURITY'])).toEqual({
			invalid: [
				{
					auditName: 'SECURITY',
					reason: 'invalid auditFindings: missing auditFindings array',
				},
			],
			reports: [],
		});
	});

	test('accepts a could-not-run result and requires its reason and empty findings', () => {
		const unavailable = {
			auditName: 'LIGHTHOUSE',
			auditStatus: 'unavailable',
			unavailableReason: 'No Lighthouse artifact exists.',
		};
		expect(hasStructuredAuditOutput(unavailable)).toBe(true);
		expect(structuredAuditReports(unavailable, ['LIGHTHOUSE'])).toEqual({
			invalid: [],
			reports: [
				{
					auditName: 'LIGHTHOUSE',
					structured: unavailable,
					unavailableReason: 'No Lighthouse artifact exists.',
				},
			],
		});

		const noReason = structuredAuditReports({ ...unavailable, unavailableReason: '  ' }, [
			'LIGHTHOUSE',
		]);
		expect(noReason.reports).toEqual([]);
		expect(noReason.invalid[0]?.reason).toContain('requires a non-empty unavailableReason');

		const withFindings = structuredAuditReports(
			{ ...unavailable, auditFindings: [{ title: 'Something' }] },
			['LIGHTHOUSE'],
		);
		expect(withFindings.reports).toEqual([]);
		expect(withFindings.invalid[0]?.reason).toContain('requires auditFindings to be empty');
	});
});

describe('could-not-run audit persistence', () => {
	test('persists a marked report that carries the reason and is not evidence', async () => {
		const { projectDir, result, store } = await persist('declared', ['LIGHTHOUSE'], {
			auditName: 'LIGHTHOUSE',
			auditStatus: 'unavailable',
			unavailableReason: 'No Lighthouse artifact exists\nunder logs/.',
		});

		expect(result.completedAudits).toEqual([]);
		expect(result.invalid).toEqual([]);
		expect(result.unavailableAudits).toEqual([
			{ auditName: 'LIGHTHOUSE', reason: 'No Lighthouse artifact exists under logs/.' },
		]);
		expect(Object.keys(result.perAuditReportPaths)).toEqual(['LIGHTHOUSE']);
		const report = await onlyReport(store);
		expect(report).toContain(unavailableMarker);
		expect(report).toContain(
			'> **Audit could not run:** No Lighthouse artifact exists under logs/.',
		);

		// On disk, yet never fresh for a reader that excludes the marker — and a reader that
		// excludes only the simulation marker shows why every reader has to name this one.
		const excluded = await evaluateAuditReportFreshness(projectDir, 'LIGHTHOUSE', {
			excludedReportMarkers: [simulationMarker, unavailableMarker],
		});
		expect(excluded.status).toBe('missing');
		const unexcluded = await evaluateAuditReportFreshness(projectDir, 'LIGHTHOUSE', {
			excludedReportMarkers: [simulationMarker],
		});
		expect(unexcluded.status).toBe('fresh');
	});

	test('marks a measurement report whose score was withheld', async () => {
		const { projectDir, result, store } = await persist('withheld', ['LIGHTHOUSE'], {
			auditFindings: [],
			auditName: 'LIGHTHOUSE',
			noFindingsJustification:
				'Ran lighthouse against frontend/dist and found no category below its threshold.',
			reportMarkdown: '# LIGHTHOUSE Audit Report\n\n**Overall Score:** 84/100\n',
		});

		expect(result.unmeasuredScoresWithheld).toBe(1);
		expect(result.completedAudits).toEqual([]);
		expect(result.unavailableAudits).toEqual([
			{
				auditName: 'LIGHTHOUSE',
				reason: 'the report declared a numeric score with no validated instruments[] entry, so nothing measured it',
			},
		]);
		const report = await onlyReport(store);
		expect(report).toContain(unavailableMarker);
		expect(report).toContain('SKIPPED / data-unavailable');
		const freshness = await evaluateAuditReportFreshness(projectDir, 'LIGHTHOUSE', {
			excludedReportMarkers: [unavailableMarker],
		});
		expect(freshness.status).toBe('missing');
	});

	// The methodology tells an audit with no working instrument to write this status and file a
	// High finding. The finding is real work and is kept; the report is still not evidence that
	// the audit was performed, whatever the agent set `auditStatus` to.
	test('marks a report that declares itself skipped, and keeps its finding', async () => {
		const { projectDir, result, store } = await persist('self-declared', ['LIGHTHOUSE'], {
			auditFindings: [
				{
					affectedFiles: ['package.json'],
					description:
						'Verified: package.json:1 - no script produces a Lighthouse artifact.',
					severity: 'High',
					spec: 'Add a script that produces logs/lighthouse.json.',
					title: 'No working Lighthouse instrument exists',
				},
			],
			auditName: 'LIGHTHOUSE',
			reportMarkdown:
				'# LIGHTHOUSE Audit Report\n\n**Status:** SKIPPED / data-unavailable\n\nNo artifact was available.\n',
		});

		expect(result.totalCreated).toBe(1);
		expect(result.completedAudits).toEqual([]);
		expect(result.unavailableAudits.map((audit) => audit.auditName)).toEqual(['LIGHTHOUSE']);
		expect(await onlyReport(store)).toContain(unavailableMarker);
		const freshness = await evaluateAuditReportFreshness(projectDir, 'LIGHTHOUSE', {
			excludedReportMarkers: [unavailableMarker],
		});
		expect(freshness.status).toBe('missing');
	});

	test('leaves a measured report unmarked and fresh', async () => {
		const { projectDir, result, store } = await persist('measured', ['LIGHTHOUSE'], {
			auditFindings: [],
			auditName: 'LIGHTHOUSE',
			instruments: [
				{
					evidence: 'logs/lighthouse.json (mtime 2026-10-11T03:11:02Z)',
					kind: 'artifact',
					measured: 'category scores; build=preview',
					name: 'lighthouse',
					target: 'frontend/dist',
					verified: true,
				},
			],
			noFindingsJustification:
				'Ran lighthouse against frontend/dist and found no category below its threshold.',
			reportMarkdown: '# LIGHTHOUSE Audit Report\n\n**Overall Score:** 84/100\n',
		});

		expect(result.completedAudits).toEqual(['LIGHTHOUSE']);
		expect(result.unavailableAudits).toEqual([]);
		expect(await onlyReport(store)).not.toContain(unavailableMarker);
		const freshness = await evaluateAuditReportFreshness(projectDir, 'LIGHTHOUSE', {
			excludedReportMarkers: [simulationMarker, unavailableMarker],
		});
		expect(freshness.status).toBe('fresh');
	});

	test('falls back to the last real report behind a could-not-run one', async () => {
		const projectDir = join(rootDir, 'behind');
		const store = new FileAiddStore(projectDir);
		await store.writeAuditReport(
			'SECURITY',
			'# SECURITY real report',
			new Date('2026-10-01T00:00:00Z'),
		);
		await persistAuditReports({
			projectDir,
			selectedAudits: ['SECURITY'],
			simulated: false,
			store,
			structured: {
				auditStatus: 'unavailable',
				unavailableReason: 'The fixture directory could not be written.',
			},
		});

		const freshness = await evaluateAuditReportFreshness(projectDir, 'SECURITY', {
			excludedReportMarkers: [unavailableMarker],
		});
		expect(freshness.report).toBe('SECURITY-2026-10-01.md');
	});
});
