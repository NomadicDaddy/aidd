import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { testTempRoot } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { parseAuditReportMetadata } from '../../shared/src/metadata/audit-freshness.ts';
import { FileAiddStore } from '../../shared/src/metadata/store.ts';
import { findingFingerprint } from '../../shared/src/modes/audit-findings.ts';
import { persistAuditReports } from '../../shared/src/modes/audit-persist.ts';

const rootDir = join(testTempRoot, 'finding-ledger-persist');
const auditName = 'SECURITY';

afterEach(async () => {
	await removeTempTree(rootDir);
});

function auditFinding(id = 'audit-security-current') {
	return {
		affectedFiles: ['src/routes.ts'],
		description: 'Verified: src/routes.ts:12 - route has no authentication guard',
		id,
		severity: 'High',
		spec: 'Add an authentication guard.',
		title: 'Missing auth guard',
	};
}

async function persist(projectDir: string, runId: string, id?: string) {
	const store = new FileAiddStore(projectDir);
	const result = await persistAuditReports({
		projectDir,
		runId,
		selectedAudits: [auditName],
		simulated: false,
		store,
		structured: {
			auditFindings: [auditFinding(id)],
			reportMarkdown: '# SECURITY Audit Report\n\nOne finding.\n',
		},
	});
	return { result, store };
}

describe('audit finding ledger persistence', () => {
	test('appends one parseable emitted event and writes version 2 report metadata', async () => {
		const projectDir = join(rootDir, 'emitted');
		const { result, store } = await persist(projectDir, 'run-emitted');
		const [event] = await store.readFindingEvents();
		const [reportName] = await store.listAuditReports();
		if (!event || !reportName) throw new Error('Expected an emitted event and audit report');
		const report = await store.readAuditReport(reportName);
		const metadata = parseAuditReportMetadata(report);

		expect(result.totalCreated).toBe(1);
		expect(result.fileChanges.modeFilesCreated).toContain(
			join(projectDir, '.aidd', 'findings-ledger.jsonl'),
		);
		expect(event).toMatchObject({
			auditSource: auditName,
			event: 'emitted',
			featureId: 'audit-security-current',
			runId: 'run-emitted',
		});
		expect(event.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(metadata).toEqual({
			findings: [{ featureId: event.featureId, fingerprint: event.fingerprint }],
			generatedAt: expect.any(String),
			gitHead: null,
			version: 2,
		});
		const rawLedger = await readFile(
			join(projectDir, '.aidd', 'findings-ledger.jsonl'),
			'utf8',
		);
		expect(rawLedger.trim().split(/\r?\n/u)).toHaveLength(1);
		expect(() => JSON.parse(rawLedger.trim())).not.toThrow();
	});

	test('counts each suppressed open duplicate from the event actually written', async () => {
		const projectDir = join(rootDir, 'duplicate');
		const first = await persist(projectDir, 'run-first');
		const second = await persist(projectDir, 'run-second');
		const events = await second.store.readFindingEvents();

		expect(first.result.totalCreated).toBe(1);
		expect(second.result.totalCreated).toBe(0);
		expect(second.result.suppressedDuplicateCount).toBe(1);
		expect(events.map((event) => event.event)).toEqual(['emitted', 'suppressed-duplicate']);
		expect(events[1]?.featureId).toBe('audit-security-current');
	});

	test('creates and links a recurrence after a completed prior feature', async () => {
		const projectDir = join(rootDir, 'recurred');
		const store = new FileAiddStore(projectDir);
		const fingerprint = findingFingerprint(auditName, 'Missing auth guard', ['src/routes.ts']);
		await store.writeFeature({
			affectedFiles: ['src/routes.ts'],
			auditSource: auditName,
			fingerprint,
			id: 'audit-security-prior',
			passes: true,
			status: 'completed',
			title: 'Missing auth guard',
		});

		const { result } = await persist(projectDir, 'run-recurred', 'audit-security-recurred');
		const events = await store.readFindingEvents();
		const recurred = await store.readFeature('audit-security-recurred');

		expect(result.totalCreated).toBe(1);
		expect(events.map((event) => event.event)).toEqual(['emitted', 'recurred']);
		expect(events[1]).toMatchObject({
			featureId: 'audit-security-recurred',
			priorFeatureId: 'audit-security-prior',
		});
		expect(recurred.notes).toEqual(['Recurrence of prior finding audit-security-prior.']);
	});

	test('recreates findings after remediated and non-false-positive ledger resolutions', async () => {
		const resolutions = [
			{ event: 'remediated' as const, name: 'remediated' },
			{ event: 'dismissed' as const, name: 'dismissed', reason: 'not-worth-it' as const },
		];
		for (const resolution of resolutions) {
			const projectDir = join(rootDir, resolution.name);
			const store = new FileAiddStore(projectDir);
			const fingerprint = findingFingerprint(auditName, 'Missing auth guard', [
				'src/routes.ts',
			]);
			await store.appendFindingEvent({
				auditSource: auditName,
				event: resolution.event,
				featureId: `audit-security-${resolution.name}-prior`,
				fingerprint,
				...('reason' in resolution ? { reason: resolution.reason } : {}),
				runId: `run-${resolution.name}-resolution`,
			});

			const { result } = await persist(
				projectDir,
				`run-${resolution.name}-recurrence`,
				`audit-security-${resolution.name}-current`,
			);
			const events = await store.readFindingEvents();

			expect(result.totalCreated).toBe(1);
			expect(events.at(-1)).toMatchObject({
				event: 'recurred',
				featureId: `audit-security-${resolution.name}-current`,
				priorFeatureId: `audit-security-${resolution.name}-prior`,
			});
		}
	});

	test('suppresses a fingerprint dismissed as false-positive', async () => {
		const projectDir = join(rootDir, 'dismissed');
		const store = new FileAiddStore(projectDir);
		const fingerprint = findingFingerprint(auditName, 'Missing auth guard', ['src/routes.ts']);
		await store.appendFindingEvent({
			auditSource: auditName,
			event: 'dismissed',
			featureId: 'audit-security-dismissed',
			fingerprint,
			reason: 'false-positive',
			runId: 'run-dismissal',
		});

		const { result } = await persist(projectDir, 'run-suppressed');
		const events = await store.readFindingEvents();

		expect(result.totalCreated).toBe(0);
		expect(result.suppressedDismissedCount).toBe(1);
		expect(events.at(-1)).toMatchObject({
			event: 'suppressed-dismissed',
			featureId: 'audit-security-dismissed',
			runId: 'run-suppressed',
		});
		expect(await store.listFeatures({ includeAudit: true })).toEqual([]);
	});

	// The adversarial sequence: a torn trailing line must not abort the whole persist before a
	// single report is written.
	test('still writes reports and features when the ledger holds a torn trailing line', async () => {
		const projectDir = join(rootDir, 'torn');
		const ledgerPath = join(projectDir, '.aidd', 'findings-ledger.jsonl');
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		const fingerprint = findingFingerprint(auditName, 'Missing auth guard', ['src/routes.ts']);
		const valid = JSON.stringify({
			at: '2026-08-24T12:00:00.000Z',
			auditSource: auditName,
			event: 'dismissed',
			featureId: 'audit-security-earlier',
			fingerprint,
			reason: 'false-positive',
		});
		await writeFile(ledgerPath, `${valid}\n{"at":"2026-08-25T0`);

		const { result, store } = await persist(projectDir, 'run-torn');
		const ledger = await store.readFindingLedger();

		expect(result.completedAudits).toEqual([auditName]);
		expect(await store.listAuditReports()).toHaveLength(1);
		expect(result.skippedLedgerLines).toBe(1);
		expect(ledger.skippedLines).toBe(1);
		// The valid line before the torn one still counts: the false-positive dismissal holds.
		expect(result.suppressedDismissedCount).toBe(1);
		expect(ledger.events.map((event) => event.event)).toEqual([
			'dismissed',
			'suppressed-dismissed',
		]);
	});

	test('a crash-recovery replay of the same run duplicates neither features nor events', async () => {
		const projectDir = join(rootDir, 'replay');
		const first = await persist(projectDir, 'run-replayed');
		const second = await persist(projectDir, 'run-replayed');
		const events = await second.store.readFindingEvents();

		expect(first.result.totalCreated).toBe(1);
		expect(second.result.totalCreated).toBe(1);
		expect(second.result.suppressedDuplicateCount).toBe(0);
		expect(second.result.findingIds).toEqual(first.result.findingIds);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ event: 'emitted', runId: 'run-replayed' });
		expect(await second.store.listFeatures({ includeAudit: true })).toHaveLength(1);
	});

	test('appendFindingEvent is a no-op for a repeated (runId, fingerprint, event, featureId)', async () => {
		const projectDir = join(rootDir, 'idempotent');
		const store = new FileAiddStore(projectDir);
		const fingerprint = findingFingerprint(auditName, 'Missing auth guard', ['src/routes.ts']);
		const event = {
			auditSource: auditName,
			event: 'dismissed' as const,
			featureId: 'audit-security-retry',
			fingerprint,
			reason: 'other' as const,
			source: 'web-ui',
		};
		await store.appendFindingEvent(event);
		const [recorded] = await store.readFindingEvents();
		await store.appendFindingEvent({ ...event, note: 'second attempt' });
		await store.appendFindingEvent({ ...event, runId: 'run-x' });

		const raw = await readFile(join(projectDir, '.aidd', 'findings-ledger.jsonl'), 'utf8');
		const events = await store.readFindingEvents();
		expect(raw.trim().split(/\r?\n/u)).toHaveLength(2);
		expect(events[0]).toEqual(recorded);
		expect(events[0]?.note).toBeUndefined();
		expect(events[1]?.runId).toBe('run-x');
	});

	test('omits runId rather than writing a sentinel when the caller has no run', async () => {
		const projectDir = join(rootDir, 'no-run');
		const store = new FileAiddStore(projectDir);
		await persistAuditReports({
			projectDir,
			selectedAudits: [auditName],
			simulated: false,
			store,
			structured: {
				auditFindings: [auditFinding()],
				reportMarkdown: '# SECURITY Audit Report\n\nOne finding.\n',
			},
		});
		const [event] = await store.readFindingEvents();
		expect(event?.event).toBe('emitted');
		expect(event && 'runId' in event).toBe(false);
	});
});
