import type { ParsedArgs } from 'aidd-shared/args/index';
import type { RunPlan } from 'aidd-shared/plan/types';

import { detectInitialPhase } from 'aidd-shared/metadata/onboarding';
import { stopFilePath } from 'aidd-shared/metadata/paths';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { explicitFeatureTarget } from './modes/coding/selection.ts';

/**
 * Automatic initializer/onboarding detection applies only to *untargeted* coding runs.
 * A run that names its work — an explicit feature, an audit-findings sweep, or any selection
 * filter — is already actionable, even when the project's broader onboarding artifacts are
 * incomplete. Rewriting it to a phase prompt discards the requested selection and can repeat the
 * same completed work until max iterations.
 *
 * "Targeted" has to mean *any* filter, not just a single literal `--feature`/`id`. The remediation
 * recipes express their sweep as a wildcard (`--filter-by id --filter 'audit-*'`), and a project
 * whose backlog is only audit findings classifies as onboarding by design — which is exactly the
 * population those recipes run against. Reading a wildcard as "untargeted" therefore rewrote the
 * one run that most needed its selection honoured, and the sweep never happened.
 */
export function shouldDetectInitialPhase(plan: RunPlan): boolean {
	return (
		plan.mode === 'coding' &&
		plan.prompt.phase === 'coding' &&
		!plan.scope.auditFindings &&
		plan.scope.filters.length === 0 &&
		explicitFeatureTarget(plan) === undefined
	);
}

/**
 * Classify an untargeted coding run against the project on disk and, when the groundwork
 * is missing, rewrite it to run the initializer/onboarding phase prompt instead. Mutates
 * `plan` in place; a run that is already targeted or already past coding is left alone.
 */
export async function applyInitialPhaseDetection(plan: RunPlan): Promise<void> {
	if (!shouldDetectInitialPhase(plan)) return;
	// A newly created template already contains source code, but an explicit create-time spec
	// still needs the from-idea initializer contract (reviewed backlog + MVP roadmap), not the
	// existing-codebase onboarding contract.
	const detected = plan.scope.specFile
		? 'initializer'
		: await detectInitialPhase(plan.projectDir);
	if (detected === 'coding') return;
	plan.prompt.phase = detected;
	plan.prompt.fragments = plan.prompt.fragments.map((fragment) =>
		fragment.kind === 'phase'
			? { id: detected, kind: 'phase', path: `prompts/${detected}.md` }
			: fragment
	);
}

export async function handleStopSignal(
	args: ParsedArgs,
	resolvedProjectDir?: string,
	resolvedStopFile?: string
): Promise<boolean> {
	if (!args.stopSignal) return false;
	const projectDir = resolvedProjectDir ?? args.projectDir;
	if (!projectDir) throw new Error('--stop requires --project-dir');
	const stopFile = resolvedStopFile ?? stopFilePath(projectDir);
	await mkdir(dirname(stopFile), { recursive: true });
	await writeFile(stopFile, `${new Date().toISOString()}\n`);
	console.log(`Stop signal created: ${stopFile}`);
	console.log('Running aidd instance will stop after current iteration completes.');
	return true;
}

export async function assertProjectForRun(args: ParsedArgs): Promise<void> {
	if (args.directorMode || args.help || args.version || args.stopSignal || args.webMode) return;
	if (!args.projectDir) throw new Error('--project-dir is required');
	if (args.specFile) await access(args.specFile);
}

export async function clearStaleStopFile(projectDir: string, stopFile?: string): Promise<void> {
	await rm(stopFile ?? stopFilePath(projectDir), { force: true });
}
