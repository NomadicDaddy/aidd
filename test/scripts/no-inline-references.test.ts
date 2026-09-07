import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SMOKE_QC_STEPS } from '../../scripts/smoke-qc.ts';
import { runNoInlineReferences } from '../../scripts/check-no-inline-references.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

/**
 * The gate is delivered by `sync-shared-core.ts` from the repository that owns it; these tests
 * exercise that copy rather than restating its logic.
 *
 * Unlike `git-window-hide.test.ts`, the fixtures here spell their offending call out. That gate
 * scans `test/`, so its fixtures had to be assembled from a constant or they would have been
 * findings in the test file itself. This one scans `backend/src/db/schema*` only, so a literal
 * `.references(` in this file is invisible to it. Do not copy the indirection across.
 */
function captureOutput(fn: () => number): { exitCode: number; output: string } {
	const originalError = console.error;
	const originalLog = console.log;
	let buffer = '';
	const collect = (...args: unknown[]) => {
		buffer += `${args.join(' ')}\n`;
	};
	console.error = collect;
	console.log = collect;
	try {
		const exitCode = fn();
		return { exitCode, output: buffer };
	} finally {
		console.error = originalError;
		console.log = originalLog;
	}
}

describe('check-no-inline-references tool', () => {
	test('passes against the current repository', () => {
		const { exitCode, output } = captureOutput(() => runNoInlineReferences(process.cwd()));
		expect(exitCode).toBe(0);
		expect(output).toContain('[OK]');
	});

	test('is wired into smoke:qc steps', () => {
		const stepNames = SMOKE_QC_STEPS.map((step) => step.name);
		expect(stepNames).toContain('check:no-inline-references');
	});

	test('flags an inline .references() in a schema file', async () => {
		const tmp = await testTempDir('aidd-no-inline-refs-');
		try {
			await mkdir(join(tmp, 'backend/src/db/schema'), { recursive: true });
			await writeFile(
				join(tmp, 'backend/src/db/schema', 'offender.ts'),
				[
					"export const runs = sqliteTable('runs', {",
					"\tid: text('id').references(() => other.id),",
					'});',
					'',
				].join('\n'),
			);

			const { exitCode, output } = captureOutput(() => runNoInlineReferences(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('backend/src/db/schema/offender.ts:2');
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('accepts a named foreignKey() declaration', async () => {
		const tmp = await testTempDir('aidd-no-inline-refs-ok-');
		try {
			await mkdir(join(tmp, 'backend/src/db/schema'), { recursive: true });
			await writeFile(
				join(tmp, 'backend/src/db/schema', 'good.ts'),
				[
					'foreignKey({',
					'\tcolumns: [table.pipelineSessionId],',
					'\tforeignColumns: [pipelineSessions.id],',
					"\tname: 'fk_runs_pipeline_session_id_pipeline_sessions',",
					"}).onDelete('set null');",
					'',
				].join('\n'),
			);

			const { exitCode } = captureOutput(() => runNoInlineReferences(tmp));
			expect(exitCode).toBe(0);
		} finally {
			await removeTempTree(tmp);
		}
	});

	/**
	 * `backend/src/db/schema-pg/` is spernakit's second dialect and does not exist here. It stays in
	 * the shared root list because this file is one delivered copy serving both layouts, and a root
	 * trimmed to what aidd happens to have would stop enforcing the rule where it was written.
	 */
	test('scans the second schema dialect the other carrier ships', async () => {
		const tmp = await testTempDir('aidd-no-inline-refs-pg-');
		try {
			await mkdir(join(tmp, 'backend/src/db/schema-pg'), { recursive: true });
			await writeFile(
				join(tmp, 'backend/src/db/schema-pg', 'tables.ts'),
				"\tuserId: uuid('user_id').references(() => users.id),\n",
			);

			const { exitCode, output } = captureOutput(() => runNoInlineReferences(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('backend/src/db/schema-pg/tables.ts:1');
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('fails rather than passing when no schema root exists', async () => {
		const tmp = await testTempDir('aidd-no-inline-refs-empty-');
		try {
			const { exitCode, output } = captureOutput(() => runNoInlineReferences(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('No schema files were examined');
		} finally {
			await removeTempTree(tmp);
		}
	});
});
