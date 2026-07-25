import type { RunPlan } from 'aidd-shared/plan/types';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { runRepoDir } from 'aidd-shared/plan/types';

import type { MoveFn, OrchestratorDeps, RunAccumulator } from './types.ts';

import { findPromptArtifactEncodingViolations } from '../../metadata/text-encoding.ts';
import { formatEncodingViolationSummary } from '../formatters.ts';
import { writeRunSummary } from './artifacts.ts';
import { runPreflightDoctor } from './doctor.ts';

// Pre-iteration environment gates: prompt-artifact encoding sanity plus the preflight
// doctor's backend/toolchain probes. Both end the run in seconds with an actionable
// summary instead of letting the agent discover a broken environment mid-run.
export async function handlePromptEncodingGuard(
	plan: RunPlan,
	deps: OrchestratorDeps,
	acc: RunAccumulator,
	move: MoveFn,
): Promise<number | undefined> {
	if (plan.mode === 'director') return undefined;
	const doctor = await runPreflightDoctor(plan, { prober: deps.doctorProber });
	if (!doctor.ok) {
		console.error(doctor.summary);
		move({ summary: doctor.summary, type: 'complete' });
		return await writeRunSummary(
			deps,
			plan,
			acc,
			'blocked',
			orchestratorExitCodes.generalError,
			doctor.summary,
		);
	}
	const encodingViolations = await findPromptArtifactEncodingViolations(runRepoDir(plan));
	if (encodingViolations.length === 0) return undefined;
	const summary = formatEncodingViolationSummary(encodingViolations);
	console.error(summary);
	move({ summary, type: 'complete' });
	await writeRunSummary(
		deps,
		plan,
		acc,
		'exit_error',
		orchestratorExitCodes.validationError,
		summary,
	);
	return orchestratorExitCodes.validationError;
}
