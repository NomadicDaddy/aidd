import { describe, expect, test } from 'bun:test';

import type { Feature } from '../../shared/src/metadata/features.ts';
import type { FindingLedgerEvent } from '../../shared/src/metadata/findings-ledger.ts';

import { findingFingerprint, normalizeFinding } from '../../shared/src/modes/audit-findings.ts';

const auditName = 'SECURITY';
// Regenerate only when the canonical form changes on purpose: sha256 of the JSON
// {affectedFiles: canonical sorted paths, auditSource, title: normalized text}.
const GOLDEN_FINGERPRINT = 'f1-1d37259f359c8bdacb728992484d466f0654771f703c31f65cf4f6389f1bbb4e';

function finding(title = 'Missing auth guard', affectedFiles = ['src/a.ts', 'src/b.ts']) {
	return {
		affectedFiles,
		description: 'Verified: src/a.ts:10 - the route has no guard',
		spec: 'Add the missing guard.',
		title,
	};
}

function ledgerEvent(
	event: 'dismissed' | 'remediated',
	fingerprint: string,
	reason?: 'false-positive' | 'not-worth-it',
): FindingLedgerEvent {
	return {
		at: '2026-08-24T12:00:00.000Z',
		auditSource: auditName,
		event,
		featureId: 'audit-security-prior',
		fingerprint,
		...(reason ? { reason } : {}),
		runId: 'run-prior',
	};
}

describe('audit finding fingerprints', () => {
	test('is stable across title casing, whitespace, and affected-file ordering', () => {
		const first = findingFingerprint(auditName, '  Missing   Auth\nGuard ', [
			'src/b.ts',
			'src/a.ts',
		]);
		const second = findingFingerprint(auditName, 'missing auth guard', [
			'src/a.ts',
			'src/b.ts',
		]);

		expect(first).toBe(GOLDEN_FINGERPRINT);
		expect(second).toBe(first);
	});

	test('is stable across path separators, ./ prefixes, and repeated entries', () => {
		const canonical = findingFingerprint(auditName, 'Missing auth guard', ['src/a.ts']);

		expect(findingFingerprint(auditName, 'Missing auth guard', ['src\\a.ts'])).toBe(canonical);
		expect(findingFingerprint(auditName, 'Missing auth guard', ['./src/a.ts'])).toBe(canonical);
		expect(
			findingFingerprint(auditName, 'Missing auth guard', [
				'src/a.ts',
				'./src/a.ts',
				'src\\a.ts',
			]),
		).toBe(canonical);
		expect(findingFingerprint(auditName, 'Missing auth guard', ['src/b.ts'])).not.toBe(
			canonical,
		);
	});

	test('matches fingerprints before considering title and file overlap', () => {
		const normalized = normalizeFinding(
			finding(),
			auditName,
			[
				{
					affectedFiles: ['src/a.ts'],
					auditSource: auditName,
					fingerprint: `f1-${'a'.repeat(64)}`,
					id: 'audit-security-different-fingerprint',
					passes: false,
					status: 'backlog',
					title: 'Missing auth guard',
				},
			],
			0,
		);

		expect(normalized.disposition).toBe('emit');
	});

	test('falls back to the title-and-file heuristic only when the prior feature has no fingerprint', () => {
		const existing: Feature = {
			affectedFiles: ['src/a.ts'],
			auditSource: auditName,
			id: 'audit-security-unfingerprinted',
			passes: false,
			status: 'backlog',
			title: 'Different title',
		};

		const normalized = normalizeFinding(finding(), auditName, [existing], 0);

		expect(normalized.disposition).toBe('suppress-duplicate');
		expect(normalized.priorFeatureId).toBe(existing.id);
	});

	test('suppresses false-positive dismissals and recurs after other resolutions', () => {
		const fingerprint = findingFingerprint(auditName, 'Missing auth guard', [
			'src/a.ts',
			'src/b.ts',
		]);
		const priorFeature: Feature = {
			affectedFiles: ['src/a.ts', 'src/b.ts'],
			auditSource: auditName,
			fingerprint,
			id: 'audit-security-resolved',
			passes: true,
			status: 'completed',
			title: 'Missing auth guard',
		};
		const dismissed = normalizeFinding(finding(), auditName, [priorFeature], 0, [
			ledgerEvent('dismissed', fingerprint, 'false-positive'),
		]);
		const remediated = normalizeFinding(finding(), auditName, [priorFeature], 0, [
			ledgerEvent('remediated', fingerprint),
		]);
		const dismissedForValue = normalizeFinding(finding(), auditName, [], 0, [
			ledgerEvent('dismissed', fingerprint, 'not-worth-it'),
		]);

		expect(dismissed.disposition).toBe('suppress-dismissed');
		expect(remediated.disposition).toBe('recur');
		expect(dismissedForValue.disposition).toBe('recur');
		expect(dismissed.priorFeatureId).toBe('audit-security-prior');
		expect(remediated.feature.notes).toEqual([
			'Recurrence of prior finding audit-security-prior.',
		]);
	});

	test('does not reuse a resolution that predates a newer emitted generation', () => {
		const fingerprint = findingFingerprint(auditName, 'Missing auth guard', [
			'src/a.ts',
			'src/b.ts',
		]);
		const currentFeature: Feature = {
			affectedFiles: ['src/a.ts', 'src/b.ts'],
			auditSource: auditName,
			fingerprint,
			id: 'audit-security-current',
			passes: false,
			status: 'backlog',
			title: 'Missing auth guard',
		};
		const events = [
			ledgerEvent('remediated', fingerprint),
			{
				at: '2026-08-24T13:00:00.000Z',
				auditSource: auditName,
				event: 'emitted' as const,
				featureId: currentFeature.id,
				fingerprint,
				runId: 'run-current',
			},
		];

		const normalized = normalizeFinding(finding(), auditName, [currentFeature], 0, events);

		expect(normalized.disposition).toBe('suppress-duplicate');
		expect(normalized.priorFeatureId).toBe(currentFeature.id);
	});

	test('an open record on disk wins over a false-positive dismissal in the ledger', () => {
		const fingerprint = findingFingerprint(auditName, 'Missing auth guard', [
			'src/a.ts',
			'src/b.ts',
		]);
		const openFeature: Feature = {
			affectedFiles: ['src/a.ts', 'src/b.ts'],
			auditSource: auditName,
			fingerprint,
			id: 'audit-security-recreated',
			passes: false,
			status: 'backlog',
			title: 'Missing auth guard',
		};

		const normalized = normalizeFinding(finding(), auditName, [openFeature], 0, [
			ledgerEvent('dismissed', fingerprint, 'false-positive'),
		]);

		expect(normalized.disposition).toBe('suppress-duplicate');
		expect(normalized.priorFeatureId).toBe('audit-security-recreated');
	});

	test('a completed record without passes true counts as resolved and recurs', () => {
		const fingerprint = findingFingerprint(auditName, 'Missing auth guard', [
			'src/a.ts',
			'src/b.ts',
		]);
		const completedFeature: Feature = {
			affectedFiles: ['src/a.ts', 'src/b.ts'],
			auditSource: auditName,
			fingerprint,
			id: 'audit-security-completed',
			status: 'completed',
			title: 'Missing auth guard',
		};

		const normalized = normalizeFinding(finding(), auditName, [completedFeature], 0, []);

		expect(normalized.disposition).toBe('recur');
		expect(normalized.priorFeatureId).toBe('audit-security-completed');
		expect(normalized.feature.notes).toEqual([
			'Recurrence of prior finding audit-security-completed.',
		]);
	});
});
