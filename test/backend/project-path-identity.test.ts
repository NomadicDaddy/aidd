import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { eq, like } from 'drizzle-orm';

import { invocationEvents, runs, settings } from '../../backend/src/db/schema.ts';
import { canonicalProjectPath, encodeProjectId } from '../../backend/src/paths.ts';
import { AuditOutcomeCache } from '../../backend/src/services/outcome/auditOutcomeCache.ts';
import { collectAuditOutcomes } from '../../backend/src/services/outcome/auditOutcomes.ts';
import {
	backfillProjectPathIdentity,
	PROJECT_PATH_IDENTITY_KEY,
} from '../../backend/src/services/outcome/projectPathIdentityBackfill.ts';
import {
	REVERT_DETECTION_CURSOR_PREFIX,
	revertDetectionCursorKey,
	sweepRevertedCommits,
} from '../../backend/src/services/outcome/revertDetection.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { outcomeDatabase as database } from './_helpers/outcome-analytics.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

const onWindows = process.platform === 'win32';

/** The same directory spelled the way a shell on a different drive-letter case would spell it. */
function otherSpelling(path: string): string {
	return onWindows ? path.charAt(0).toUpperCase() + path.slice(1).toUpperCase() : path;
}

async function projectFixture(): Promise<{ canonical: string; root: string }> {
	const root = await testTempDir('aidd-path-identity-');
	const project = join(root, 'Mixed-Case');
	await mkdir(join(project, '.aidd'), { recursive: true });
	return { canonical: canonicalProjectPath(project), root };
}

function auditRun(id: string, projectPath: string) {
	return {
		backend: 'native' as const,
		costUsd: 2,
		driverId: 'SECURITY',
		driverKind: 'audit' as const,
		driverSha256: 'a'.repeat(64),
		id,
		projectName: 'Mixed-Case',
		projectPath,
		source: 'cli' as const,
		startedAt: Date.now(),
		status: 'completed' as const,
	};
}

describe('canonicalProjectPath', () => {
	test('collapses two spellings of one directory to a single value and project id', async () => {
		const { canonical, root } = await projectFixture();
		try {
			const other = otherSpelling(canonical);
			expect(canonicalProjectPath(other)).toBe(canonical);
			expect(canonicalProjectPath(canonical)).toBe(canonical);
			expect(encodeProjectId(canonicalProjectPath(other))).toBe(encodeProjectId(canonical));
			if (onWindows) {
				expect(other).not.toBe(canonical);
				expect(canonical.charAt(0)).toBe(canonical.charAt(0).toLowerCase());
				expect(canonical.endsWith('Mixed-Case')).toBe(true);
			} else {
				expect(canonical).toBe(resolve(root, 'Mixed-Case'));
			}
		} finally {
			await removeTempTree(root);
		}
	});

	test('lowercases segments that do not exist so a missing directory still has one spelling', async () => {
		const root = await testTempDir('aidd-path-identity-missing-');
		try {
			const missing = join(root, 'Never-Created');
			const canonical = canonicalProjectPath(missing);
			expect(canonicalProjectPath(otherSpelling(missing))).toBe(canonical);
			if (onWindows) expect(canonical.endsWith('never-created')).toBe(true);
			else expect(canonical).toBe(resolve(missing));
		} finally {
			await removeTempTree(root);
		}
	});
});

describe('project path identity backfill', () => {
	test('rewrites differently spelled rows once, removes the stale cursor, and then skips', async () => {
		const { db, sqlite } = database();
		const { canonical, root } = await projectFixture();
		try {
			const other = otherSpelling(canonical);
			await db.insert(runs).values(auditRun('run-other', other));
			await db.insert(runs).values(auditRun('run-canonical', canonical));
			await db.insert(invocationEvents).values({
				backend: 'native',
				id: 'invocation-other',
				projectName: 'Mixed-Case',
				projectPath: other,
				resourceId: 'audit-security',
				resourceName: 'SECURITY',
				resourceType: 'run',
				runId: 'run-other',
				source: 'cli',
				startedAt: Date.now(),
				status: 'completed',
			});
			await db.insert(settings).values({
				key: `${REVERT_DETECTION_CURSOR_PREFIX}${Buffer.from(other).toString('base64url')}`,
				value: '{}',
			});

			const first = await backfillProjectPathIdentity(db);
			expect(first.skipped).toBe(false);
			expect(first.rewritten).toBe(onWindows ? 2 : 0);
			expect(first.cursorsRemoved).toBe(onWindows ? 1 : 0);
			const paths = await db.select({ projectPath: runs.projectPath }).from(runs);
			expect(new Set(paths.map((row) => row.projectPath))).toEqual(
				new Set(onWindows ? [canonical] : [other, canonical]),
			);
			const invocation = await db
				.select({ projectPath: invocationEvents.projectPath })
				.from(invocationEvents)
				.where(eq(invocationEvents.id, 'invocation-other'));
			expect(invocation[0]?.projectPath).toBe(onWindows ? canonical : other);
			const flag = await db
				.select({ value: settings.value })
				.from(settings)
				.where(eq(settings.key, PROJECT_PATH_IDENTITY_KEY));
			expect(flag).toHaveLength(1);

			await db.insert(runs).values(auditRun('run-late', other));
			expect(await backfillProjectPathIdentity(db)).toEqual({
				cursorsRemoved: 0,
				duplicatesRemoved: 0,
				rewritten: 0,
				skipped: true,
			});
			const late = await db
				.select({ projectPath: runs.projectPath })
				.from(runs)
				.where(eq(runs.id, 'run-late'));
			expect(late[0]?.projectPath).toBe(other);
		} finally {
			sqlite.close();
			await removeTempTree(root);
		}
	});

	test('counts an audit run stored under the other spelling and keeps one revert cursor', async () => {
		const { db, sqlite } = database();
		const { canonical, root } = await projectFixture();
		try {
			const other = otherSpelling(canonical);
			await db.insert(runs).values(auditRun('run-cli', other));
			await db.insert(runs).values(auditRun('run-web', canonical));

			const outcomes = await collectAuditOutcomes(
				db,
				[canonical],
				['SECURITY'],
				new AuditOutcomeCache(),
			);
			expect(outcomes.get('SECURITY')?.costPerAcceptedFinding.totalRuns).toBe(2);

			await sweepRevertedCommits(db);
			const cursors = await db
				.select({ key: settings.key })
				.from(settings)
				.where(like(settings.key, `${REVERT_DETECTION_CURSOR_PREFIX}%`));
			expect(cursors.map((row) => row.key)).toEqual([revertDetectionCursorKey(canonical)]);
		} finally {
			sqlite.close();
			await removeTempTree(root);
		}
	});
});
