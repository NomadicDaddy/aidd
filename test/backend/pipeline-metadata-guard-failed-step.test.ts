import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { AutoFixRunner } from '../../backend/src/services/pipeline/autoFixRunner.ts';
import type { HookRunner } from '../../backend/src/services/pipeline/hookRunner.ts';
import type { SessionLifecycle } from '../../backend/src/services/pipeline/sessionLifecycle.ts';
import type { StepDispatcher } from '../../backend/src/services/pipeline/stepDispatcher.ts';
import type { ExecutionContext } from '../../backend/src/services/pipeline/types.ts';
import type { RecipeStepDefinition } from '../../backend/src/types.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { pipelineStepResults } from '../../backend/src/db/schema.ts';
import {
	insertStepResult,
	markStepRowRunning,
} from '../../backend/src/services/pipeline/stepRowWriter.ts';
import { executeStep } from '../../backend/src/services/pipeline/stepRunner.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

const SESSION_ID = 'pipe_guard';

async function git(cwd: string, ...args: string[]): Promise<void> {
	const proc = Bun.spawn(['git', ...args], {
		cwd,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${await new Response(proc.stderr).text()}`);
	}
}

function lifecycle(db: ReturnType<typeof wrapWebDatabase>['db']): SessionLifecycle {
	return {
		completeStep: async (input: {
			completedAt: number;
			errorMessage?: string | undefined;
			resultId: string;
			status: string;
		}) => {
			await db
				.update(pipelineStepResults)
				.set({
					completedAt: input.completedAt,
					errorMessage: input.errorMessage ?? null,
					status: input.status as 'completed',
				})
				.where(eq(pipelineStepResults.id, input.resultId));
		},
		createStepResult: async (input: Parameters<typeof insertStepResult>[1]) =>
			insertStepResult(db, input),
		markStepRunning: async (resultId: string, startedAt: number) =>
			markStepRowRunning(db, resultId, startedAt),
		progress: { publishActive: async () => {} },
		setStepRunId: async () => {},
	} as unknown as SessionLifecycle;
}

// The boundary check ran only when the step's dispatch succeeded. A metadata-only step that wrote
// outside .aidd/ and then failed was never checked, so its writes stayed on disk and its failure
// message said nothing about them.
//
// A pipeline step runs in the live project tree, which the operator and other agents share, so the
// guard reports the write and fails the step without reverting it: there it cannot tell the step's
// writes from anyone else's, and reverting used to delete edits that were never the step's.
describe('metadata-only guard on a step that fails', () => {
	test('still checks the write boundary and reports the write, leaving the shared tree alone', async () => {
		const projectDir = await testTempDir('aidd-guard-failed-step-');
		const sqlite = new Database(':memory:');
		try {
			await git(projectDir, 'init');
			await git(projectDir, 'config', 'user.email', 'test@example.com');
			await git(projectDir, 'config', 'user.name', 'Test');
			await Bun.write(join(projectDir, 'README.md'), 'base\n');
			await git(projectDir, 'add', '.');
			await git(projectDir, 'commit', '-m', 'base');

			migrateWebDatabase(sqlite);
			sqlite.run(
				'INSERT INTO pipeline_sessions (id, parameters_json, project_name, project_path, recipe_id, recipe_name, started_at, status, total_steps, current_step_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
				[SESSION_ID, '{}', 'example', projectDir, 'recipe', 'Recipe', 500, 'running', 1, 0],
			);
			const { db } = wrapWebDatabase(sqlite);
			const context: ExecutionContext = {
				depth: 0,
				displayOrder: 0,
				initiator: 'operator',
				lineage: [],
				metadataOnly: true,
				parameters: {},
				projectDir,
				sessionId: SESSION_ID,
			};
			const step: RecipeStepDefinition = {
				configJson: {},
				id: 'recipe-step-1',
				name: 'Review',
				stepType: 'shell',
			};
			const outside = join(projectDir, 'src-written-by-step.ts');

			const outcome = await executeStep(
				{
					autoFix: {} as AutoFixRunner,
					dispatcher: {
						dispatch: async () => {
							await Bun.write(outside, 'export const leaked = true;\n');
							return { errorMessage: 'backend exited 1', exitCode: 1, ok: false };
						},
					} as unknown as StepDispatcher,
					hooks: {} as HookRunner,
					lifecycle: lifecycle(db),
					stopFlags: new Set<string>(),
				},
				step,
				context,
				1,
			);

			expect(outcome.ok).toBe(false);
			expect(outcome.errorMessage).toContain('backend exited 1');
			expect(outcome.errorMessage).toContain('src-written-by-step.ts');
			expect(outcome.errorMessage).toContain('NOT reverted');
			expect(outcome.errorMessage).not.toContain('writes reverted');
			expect(existsSync(outside)).toBe(true);
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});
});
