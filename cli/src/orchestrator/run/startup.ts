import type { ModeContext, ModeHandler } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { runRepoDir } from 'aidd-shared/plan/types';
import { randomUUID } from 'node:crypto';

import type { MoveFn, OrchestratorDeps, RunAccumulator } from './types.ts';

import { createModeHandler } from '../../modes/factory.ts';
import { captureDirtySourceBaseline } from './git.ts';
import { finalizePreRunCheck } from './pre-run-final-summary.ts';
import { IterationPromptContext } from './prompt-context.ts';
import { handlePromptEncodingGuard } from './prompt-encoding-guard.ts';
import { createRunAccumulator } from './run-accumulator.ts';
import { handlePreRunChecks } from './run-gates.ts';

interface ReadyStartup {
	acc: RunAccumulator;
	context: OrchestratorModeContext;
	kind: 'ready';
	mode: ModeHandler;
	promptContext: IterationPromptContext;
	runStartedAtMs: number;
}

interface OrchestratorModeContext extends ModeContext {
	rootDir: string;
}

interface ReturnedStartup {
	exitCode: number;
	kind: 'return';
}

type OrchestratorStartup = ReadyStartup | ReturnedStartup;

export async function initializeOrchestratorRun(
	plan: RunPlan,
	deps: OrchestratorDeps,
	move: MoveFn
): Promise<OrchestratorStartup> {
	const preCheckExit = await handlePreRunChecks(plan, deps, move);
	if (preCheckExit !== undefined) {
		await finalizePreRunCheck(deps, plan, preCheckExit);
		return { exitCode: preCheckExit.exitCode, kind: 'return' };
	}

	const runStartedAtMs = Date.now();
	const acc = createRunAccumulator(deps.runId ?? randomUUID(), runStartedAtMs);
	await captureDirtySourceBaseline(acc, runRepoDir(plan));
	const encodingGuardExit = await handlePromptEncodingGuard(plan, deps, acc, move);
	if (encodingGuardExit !== undefined) {
		return { exitCode: encodingGuardExit, kind: 'return' };
	}

	return {
		acc,
		context: {
			projectDir: runRepoDir(plan),
			rootDir: deps.rootDir,
			store: deps.store,
			...(deps.featureLeases ? { featureLeases: deps.featureLeases } : {}),
			...(deps.scoringRoots ? { scoringRoots: deps.scoringRoots } : {}),
		},
		kind: 'ready',
		mode: createModeHandler(plan),
		promptContext: new IterationPromptContext(runRepoDir(plan), deps.rootDir),
		runStartedAtMs,
	};
}
