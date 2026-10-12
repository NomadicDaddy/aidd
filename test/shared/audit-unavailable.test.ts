import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { testTempRoot } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import {
	evaluateAuditReportFreshness,
	reportOpensWithMarker,
} from '../../shared/src/metadata/audit-freshness.ts';
import { FileAiddStore } from '../../shared/src/metadata/store.ts';
import { declaresSkippedStatus } from '../../shared/src/modes/audit-instruments.ts';
import {
	hasStructuredAuditOutput,
	structuredAuditReports,
} from '../../shared/src/modes/audit-parsing.ts';
import { persistAuditReports } from '../../shared/src/modes/audit-persist.ts';
import { simulationMarker, unavailableMarker } from '../../shared/src/modes/audit-shared.ts';

const rootDir = join(testTempRoot, 'audit-unavailable');
const justification = 'Inspected src/routes.ts and confirmed every route declares an input schema.';
const missingInstrumentFinding = {
	affectedFiles: ['package.json'],
	description: 'Verified: package.json:1 - no script produces a Lighthouse artifact.',
	severity: 'High',
	spec: 'Add a script that produces logs/lighthouse.json.',
	title: 'No working Lighthouse instrument exists',
};
const lighthouseInstrument = {
	evidence: 'logs/lighthouse.json (mtime 2026-10-11T03:11:02Z)',
	kind: 'artifact',
	measured: 'category scores; build=preview',
	name: 'lighthouse',
	target: 'frontend/dist',
	verified: true,
};

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

	test('accepts a could-not-run result with or without findings and requires its reason', () => {
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

		// The missing instrument can itself be a defect of the project, and that finding rides
		// in the same result. It is held to the same shape as any other finding.
		const withFinding = { ...unavailable, auditFindings: [missingInstrumentFinding] };
		expect(structuredAuditReports(withFinding, ['LIGHTHOUSE'])).toEqual({
			invalid: [],
			reports: [
				{
					auditName: 'LIGHTHOUSE',
					structured: withFinding,
					unavailableReason: 'No Lighthouse artifact exists.',
				},
			],
		});

		const malformed = structuredAuditReports(
			{ ...unavailable, auditFindings: [{ title: 'Something' }] },
			['LIGHTHOUSE'],
		);
		expect(malformed.reports).toEqual([]);
		expect(malformed.invalid[0]?.reason).toContain('auditFindings[0]: missing spec');
		expect(malformed.invalid[0]?.reason).not.toContain('to be empty');
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
			auditFindings: [missingInstrumentFinding],
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
			instruments: [lighthouseInstrument],
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

	// Reports are one file per audit per day, so before this rule a could-not-run result written
	// after a real report on the same day replaced it: the evidence was gone and the audit read
	// as never performed.
	test('keeps a real report written the same day instead of replacing it', async () => {
		const projectDir = join(rootDir, 'same-day');
		const store = new FileAiddStore(projectDir);
		await store.writeAuditReport('SECURITY', '# SECURITY real report');
		const result = await persistAuditReports({
			projectDir,
			selectedAudits: ['SECURITY'],
			simulated: false,
			store,
			structured: {
				auditStatus: 'unavailable',
				unavailableReason: 'The fixture directory could not be written.',
			},
		});

		const report = await onlyReport(store);
		expect(report).toContain('# SECURITY real report');
		expect(report).not.toContain(unavailableMarker);
		// Still could-not-run for the run, with the kept report named and nothing written.
		expect(result.completedAudits).toEqual([]);
		expect(result.perAuditReportPaths).toEqual({});
		expect(result.fileChanges).toEqual({ modeFilesCreated: [], modeFilesEdited: [] });
		expect(result.unavailableAudits).toHaveLength(1);
		expect(result.unavailableAudits[0]?.reason).toBe(
			'The fixture directory could not be written.',
		);
		expect(result.unavailableAudits[0]?.keptReport).toContain('SECURITY-');
		const freshness = await evaluateAuditReportFreshness(projectDir, 'SECURITY', {
			excludedReportMarkers: [simulationMarker, unavailableMarker],
		});
		expect(freshness.status).toBe('fresh');
	});

	test('replaces a same-day report that is itself could-not-run or simulated', async () => {
		for (const marker of [unavailableMarker, simulationMarker]) {
			const projectDir = join(rootDir, `same-day-${marker.length}`);
			const store = new FileAiddStore(projectDir);
			await store.writeAuditReport('SECURITY', `${marker}\n# SECURITY earlier attempt`);
			const result = await persistAuditReports({
				projectDir,
				selectedAudits: ['SECURITY'],
				simulated: false,
				store,
				structured: {
					auditStatus: 'unavailable',
					unavailableReason: 'The fixture directory could not be written.',
				},
			});

			const report = await onlyReport(store);
			expect(report).not.toContain('earlier attempt');
			expect(report).toContain('> **Audit could not run:** The fixture directory');
			expect(result.unavailableAudits[0]?.keptReport).toBeUndefined();
			expect(Object.keys(result.perAuditReportPaths)).toEqual(['SECURITY']);
		}
	});

	test('keeps the finding a declared could-not-run result files about its instrument', async () => {
		const { result, store } = await persist('declared-with-finding', ['LIGHTHOUSE'], {
			auditFindings: [missingInstrumentFinding],
			auditName: 'LIGHTHOUSE',
			auditStatus: 'unavailable',
			unavailableReason: 'No script in package.json produces a Lighthouse artifact.',
		});

		expect(result.invalid).toEqual([]);
		expect(result.totalCreated).toBe(1);
		expect(result.completedAudits).toEqual([]);
		expect(result.unavailableAudits.map((audit) => audit.auditName)).toEqual(['LIGHTHOUSE']);
		expect(await onlyReport(store)).toContain(unavailableMarker);
		expect(await store.listFeatures({ includeAudit: true })).toHaveLength(1);
	});

	// The skipped phrase against one sub-metric is not the report declaring itself skipped.
	test('leaves a measured report that names one skipped sub-metric as evidence', async () => {
		const { projectDir, result, store } = await persist('sub-metric', ['LIGHTHOUSE'], {
			auditFindings: [],
			auditName: 'LIGHTHOUSE',
			instruments: [lighthouseInstrument],
			noFindingsJustification:
				'Ran lighthouse against frontend/dist and found no category below its threshold.',
			reportMarkdown: [
				'# LIGHTHOUSE Audit Report',
				'',
				'**Status**: MEASURED',
				'**Overall Score:** 84/100',
				'',
				'- **Field Web Vitals:** SKIPPED / data-unavailable (no crawltest artifact)',
				'| Metric | Value |',
				'| INP | SKIPPED / data-unavailable |',
				'The backend status: SKIPPED / data-unavailable for route timings.',
				'',
			].join('\n'),
		});

		expect(result.completedAudits).toEqual(['LIGHTHOUSE']);
		expect(result.unavailableAudits).toEqual([]);
		const report = await onlyReport(store);
		expect(report).not.toContain(unavailableMarker);
		expect(report).toContain('**Overall Score:** 84/100');
		const freshness = await evaluateAuditReportFreshness(projectDir, 'LIGHTHOUSE', {
			excludedReportMarkers: [simulationMarker, unavailableMarker],
		});
		expect(freshness.status).toBe('fresh');
	});

	test('reads the status line in each shape the definitions prescribe', () => {
		for (const line of [
			'**Status:** SKIPPED / data-unavailable',
			'**Status**: SKIPPED / data-unavailable',
			'  > **Status:** `SKIPPED / data-unavailable`. **Finding (High):** no instrument.',
			'- Status: SKIPPED / data-unavailable\r',
		]) {
			expect(declaresSkippedStatus(`# Report\n\n${line}\nMore text.`)).toBe(true);
		}
		for (const line of [
			'**Status**: [MEASURED | SKIPPED / data-unavailable]',
			'**Overall Score:** SKIPPED / data-unavailable',
			'**Backend Status:** SKIPPED / data-unavailable',
			'The report said **Status:** SKIPPED / data-unavailable last week.',
		]) {
			expect(declaresSkippedStatus(`# Report\n\n${line}\nMore text.`)).toBe(false);
		}
	});
});

describe('report markers are read from the leading lines only', () => {
	// An audit of aidd itself can quote the marker; that text is the report's subject, not its
	// kind, and the report must still count as evidence for every reader.
	test('a real report that quotes the marker text is still fresh', async () => {
		const { projectDir, result, store } = await persist('quoted-marker', ['SECURITY'], {
			auditFindings: [],
			auditName: 'SECURITY',
			noFindingsJustification: justification,
			reportMarkdown: `# SECURITY Audit Report\n\nThe writer prefixes \`${unavailableMarker}\`:\n\n${unavailableMarker}\n${simulationMarker}\n`,
		});

		expect(result.completedAudits).toEqual(['SECURITY']);
		expect(await onlyReport(store)).toContain(unavailableMarker);
		const freshness = await evaluateAuditReportFreshness(projectDir, 'SECURITY', {
			excludedReportMarkers: [simulationMarker, unavailableMarker],
		});
		expect(freshness.status).toBe('fresh');
	});

	test('finds a marker behind the freshness header and the simulation marker', () => {
		const header = '<!-- aidd:audit-report-meta {"version":1} -->';
		const both = `${header}\n${simulationMarker}\r\n${unavailableMarker}\n> reason\n\n# Report`;
		expect(reportOpensWithMarker(both, [unavailableMarker])).toBe(true);
		expect(reportOpensWithMarker(both, [simulationMarker])).toBe(true);
		expect(reportOpensWithMarker(`${unavailableMarker}\n# Report`, [unavailableMarker])).toBe(
			true,
		);
		expect(reportOpensWithMarker(`${header}\n# Report`, [unavailableMarker])).toBe(false);
		expect(
			reportOpensWithMarker(`${header}\n# Report\n${unavailableMarker}\n`, [
				unavailableMarker,
			]),
		).toBe(false);
		expect(reportOpensWithMarker(both, [])).toBe(false);
	});
});
