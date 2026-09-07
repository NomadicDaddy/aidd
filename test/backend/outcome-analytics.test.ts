import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { invocationEvents, runs, settings } from '../../backend/src/db/schema.ts';
import type { AuditDefinitionDto } from '../../backend/src/services/audit/auditTypes.ts';
import { AuditOutcomeCache } from '../../backend/src/services/outcome/auditOutcomeCache.ts';
import {
	attachAuditOutcomes,
	collectAuditOutcomes,
} from '../../backend/src/services/outcome/auditOutcomes.ts';
import { getDriverRevertMeasures } from '../../backend/src/services/outcome/driverReverts.ts';
import {
	revertDetectionCursorKey,
	sweepRevertedCommits,
} from '../../backend/src/services/outcome/revertDetection.ts';
import { countRevertedCommits } from '../../backend/src/services/outcome/revertHistory.ts';
import {
	backfillRunCosts,
	RUN_COST_BACKFILL_KEY,
} from '../../backend/src/services/run/outputMetricsBackfill.ts';
import { getSkillRevisionUsage } from '../../backend/src/services/telemetry/resourceDetail.ts';
import { createCliActiveRunRecord } from '../../shared/src/metadata/active-runs/record.ts';
import {
	aggregateFindingOutcomes,
	measureFindingLifecycle,
} from '../../shared/src/outcome-measures.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';
import {
	outcomeDatabase as database,
	findingEvent as event,
	fingerprintA,
	fingerprintB,
	git,
	gitHead,
} from './_helpers/outcome-analytics.ts';

describe('finding lifecycle measures', () => {
	test('assigns every fingerprint to exactly one terminal bucket and bounds recurrence', () => {
		const measures = measureFindingLifecycle([
			event('emitted', 'finding-a', fingerprintA),
			event('dismissed', 'finding-a', fingerprintA, { reason: 'false-positive' }),
			event('emitted', 'finding-b', fingerprintB),
			event('recurred', 'finding-b', fingerprintB, { priorFeatureId: 'finding-old' }),
			event('remediated', 'finding-b', fingerprintB),
			event('suppressed-duplicate', 'finding-b', fingerprintB),
			event('suppressed-dismissed', 'finding-a', fingerprintA),
		]);

		expect(measures.buckets).toEqual({
			dismissed: 1,
			emitted: 0,
			recurred: 0,
			remediated: 1,
			'suppressed-dismissed': 1,
			'suppressed-duplicate': 1,
		});
		expect(measures.findingCount).toBe(4);
		expect(measures.acceptanceRate).toEqual({ denominator: 2, numerator: 1, value: 0.5 });
		expect(measures.falsePositiveRate).toEqual({ denominator: 2, numerator: 1, value: 0.5 });
		// finding-b recurred before it was remediated, so nothing recurred after remediation.
		expect(measures.recurrenceRate).toEqual({ denominator: 1, numerator: 0, value: 0 });
		expect(measures.remediatedByEmittingRun).toEqual({ 'run-audit': 1 });
		expect(
			aggregateFindingOutcomes([event('emitted', 'a', fingerprintA)]).byFingerprint.has(
				fingerprintA,
			),
		).toBe(true);
	});

	test('a fingerprint dismissed, recurred, and then remediated is one accepted finding', () => {
		const measures = measureFindingLifecycle([
			event('emitted', 'finding-a', fingerprintA, { at: '2026-08-25T10:00:00.000Z' }),
			event('dismissed', 'finding-a', fingerprintA, {
				at: '2026-08-25T11:00:00.000Z',
				reason: 'false-positive',
			}),
			event('recurred', 'finding-b', fingerprintA, {
				at: '2026-08-25T12:00:00.000Z',
				priorFeatureId: 'finding-a',
				runId: 'run-second',
			}),
			event('remediated', 'finding-b', fingerprintA, { at: '2026-08-25T13:00:00.000Z' }),
		]);

		expect(measures.buckets).toMatchObject({ dismissed: 0, recurred: 0, remediated: 1 });
		expect(measures.decided).toBe(1);
		expect(measures.acceptanceRate).toEqual({ denominator: 1, numerator: 1, value: 1 });
		expect(measures.falsePositiveRate).toEqual({ denominator: 1, numerator: 0, value: 0 });
		expect(measures.dismissedByReason['false-positive']).toBe(0);
		expect(measures.remediatedByEmittingRun).toEqual({ 'run-second': 1 });
	});

	test('orders by timestamp before ledger position and never lets recurrence exceed one', () => {
		const remediatedLate = event('remediated', 'finding-a', fingerprintA, {
			at: '2026-08-25T14:00:00.000Z',
		});
		const dismissedEarly = event('dismissed', 'finding-a', fingerprintA, {
			at: '2026-08-25T13:00:00.000Z',
			reason: 'other',
		});
		// The remediation is written first but happened later, so it is the terminal event.
		expect(measureFindingLifecycle([remediatedLate, dismissedEarly]).buckets).toMatchObject({
			dismissed: 0,
			remediated: 1,
		});

		const measures = measureFindingLifecycle([
			event('emitted', 'finding-a', fingerprintA, { at: '2026-08-25T10:00:00.000Z' }),
			event('remediated', 'finding-a', fingerprintA, { at: '2026-08-25T11:00:00.000Z' }),
			event('recurred', 'finding-b', fingerprintA, { at: '2026-08-25T12:00:00.000Z' }),
			event('remediated', 'finding-b', fingerprintA, { at: '2026-08-25T13:00:00.000Z' }),
			event('recurred', 'finding-c', fingerprintA, { at: '2026-08-25T14:00:00.000Z' }),
			event('suppressed-duplicate', 'finding-c', fingerprintA, {
				at: '2026-08-25T15:00:00.000Z',
			}),
		]);
		// Two recurrences after remediation of one fingerprint still count once.
		expect(measures.recurrenceRate).toEqual({ denominator: 1, numerator: 1, value: 1 });
		// A suppression never moves the bucket: the fingerprint is still open (recurred).
		expect(measures.buckets).toMatchObject({
			recurred: 1,
			remediated: 0,
			'suppressed-duplicate': 1,
		});
	});
});

describe('run cost capture', () => {
	test('persists terminal heartbeat cost and backfills only positive reported ledger totals', async () => {
		const { commands, db, sqlite } = database();
		const projectDir = await testTempDir('aidd-outcome-cost-');
		try {
			const record = {
				...createCliActiveRunRecord({
					backend: 'native',
					mode: 'coding',
					model: undefined,
					projectDir,
					provider: undefined,
					reasoningEffort: 'medium',
				}),
				costUsd: 2.5,
				exitCode: 0,
			};
			await commands.terminalizeRun({
				completedAt: record.startedAt + 1_000,
				continuationValue: 'none',
				durationMs: 1_000,
				finalStatus: 'completed',
				record,
			});
			expect(
				(
					await db
						.select({ costUsd: runs.costUsd })
						.from(runs)
						.where(eq(runs.id, record.id))
				)[0]?.costUsd,
			).toBe(2.5);

			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			await writeFile(
				join(projectDir, '.aidd', 'runs.jsonl'),
				[
					JSON.stringify({ runId: 'backfill-positive', totals: { costUsd: 4.75 } }),
					JSON.stringify({ runId: 'backfill-zero', totals: { costUsd: 0 } }),
					'',
				].join('\n'),
			);
			for (const id of ['backfill-positive', 'backfill-zero']) {
				await db.insert(runs).values({
					backend: 'native',
					id,
					projectName: 'cost-fixture',
					projectPath: projectDir,
					source: 'web',
					startedAt: Date.now(),
					status: 'completed',
				});
			}
			expect(await backfillRunCosts(db)).toBe(1);
			const costs = await db
				.select({ costUsd: runs.costUsd, id: runs.id })
				.from(runs)
				.where(eq(runs.projectPath, projectDir));
			expect(costs.find((row) => row.id === 'backfill-positive')?.costUsd).toBe(4.75);
			expect(costs.find((row) => row.id === 'backfill-zero')?.costUsd).toBeNull();
			expect(
				await db.select().from(settings).where(eq(settings.key, RUN_COST_BACKFILL_KEY)),
			).toHaveLength(1);
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});
});

describe('revert detection', () => {
	type Db = ReturnType<typeof database>['db'];

	async function repository(): Promise<string> {
		const projectDir = await testTempDir('aidd-outcome-revert-');
		git(projectDir, ['init', '-q']);
		await writeFile(join(projectDir, 'file.txt'), 'base\n');
		git(projectDir, ['add', '.']);
		git(projectDir, ['commit', '-q', '-m', 'chore: base']);
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		return projectDir;
	}

	async function attribute(projectDir: string, runId: string, hash: string): Promise<void> {
		await appendFile(
			join(projectDir, '.aidd', 'runs.jsonl'),
			`${JSON.stringify({ commitsCreated: [{ hash, subject: 'feat' }], runId })}\n`,
		);
	}

	async function commitChange(projectDir: string, runId: string): Promise<string> {
		await writeFile(join(projectDir, 'file.txt'), `${runId}\n`);
		git(projectDir, ['add', '.']);
		git(projectDir, ['commit', '-q', '-m', `feat: ${runId}`]);
		const hash = gitHead(projectDir);
		await attribute(projectDir, runId, hash);
		return hash;
	}

	function terminalRun(id: string, projectPath: string) {
		return {
			backend: 'native' as const,
			driverId: 'audit-review',
			driverKind: 'skill' as const,
			driverSha256: 'c'.repeat(64),
			id,
			projectName: 'revert-fixture',
			projectPath,
			source: 'web' as const,
			startedAt: Date.now(),
			status: 'completed' as const,
		};
	}

	async function revertedCommitsOf(db: Db, id: string): Promise<null | number | undefined> {
		const row = await db
			.select({ revertedCommits: runs.revertedCommits })
			.from(runs)
			.where(eq(runs.id, id));
		return row[0]?.revertedCommits;
	}

	async function cursorOf(db: Db, projectPath: string): Promise<unknown> {
		const row = await db
			.select({ value: settings.value })
			.from(settings)
			.where(eq(settings.key, revertDetectionCursorKey(projectPath)));
		const value = row[0]?.value;
		return typeof value === 'string' ? JSON.parse(value) : value;
	}

	test('sweeps a real revert, reports it by driver revision, and inspects runs added since', async () => {
		const { db, sqlite } = database();
		const projectDir = await repository();
		try {
			const attributed = await commitChange(projectDir, 'run-reverted');
			git(projectDir, ['revert', '--no-edit', attributed]);
			await db.insert(runs).values(terminalRun('run-reverted', projectDir));
			await db.insert(invocationEvents).values({
				backend: 'native',
				id: 'invocation-reverted',
				projectName: 'revert-fixture',
				projectPath: projectDir,
				resourceId: 'audit-review',
				resourceName: 'Audit finding review',
				resourceSha256: 'c'.repeat(64),
				resourceType: 'skill',
				runId: 'run-reverted',
				source: 'web',
				startedAt: Date.now(),
				status: 'completed',
			});

			expect(await sweepRevertedCommits(db)).toEqual({
				inspected: 1,
				projects: 1,
				skipped: 0,
				updated: 1,
			});
			expect(await revertedCommitsOf(db, 'run-reverted')).toBe(1);
			expect(
				(await getDriverRevertMeasures(db, { driverId: 'audit-review' }))[0],
			).toMatchObject({
				driverId: 'audit-review',
				revertRate: { denominator: 1, numerator: 1, value: 1 },
				revertedCommits: 1,
			});
			expect((await getSkillRevisionUsage(db, 'audit-review'))[0]?.revertRate).toEqual({
				denominator: 1,
				numerator: 1,
				value: 1,
			});
			expect(await cursorOf(db, projectDir)).toMatchObject({
				inspected: 1,
				state: 'swept',
				updated: 1,
			});
			expect(
				await db.select().from(settings).where(eq(settings.key, 'runs.revertDetection')),
			).toHaveLength(0);

			// A run recorded after the first sweep is inspected by the next one. The earlier run is
			// read again because it is still inside the window, and its unchanged row is not rewritten.
			await commitChange(projectDir, 'run-clean');
			await db.insert(runs).values(terminalRun('run-clean', projectDir));
			expect(await sweepRevertedCommits(db)).toEqual({
				inspected: 2,
				projects: 1,
				skipped: 0,
				updated: 1,
			});
			expect(await revertedCommitsOf(db, 'run-clean')).toBe(0);
			expect(await revertedCommitsOf(db, 'run-reverted')).toBe(1);
			expect(await cursorOf(db, projectDir)).toMatchObject({
				inspected: 2,
				state: 'swept',
				updated: 1,
			});
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});

	test('skips a project that is not a repository without blocking the others', async () => {
		const { db, sqlite } = database();
		const projectDir = await repository();
		const plainDir = await testTempDir('aidd-outcome-plain-');
		const missingDir = join(plainDir, 'missing');
		try {
			await commitChange(projectDir, 'run-ok');
			await mkdir(join(plainDir, '.aidd'), { recursive: true });
			await attribute(plainDir, 'run-plain', 'a'.repeat(40));
			await db
				.insert(runs)
				.values([
					terminalRun('run-plain', plainDir),
					terminalRun('run-missing', missingDir),
					terminalRun('run-ok', projectDir),
				]);

			expect(await sweepRevertedCommits(db)).toEqual({
				inspected: 1,
				projects: 3,
				skipped: 2,
				updated: 1,
			});
			expect(await revertedCommitsOf(db, 'run-ok')).toBe(0);
			expect(await revertedCommitsOf(db, 'run-plain')).toBeNull();
			expect(await revertedCommitsOf(db, 'run-missing')).toBeNull();
			expect(await cursorOf(db, plainDir)).toMatchObject({
				inspected: 0,
				reason: 'not-a-repository',
				state: 'skipped',
			});
			expect(await cursorOf(db, missingDir)).toMatchObject({
				reason: 'missing-directory',
				state: 'skipped',
			});
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
			await removeTempTree(plainDir);
		}
	});

	test('leaves a run NULL when its attributed commit is not in history', async () => {
		const { db, sqlite } = database();
		const projectDir = await repository();
		try {
			await attribute(projectDir, 'run-ghost', 'f'.repeat(40));
			await commitChange(projectDir, 'run-clean');
			await db
				.insert(runs)
				.values([
					terminalRun('run-ghost', projectDir),
					terminalRun('run-clean', projectDir),
				]);

			expect(await sweepRevertedCommits(db)).toEqual({
				inspected: 2,
				projects: 1,
				skipped: 0,
				updated: 1,
			});
			expect(await revertedCommitsOf(db, 'run-ghost')).toBeNull();
			expect(await revertedCommitsOf(db, 'run-clean')).toBe(0);
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});

	test('counts a revert inside the window on committer date and not one outside it', () => {
		const day = 24 * 60 * 60 * 1_000;
		const original = { at: 100 * day, hash: 'a'.repeat(40) };
		const revertAt = (at: number, target = 'a'.repeat(40)) => [
			{ at, hash: 'b'.repeat(40), targets: [target] },
		];
		expect(countRevertedCommits([original], revertAt(113 * day))).toBe(1);
		expect(countRevertedCommits([original], revertAt(115 * day))).toBe(0);
		// An abbreviated footer hash still matches; a revert dated before its original never does.
		expect(countRevertedCommits([original], revertAt(101 * day, 'a'.repeat(7)))).toBe(1);
		expect(countRevertedCommits([original], revertAt(99 * day))).toBe(0);
		// The same commit reverted twice counts once; a revert of some other commit counts nothing.
		expect(
			countRevertedCommits(
				[original, original],
				[...revertAt(101 * day), ...revertAt(102 * day)],
			),
		).toBe(1);
		expect(countRevertedCommits([original], revertAt(101 * day, 'c'.repeat(40)))).toBe(0);
	});
});
describe('read-time outcome groupings', () => {
	test('compares skill sha revisions and derives audit yield without persisting labels', async () => {
		const { db, sqlite } = database();
		const projectDir = await testTempDir('aidd-outcome-groups-');
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			await writeFile(
				join(projectDir, '.aidd', 'findings-ledger.jsonl'),
				[
					JSON.stringify(event('emitted', 'finding-a', fingerprintA)),
					JSON.stringify(event('remediated', 'finding-a', fingerprintA)),
					JSON.stringify(
						event('emitted', 'finding-b', fingerprintB, { runId: 'run-uncosted' }),
					),
					JSON.stringify(
						event('remediated', 'finding-b', fingerprintB, { runId: 'run-uncosted' }),
					),
					'',
				].join('\n'),
			);
			for (const [index, sha] of ['d'.repeat(64), 'e'.repeat(64)].entries()) {
				const runId = `skill-run-${index}`;
				await db.insert(runs).values({
					backend: 'native',
					costUsd: index === 0 ? 3 : null,
					id: runId,
					inputTokens: 100 + index,
					outputTokens: 20 + index,
					projectName: 'groups',
					projectPath: projectDir,
					source: 'web',
					startedAt: 100 + index,
					status: index === 0 ? 'completed' : 'failed',
				});
				await db.insert(invocationEvents).values({
					backend: 'native',
					id: `invocation-${index}`,
					projectName: 'groups',
					projectPath: projectDir,
					resourceId: 'audit-review',
					resourceName: 'Audit finding review',
					resourceSha256: sha,
					resourceType: 'skill',
					runId,
					source: 'web',
					startedAt: 100 + index,
					status: index === 0 ? 'completed' : 'failed',
				});
			}
			const auditRun = {
				backend: 'native' as const,
				driverKind: 'audit' as const,
				projectName: 'groups',
				projectPath: projectDir,
				source: 'web' as const,
				startedAt: 200,
				status: 'completed' as const,
			};
			await db.insert(runs).values([
				// A batch cost is shared evenly by the audits in the batch.
				{ ...auditRun, costUsd: 6, driverId: 'HYGIENE+SECURITY', id: 'run-audit' },
				// A recorded zero is a captured cost.
				{ ...auditRun, costUsd: 0, driverId: 'SECURITY', id: 'run-audit-zero' },
				// An uncosted run's accepted finding stays out of the cost denominator.
				{ ...auditRun, costUsd: null, driverId: 'SECURITY', id: 'run-uncosted' },
				// Another project's run never reaches this fleet slice.
				{
					...auditRun,
					costUsd: 100,
					driverId: 'SECURITY',
					id: 'run-elsewhere',
					projectPath: `${projectDir}-other`,
				},
			]);

			const revisions = await getSkillRevisionUsage(db, 'audit-review');
			expect(revisions).toHaveLength(2);
			expect(revisions.map((revision) => revision.resourceSha256)).toEqual([
				'e'.repeat(64),
				'd'.repeat(64),
			]);
			expect(revisions[1]).toMatchObject({
				completed: 1,
				runsWithTokenData: 1,
				totalTokens: 120,
			});
			const outcome = (await collectAuditOutcomes(db, [projectDir], ['SECURITY'])).get(
				'SECURITY',
			);
			expect(outcome?.acceptanceRate).toEqual({ denominator: 2, numerator: 2, value: 1 });
			expect(outcome?.degradedProjects).toBe(0);
			expect(outcome?.costPerAcceptedFinding).toEqual({
				acceptedFindings: 2,
				capturedRuns: 2,
				costedAcceptedFindings: 1,
				totalRuns: 3,
				value: 3,
			});
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});

	test('reports unreadable ledgers as degraded coverage and memoizes on the fingerprint', async () => {
		const projectDir = await testTempDir('aidd-outcome-degraded-');
		const cachedDir = await testTempDir('aidd-outcome-cached-');
		try {
			// A directory where the ledger file belongs is a read failure, not a missing ledger.
			await mkdir(join(projectDir, '.aidd', 'findings-ledger.jsonl'), { recursive: true });
			const degraded = (
				await collectAuditOutcomes(undefined, [projectDir], ['SECURITY'])
			).get('SECURITY');
			expect(degraded?.degradedProjects).toBe(1);
			expect(degraded?.acceptanceRate).toEqual({ denominator: 0, numerator: 0, value: null });

			let fingerprint = 'v1';
			const cache = new AuditOutcomeCache(() => Promise.resolve(fingerprint));
			await mkdir(join(cachedDir, '.aidd'), { recursive: true });
			const ledgerPath = join(cachedDir, '.aidd', 'findings-ledger.jsonl');
			await writeFile(ledgerPath, `${JSON.stringify(event('emitted', 'a', fingerprintA))}\n`);
			const first = (
				await collectAuditOutcomes(undefined, [cachedDir], ['SECURITY'], cache)
			).get('SECURITY');
			expect(first?.lifecycle.emitted).toBe(1);
			await writeFile(
				ledgerPath,
				`${JSON.stringify(event('emitted', 'a', fingerprintA))}\n${JSON.stringify(event('remediated', 'a', fingerprintA))}\n`,
			);
			// Same fingerprint: the ledger is not re-read.
			const stale = (
				await collectAuditOutcomes(undefined, [cachedDir], ['SECURITY'], cache)
			).get('SECURITY');
			expect(stale?.lifecycle.remediated).toBe(0);
			fingerprint = 'v2';
			const fresh = (
				await collectAuditOutcomes(undefined, [cachedDir], ['SECURITY'], cache)
			).get('SECURITY');
			expect(fresh?.lifecycle.remediated).toBe(1);
		} finally {
			await removeTempTree(projectDir);
			await removeTempTree(cachedDir);
		}
	});

	test('a definition without measures is returned without an outcome instead of throwing', () => {
		const definitions = [{ name: 'SECURITY' }, { name: 'UNKNOWN' }] as AuditDefinitionDto[];
		const outcomes = new Map([
			[
				'SECURITY',
				{
					acceptanceRate: { denominator: 0, numerator: 0, value: null },
					costPerAcceptedFinding: {
						acceptedFindings: 0,
						capturedRuns: 0,
						costedAcceptedFindings: 0,
						totalRuns: 0,
						value: null,
					},
					degradedProjects: 0,
					lifecycle: measureFindingLifecycle([]),
					recurrenceRate: { denominator: 0, numerator: 0, value: null },
				},
			],
		]);
		const attached = attachAuditOutcomes(definitions, outcomes, new Map());
		expect(attached[0]?.outcome).toBeDefined();
		expect(attached[1]?.name).toBe('UNKNOWN');
		expect(attached[1]?.outcome).toBeUndefined();
	});
});
