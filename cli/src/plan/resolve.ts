import type { ParsedArgs } from 'aidd-shared/args/index';
import type { ResolvedConfig } from 'aidd-shared/config';
import type {
	AiddMode,
	BackendName,
	FeatureFilter,
	PromptFragmentRef,
	RunPlan,
	TriumviratePlan,
} from 'aidd-shared/plan/types';

import { resolveRunRuntimeMetadata } from 'aidd-shared/plan/runtime-metadata';
import { resolve } from 'node:path';

function selectMode(args: ParsedArgs): AiddMode {
	if (args.directorMode) return 'director';
	if (args.auditMode || args.auditOnCompletionNames.length > 0) return 'audit';
	if (args.interviewMode) return 'interview';
	if (args.todoMode) return 'todo';
	if (args.validateMode || args.checkFeatures || args.checkArtifacts) return 'validate';
	// A directive run executes its supplied prompt verbatim and must not auto-select
	// or claim a feature from the backlog. This covers every custom-prompt surface —
	// `--directive` (recipe skill steps), `--prompt`, and `--skill` (which
	// app.ts compiles into customPrompt) — because compileDirective replaces the
	// entire base prompt, so coding-mode feature selection has nothing to act on.
	if (args.directiveMode || args.customPrompt !== undefined) return 'directive';
	return 'coding';
}

function phaseForMode(mode: AiddMode, args: ParsedArgs): string {
	if (args.customPrompt) return 'directive';
	if (args.inProgressMode) return 'in-progress';
	return mode;
}

// In-process backends (`native`, `ollama`, `lmstudio`) all run through NativeBackend and
// share the native tool-use prompt. There is no per-provider fragment on disk, so they all
// resolve to `native.md`; a per-name path like `prompts/_cli/ollama.md` does not exist and
// `readFragment` would swallow the ENOENT and silently contribute no backend prompt.
function backendFragmentPath(backend: string): string {
	const nativeBackends = new Set(['lmstudio', 'native', 'ollama']);
	const fragment = nativeBackends.has(backend) ? 'native' : backend;
	return `prompts/_cli/${fragment}.md`;
}

function promptFragments(
	mode: AiddMode,
	phase: string,
	args: ParsedArgs,
	backend: string,
): PromptFragmentRef[] {
	const fragments: PromptFragmentRef[] = [];
	if (backend && mode !== 'interview')
		fragments.push({ id: backend, kind: 'backend', path: backendFragmentPath(backend) });
	if (args.filterBy && args.filterValue) fragments.push({ id: 'feature-filter', kind: 'inline' });
	if (args.milestone) fragments.push({ id: 'milestone-filter', kind: 'inline' });
	if (args.feature) fragments.push({ id: 'feature-focus', kind: 'inline' });
	fragments.push({ id: phase, kind: 'phase', path: `prompts/${phase}.md` });
	if (mode === 'audit') {
		fragments.push({ id: 'audit-context', kind: 'audit' });
	}
	if (args.customPrompt) {
		fragments.push({ id: 'custom-directive', kind: 'inline' });
	}
	return fragments;
}

function resolveTriumviratePlan(
	args: ParsedArgs,
	config: ResolvedConfig,
	primaryBackend: BackendName,
	primaryModel: string | undefined,
): TriumviratePlan | undefined {
	if (!args.triumvirateMode) return undefined;
	if (args.directorMode) throw new Error('--triumvirate cannot be combined with --director');
	if (args.interviewMode) throw new Error('--triumvirate cannot be combined with --interview');
	if (args.checkFeatures)
		throw new Error('--triumvirate cannot be combined with --check-features');
	if (args.checkArtifacts)
		throw new Error('--triumvirate cannot be combined with --check-artifacts');

	const secondaryBackend = args.secondaryCli ?? config.triumvirate?.secondaryCli;
	const overseerBackend = args.overseerCli ?? config.triumvirate?.overseerCli;
	if (!secondaryBackend || !overseerBackend) {
		throw new Error(
			'--triumvirate requires --secondary-cli and --overseer-cli unless configured under triumvirate',
		);
	}
	const executionBackend = args.execCli ?? config.triumvirate?.execCli ?? overseerBackend;

	const primary: TriumviratePlan['primary'] = { backend: primaryBackend };
	if (primaryModel !== undefined) primary.model = primaryModel;
	const secondary: TriumviratePlan['secondary'] = { backend: secondaryBackend };
	const secondaryModel = args.secondaryModel ?? config.triumvirate?.secondaryModel;
	if (secondaryModel !== undefined) secondary.model = secondaryModel;
	const overseer: TriumviratePlan['overseer'] = { backend: overseerBackend };
	const overseerModel = args.overseerModel ?? config.triumvirate?.overseerModel;
	if (overseerModel !== undefined) overseer.model = overseerModel;
	const execution: TriumviratePlan['execution'] = { backend: executionBackend };
	const executionModel = args.execModel ?? config.triumvirate?.execModel ?? overseerModel;
	if (executionModel !== undefined) execution.model = executionModel;

	return { execution, overseer, primary, secondary };
}

export function resolveRunPlan(args: ParsedArgs, config: ResolvedConfig): RunPlan {
	const projectDir = config.projectDir ?? resolve(args.projectDir ?? process.cwd());
	const filters: FeatureFilter[] = [];
	if (args.filterBy && args.filterValue) {
		filters.push({ field: args.filterBy, value: args.filterValue });
	}
	if (args.inProgressMode) {
		filters.push({ field: 'status', value: 'in_progress' });
	}

	const mode = selectMode(args);
	const phase = phaseForMode(mode, args);
	const runtimeMetadata = resolveRunRuntimeMetadata(args, config, mode);

	const scope: RunPlan['scope'] = {
		filters,
		kind: mode === 'director' ? 'director' : 'project',
		maxIterations: config.maxIterations,
	};
	scope.projectDir = projectDir;
	if (args.specFile) scope.specFile = resolve(args.specFile);
	if (args.feature) scope.feature = args.feature;
	if (args.milestone) scope.milestone = args.milestone;
	if (args.auditFindings) scope.auditFindings = true;
	if (args.auditFindingsSource) scope.auditFindingsSource = args.auditFindingsSource;

	const prompt: RunPlan['prompt'] = {
		backend: config.cli,
		filters,
		fragments: promptFragments(mode, phase, args, config.cli),
		mode,
		phase,
		variables: {
			auditName: args.auditNames[0],
			auditNames: args.auditNames,
			auditOnCompletionNames: args.auditOnCompletionNames,
			director: args.directorMode,
			directorContextPath: args.directorContextPath,
			directorOutputPath: args.directorOutputPath,
			feature: args.feature,
			filters,
			fleetSummaryPath: args.fleetSummaryPath,
			interviewFile: args.interviewFile ?? '.aidd/questions.md',
			interviewQuestionNumber: 1,
			interviewTotalQuestions: 1,
			milestone: args.milestone,
			projectDir,
			specFile: args.specFile,
			suggestionSchemaPath: args.suggestionSchemaPath,
		},
	};
	if (args.customPrompt) prompt.customDirective = args.customPrompt;
	if (args.customPrompt && args.directiveReadonly) prompt.customDirectiveReadonly = true;
	if (args.skillId) prompt.skillId = args.skillId;
	if (args.feature) prompt.featureFocus = { directory: args.feature, value: args.feature };
	if (args.milestone) prompt.milestone = { featureDirectories: [], value: args.milestone };

	const plan: RunPlan = {
		backend: config.cli,
		checks: {
			artifacts: args.checkArtifacts,
			features: args.checkFeatures,
		},
		dirtyTreeThreshold: config.dirtyTreeThreshold,
		initGitAfterScaffold: args.initGitAfterScaffold === true,
		mode,
		noWorkBackoffMs: config.noWorkBackoffMs,
		outputPolicy: {
			extractBatch: args.extractBatch,
			extractStructured: args.extractStructured,
			idleNudgeTimeoutSeconds: config.idleNudgeTimeoutSeconds,
			idleTimeoutSeconds: config.idleTimeoutSeconds,
			noClean: config.noClean,
			preflightDoctor: config.preflightDoctor ?? true,
			rateLimitBackoffSeconds: config.rateLimitBackoffSeconds,
			rateLimitBufferSeconds: config.rateLimitBufferSeconds,
			timeoutSeconds: config.timeoutSeconds,
		},
		projectDir,
		prompt,
		reasoningEffort: runtimeMetadata.reasoningEffort,
		scope,
		simulation: args.simulation,
		stopBeforeImplementation: args.stopBeforeImplementation,
		stopPolicy: {
			continueOnTimeout: args.continueOnTimeout,
			maxConsecutiveTimeoutRetries: config.maxConsecutiveTimeoutRetries,
			quitOnAbort: config.quitOnAbort,
			stopFile: `${projectDir}/.aidd/.stop`,
			stopWhenDone: args.stopWhenDone,
		},
	};
	if (runtimeMetadata.model !== undefined) plan.model = runtimeMetadata.model;
	if (runtimeMetadata.provider !== undefined) plan.provider = runtimeMetadata.provider;
	if (args.thinking !== undefined) plan.thinking = args.thinking;
	if (args.thinkingLevel !== undefined) plan.thinkingLevel = args.thinkingLevel;
	if (config.maxCostUsd !== undefined || config.maxTokens !== undefined) {
		plan.budget = {
			...(config.maxCostUsd !== undefined ? { maxCostUsd: config.maxCostUsd } : {}),
			...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
		};
	}
	if (config.complexityTieredPlanning || args.complexityTiering) plan.complexityTiering = true;
	if (config.consistencyGateEnabled || args.consistencyGate) plan.consistencyGate = true;
	const triumvirate = resolveTriumviratePlan(args, config, config.cli, runtimeMetadata.model);
	if (triumvirate !== undefined) plan.triumvirate = triumvirate;
	if (args.writeAllowlist.length > 0) {
		if (plan.triumvirate) {
			throw new Error('--triumvirate cannot be combined with --write-allowlist');
		}
		plan.writeAllowlist = args.writeAllowlist;
	}

	if (filters[0]) plan.featureFilter = filters[0];
	if (args.auditMode || args.auditOnCompletionNames.length > 0) {
		const audit: RunPlan['audit'] = {
			codeAfterAudit: args.codeAfterAudit,
			names: args.auditNames,
			onCompletion: args.auditOnCompletionNames,
			runAll: args.auditAll,
		};
		if (args.auditNames[0]) audit.current = args.auditNames[0];
		plan.audit = audit;
	}
	if (args.directorMode) {
		if (!args.fleetSummaryPath || !args.directorOutputPath) {
			throw new Error('--director requires --fleet-summary and --director-output');
		}
		const director: RunPlan['director'] = {
			fleetSummaryPath: resolve(args.fleetSummaryPath),
			outputPath: resolve(args.directorOutputPath),
		};
		if (args.directorContextPath) {
			director.contextPath = resolve(args.directorContextPath);
		}
		if (args.suggestionSchemaPath) {
			director.suggestionSchemaPath = resolve(args.suggestionSchemaPath);
		}
		plan.director = director;
	}

	return plan;
}
