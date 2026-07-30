import type { PromptPlan } from 'aidd-shared/plan/types';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CompiledPrompt } from './types.ts';

import {
	isProjectContextEmpty,
	loadProjectContext,
	type ProjectContextDigest,
} from '../metadata/projectContext.ts';
import { compileAuditPrompt } from './compile/audit.ts';
import { compileDependencyGraph } from './compile/dependency-graph.ts';
import { compileDependencyTopology } from './compile/dependency-topology.ts';
import { compileDirective } from './compile/directive.ts';
import { compileDirectorPrompt } from './compile/director.ts';
import { applyFilters } from './compile/filters.ts';
import { compileInterviewPrompt } from './compile/interview.ts';
import { type AppUrlStatus, renderLaunchContext } from './compile/launch-context.ts';
import { renderCodingPriorContext } from './compile/prior-context.ts';
import { compileResultContract } from './compile/result-contract.ts';
import { readFragment, stringArrayVariable, stringVariable } from './compile/shared.ts';

export interface PromptCompilerOptions {
	/** Set when this project gitignores `.aidd/`, so the launch context can say the metadata is
	 * untracked instead of every iteration rediscovering it with throwaway git commands. */
	aiddMetadataUntracked?: boolean;
	/** Live URL of the launcher-managed app this run verifies against (e.g. the web panel that
	 * launched a dogfood run). Appended to the prompt so the agent reuses it instead of starting
	 * its own server. */
	appUrl?: string;
	/** Result of probing `appUrl` just before this iteration compiled. When it is unreachable the
	 * launch context says so outright, so the agent parks instead of rediscovering it the hard way. */
	appUrlStatus?: AppUrlStatus;
	/** One-shot corrective note carried over from the previous iteration (e.g. a flailing nudge).
	 * Appended verbatim so the agent sees feedback at the start of its next attempt. */
	carryoverNote?: string;
	includeProjectContext?: boolean;
	includeRuntimeContext?: boolean;
	projectDir?: string;
	rootDir: string;
}

function sourcePath(plan: PromptPlan): string | undefined {
	return plan.fragments.find((fragment) => fragment.kind === 'phase')?.path;
}

function backendPath(plan: PromptPlan): string | undefined {
	return plan.fragments.find((fragment) => fragment.kind === 'backend')?.path;
}

async function loadProjectContextIfEnabled(
	plan: PromptPlan,
	options: PromptCompilerOptions,
): Promise<ProjectContextDigest | undefined> {
	if (options.includeProjectContext === false) return undefined;
	if (!options.projectDir) return undefined;
	const auditNames = resolveAuditNamesFromPlan(plan);
	return loadProjectContext(options.projectDir, auditNames.length > 0 ? { auditNames } : {});
}

function resolveAuditNamesFromPlan(plan: PromptPlan): string[] {
	if (plan.mode !== 'audit') return [];
	const list = stringArrayVariable(plan, 'auditNames');
	if (list.length > 0) return list;
	const single = stringVariable(plan, 'auditName');
	return single ? [single] : [];
}

async function compileBasePrompt(
	plan: PromptPlan,
	options: PromptCompilerOptions,
	priorContext: ProjectContextDigest | undefined,
): Promise<string> {
	if (plan.mode === 'interview') {
		// The generate-questions step supplies its work as a customDirective; falling through
		// to the interview Q&A template here sent the agent an answer-format prompt with an
		// empty question instead (observed: 30 iterations dutifully writing response1.md —
		// exactly what the wrong prompt instructed — while the questions file never appeared).
		if (plan.customDirective) {
			return compileDirective(plan.customDirective, plan.customDirectiveReadonly === true);
		}
		return compileInterviewPrompt(plan);
	}
	if (plan.mode === 'audit') return compileAuditPrompt(plan, options.rootDir, priorContext);
	if (plan.customDirective) {
		return compileDirective(plan.customDirective, plan.customDirectiveReadonly === true);
	}
	const base = await readFragment(options.rootDir, sourcePath(plan));
	if (priorContext && !isProjectContextEmpty(priorContext)) {
		return `${renderCodingPriorContext(priorContext)}\n\n---\n\n${base}`;
	}
	return base;
}

async function compileSourcePrompt(
	plan: PromptPlan,
	options: PromptCompilerOptions,
): Promise<string> {
	if (plan.mode === 'director') {
		return compileDirectorPrompt(await readFragment(options.rootDir, sourcePath(plan)), plan);
	}
	const priorContext = await loadProjectContextIfEnabled(plan, options);
	return compileBasePrompt(plan, options, priorContext);
}

async function applyBackend(plan: PromptPlan, rootDir: string, source: string): Promise<string> {
	const backend = await readFragment(rootDir, backendPath(plan));
	if (!backend.trim()) return source;
	return `${backend}\n\n---\n\n${source}`;
}

const guardrailFragments = [
	'prompts/_common/hard-constraints.md',
	'prompts/_common/forbidden-commands.md',
	'prompts/_common/artifact-git-policy.md',
] as const;

async function applyGuardrails(rootDir: string, source: string): Promise<string> {
	const parts: string[] = [];
	for (const path of guardrailFragments) {
		const fragment = await readFragment(rootDir, path);
		if (fragment.trim()) parts.push(fragment.trim());
	}
	if (parts.length === 0) return source;
	return `${parts.join('\n\n---\n\n')}\n\n---\n\n${source}`;
}

// The prompt fragments write browser steps against an `<app-url>` placeholder. Nothing ever
// substituted it, so agents read a literal `<app-url>` and fell back to framework defaults. Fill it
// in when the address is known; leave the placeholder untouched when it is not, so the fragment
// still reads as "determine this" rather than asserting a port we have not established.
function applyAppUrl(text: string, appUrl: string | undefined): string {
	return appUrl ? text.replaceAll('<app-url>', appUrl) : text;
}

export async function compilePrompt(
	plan: PromptPlan,
	options: PromptCompilerOptions,
): Promise<CompiledPrompt> {
	const source = await compileSourcePrompt(plan, options);
	const filtered = applyFilters(plan, source);
	const withBackend = await applyBackend(plan, options.rootDir, filtered);
	let text = applyAppUrl(await applyGuardrails(options.rootDir, withBackend), options.appUrl);
	const launchContext = renderLaunchContext(options);
	if (launchContext) text += `\n\n---\n\n${launchContext}`;
	// Immediately before the result contract, whose scope guard reads against `required_by`. Coding
	// modes attach the selected feature's neighborhood; audits attach whole-project topology. Each
	// renders empty without its data, so both are safe to try on every mode.
	for (const section of [compileDependencyGraph(plan), compileDependencyTopology(plan)]) {
		if (section) text += `\n\n---\n\n${section}`;
	}
	const resultContract = compileResultContract(plan);
	if (resultContract) text += `\n\n---\n\n${resultContract}`;

	if (options.includeRuntimeContext) {
		const variables = JSON.stringify(plan.variables, null, 2);
		text += `\n\n<!-- AIDD_V2_RUNTIME_CONTEXT\n${variables}\n-->`;
	}

	return {
		fragments: plan.fragments,
		snapshotKey: `${plan.backend}/${plan.mode}/${plan.phase}`,
		text,
	};
}

// Regenerates every backend × mode prompt snapshot. In `check` mode it compares instead of writing
// and fails on drift: the snapshots are the reviewable record of what each agent is actually told,
// so a prompt-source edit that skips regeneration silently decouples that record from the shipped
// prompt. Wired into smoke:qc, which is what makes regeneration non-optional at land-time.
async function runSnapshotTest(check: boolean): Promise<number> {
	const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
	const { parseArgs } = await import('aidd-shared/args/index');
	const { resolveRunPlan } = await import('../plan/resolve.ts');
	const config = {
		cli: 'native' as const,
		dirtyTreeThreshold: 50,
		idleNudgeTimeoutSeconds: 600,
		idleTimeoutSeconds: 900,
		maxConsecutiveTimeoutRetries: 2,
		maxIterations: 10,
		noClean: false,
		noWorkBackoffMs: 30_000,
		quitOnAbort: 0,
		rateLimitBackoffSeconds: 300,
		rateLimitBufferSeconds: 60,
		reasoningEffort: 'low' as const,
		timeoutSeconds: 3600,
	};
	const snapshotDir = join(rootDir, 'cli', 'src', 'prompts', 'snapshots');
	await mkdir(snapshotDir, { recursive: true });
	const { format, resolveConfig } = await import('prettier');
	const backends = [
		'native',
		'claude-code',
		'opencode',
		'kilocode',
		'codex',
		'cline',
		'grok',
	] as const;
	// Mirror the web Director's app-data cycle directory so the reviewable examples do not teach
	// callers to create unclassified runtime artifacts in project-owned .aidd metadata.
	const directorSnapshotDir = 'data/director';
	const modes: { args: string[]; name: string; phase?: string }[] = [
		{ args: [], name: 'coding' },
		// Initializer/onboarding are state-detected phases with no CLI flag (see
		// applyInitialPhaseDetection in preflight.ts); replicate its phase-fragment rewrite here so
		// their prompt sources are covered by the drift gate like every other phase.
		{ args: [], name: 'initializer', phase: 'initializer' },
		{ args: [], name: 'onboarding', phase: 'onboarding' },
		{ args: ['--todo'], name: 'todo' },
		{ args: ['--validate'], name: 'validate' },
		{ args: ['--audit', 'SECURITY'], name: 'audit' },
		{ args: ['--interview'], name: 'interview' },
		{
			args: [
				'--director',
				'--fleet-summary',
				`${directorSnapshotDir}/snapshot-fleet-summary.json`,
				'--director-output',
				`${directorSnapshotDir}/snapshot-output.json`,
			],
			name: 'director',
		},
		{
			args: ['--prompt', 'Refactor src/example.ts to extract a helper function.'],
			name: 'directive-mutation',
		},
		{
			args: [
				'--prompt',
				'Review src/example.ts and report any inconsistencies.',
				'--directive-readonly',
			],
			name: 'directive-readonly',
		},
	];
	const stale: string[] = [];
	for (const backend of backends) {
		for (const mode of modes) {
			const plan = resolveRunPlan(
				parseArgs(['--project-dir', '.', '--cli', backend, ...mode.args]),
				{ ...config, cli: backend },
			);
			const phase = mode.phase;
			if (phase) {
				plan.prompt.phase = phase;
				plan.prompt.fragments = plan.prompt.fragments.map((fragment) =>
					fragment.kind === 'phase'
						? { id: phase, kind: 'phase', path: `prompts/${phase}.md` }
						: fragment,
				);
			}
			const compiled = await compilePrompt(plan.prompt, {
				includeProjectContext: false,
				projectDir: plan.projectDir,
				rootDir,
			});
			const snapshotPath = join(snapshotDir, `${backend}-${mode.name}.md`);
			const prettierOptions = (await resolveConfig(snapshotPath)) ?? {};
			const rendered = await format(compiled.text, {
				...prettierOptions,
				parser: 'markdown',
			});
			if (check) {
				const committed = await readFile(snapshotPath, 'utf8').catch(() => null);
				if (committed !== rendered) stale.push(snapshotPath);
				continue;
			}
			await writeFile(snapshotPath, rendered);
			console.log(`Wrote ${snapshotPath}`);
		}
	}
	if (!check) return 0;
	if (stale.length === 0) {
		console.log('Prompt snapshots are up to date.');
		return 0;
	}
	console.error(
		`Prompt snapshots are stale (${stale.length}); a prompt source changed without regenerating them:`,
	);
	for (const path of stale) console.error(`  ${path}`);
	console.error('\nRun `bun run prompt:snapshot` and commit the result.');
	return 1;
}

if (import.meta.main && process.argv.includes('--snapshot-test')) {
	process.exit(await runSnapshotTest(process.argv.includes('--check')));
}
