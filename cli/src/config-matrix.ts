import type { BackendName } from 'aidd-shared/plan/types';

import { providerDefaults } from 'aidd-shared/agent/client';
import { type DirectAiSurface, getUserConfigPath, type ResolvedConfig } from 'aidd-shared/config';
import {
	resolveBackendDefaultModel,
	resolveBackendProvider,
	resolveBackendReasoningEffort,
} from 'aidd-shared/plan/runtime-metadata';

import { type ConfigMatrixRow, formatConfigMatrixTable } from './config-matrix-table.ts';

const directAiSurfaces: { label: string; surface: DirectAiSurface }[] = [
	{ label: 'Direct AI project advisor', surface: 'projectAdvisor' },
	{ label: 'Direct AI director chat', surface: 'directorChat' },
	{ label: 'Direct AI director cycle', surface: 'directorCycle' },
	{ label: 'Direct AI run summaries', surface: 'runSummaries' },
];

function display(value: string | undefined): string {
	return value && value.length > 0 ? value : 'not configured';
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}

function backendProvider(config: ResolvedConfig, backend: BackendName): string {
	return display(resolveBackendProvider(config, backend));
}

function backendModel(config: ResolvedConfig, backend: BackendName): string {
	return display(resolveBackendDefaultModel(config, backend));
}

function backendReasoning(config: ResolvedConfig, backend: BackendName): string {
	return resolveBackendReasoningEffort(config, backend);
}

function configuredModeModel(config: ResolvedConfig, kind: 'audit' | 'code'): string {
	if (kind === 'audit') return display(config.auditModel ?? config.model);
	return display(config.codeModel ?? config.model);
}

function knownProviderDefaultModel(provider: string): string | undefined {
	if (provider in providerDefaults) {
		return providerDefaults[provider as keyof typeof providerDefaults].model;
	}
	return undefined;
}

function directAiProvider(config: ResolvedConfig): string {
	return config.directAi?.provider ?? config.defaultProvider ?? 'zhipu';
}

function directAiConfiguredModel(config: ResolvedConfig, provider: string): string | undefined {
	return (
		config.directAi?.model ??
		config.providers?.[provider]?.model ??
		knownProviderDefaultModel(provider)
	);
}

function directAiReasoning(
	config: ResolvedConfig,
	provider: string,
	requestReasoning: string | undefined,
): string {
	return (
		requestReasoning ??
		config.directAi?.reasoningEffort ??
		config.providers?.[provider]?.reasoningEffort ??
		config.reasoningEffort
	);
}

function directAiModel(
	config: ResolvedConfig,
	provider: string,
	requestModel: string | undefined,
): string {
	return display(requestModel ?? directAiConfiguredModel(config, provider));
}

function directAiSurfaceRow(config: ResolvedConfig, surface: DirectAiSurface): ConfigMatrixRow {
	const directAi = config.directAi;
	const provider = directAiProvider(config);
	if (directAi?.enabled !== true || directAi.surfaces[surface] !== true) {
		return {
			backend: 'disabled',
			model: 'n/a',
			notes: 'Direct AI surface is disabled in config.',
			provider,
			reasoning: 'n/a',
			scenario: '',
		};
	}

	const directorSurface = surface === 'directorChat' || surface === 'directorCycle';
	const requestModel = directorSurface
		? (config.backends?.[config.cli]?.model ?? config.model)
		: undefined;
	const requestReasoning = config.reasoningEffort;
	return {
		backend: 'direct-ai',
		model: directAiModel(config, provider, requestModel),
		notes: directorSurface
			? 'Uses config-derived default director profile; persisted profile state is not inspected.'
			: 'Uses Direct AI provider config.',
		provider,
		reasoning: directAiReasoning(config, provider, requestReasoning),
		scenario: '',
	};
}

function configuredTriumvirateRoles(config: ResolvedConfig): string {
	const triumvirate = config.triumvirate;
	if (!triumvirate) return 'No triumvirate config found.';
	const roles = [
		triumvirate.secondaryCli ? `secondaryCli=${triumvirate.secondaryCli}` : undefined,
		triumvirate.overseerCli ? `overseerCli=${triumvirate.overseerCli}` : undefined,
		triumvirate.execCli ? `execCli=${triumvirate.execCli}` : undefined,
	].filter(isDefined);
	return roles.length > 0 ? `Configured ${roles.join(', ')}.` : 'No role CLIs configured.';
}

function addTriumvirateRows(rows: ConfigMatrixRow[], config: ResolvedConfig): void {
	const triumvirate = config.triumvirate;
	if (!triumvirate?.secondaryCli || !triumvirate.overseerCli) {
		const missing = [
			triumvirate?.secondaryCli ? undefined : 'secondaryCli',
			triumvirate?.overseerCli ? undefined : 'overseerCli',
		].filter(isDefined);
		rows.push({
			backend: 'not runnable',
			model: 'n/a',
			notes: `Missing ${missing.join(', ')}. ${configuredTriumvirateRoles(config)} execCli is execution-only and does not replace overseerCli.`,
			provider: 'n/a',
			reasoning: config.reasoningEffort,
			scenario: 'Triumvirate',
		});
		return;
	}

	rows.push({
		backend: config.cli,
		model: configuredModeModel(config, 'code'),
		notes: 'Primary planner uses the selected default CLI.',
		provider: backendProvider(config, config.cli),
		reasoning: config.reasoningEffort,
		scenario: 'Triumvirate primary',
	});
	rows.push({
		backend: triumvirate.secondaryCli,
		model: display(triumvirate.secondaryModel),
		notes: triumvirate.secondaryModel
			? 'Configured Triumvirate secondary model.'
			: 'No model flag is passed.',
		provider: backendProvider(config, triumvirate.secondaryCli),
		reasoning: config.reasoningEffort,
		scenario: 'Triumvirate secondary',
	});
	rows.push({
		backend: triumvirate.overseerCli,
		model: display(triumvirate.overseerModel),
		notes: triumvirate.overseerModel
			? 'Configured Triumvirate overseer model.'
			: 'No model flag is passed.',
		provider: backendProvider(config, triumvirate.overseerCli),
		reasoning: config.reasoningEffort,
		scenario: 'Triumvirate overseer',
	});
	const executionBackend = triumvirate.execCli ?? triumvirate.overseerCli;
	const executionModel = triumvirate.execModel ?? triumvirate.overseerModel;
	rows.push({
		backend: executionBackend,
		model: display(executionModel),
		notes: executionModel
			? 'Execution model comes from execModel, falling back to overseerModel.'
			: 'No execution model flag is passed.',
		provider: backendProvider(config, executionBackend),
		reasoning: config.reasoningEffort,
		scenario: 'Triumvirate execution',
	});
}

export function buildConfigMatrixRows(config: ResolvedConfig): ConfigMatrixRow[] {
	const rows: ConfigMatrixRow[] = [
		{
			backend: config.cli,
			model: backendModel(config, config.cli),
			notes: 'Selected default backend from resolved config.',
			provider: backendProvider(config, config.cli),
			reasoning: backendReasoning(config, config.cli),
			scenario: 'Normal run / web Runs launch',
		},
		{
			backend: config.cli,
			model: configuredModeModel(config, 'code'),
			notes: 'Applies codeModel when configured, then selected backend model.',
			provider: backendProvider(config, config.cli),
			reasoning: backendReasoning(config, config.cli),
			scenario: 'Coding / todo / validate / directive',
		},
		{
			backend: config.cli,
			model: configuredModeModel(config, 'audit'),
			notes: 'Applies auditModel when configured, then selected backend model.',
			provider: backendProvider(config, config.cli),
			reasoning: backendReasoning(config, config.cli),
			scenario: 'Audit',
		},
		{
			backend: 'native',
			model: backendModel(config, 'native'),
			notes: 'If native is explicitly selected.',
			provider: backendProvider(config, 'native'),
			reasoning: backendReasoning(config, 'native'),
			scenario: 'Explicit native backend',
		},
		{
			backend: 'ollama',
			model: backendModel(config, 'ollama'),
			notes: 'If ollama is explicitly selected.',
			provider: backendProvider(config, 'ollama'),
			reasoning: backendReasoning(config, 'ollama'),
			scenario: 'Explicit ollama backend',
		},
		{
			backend: 'lmstudio',
			model: backendModel(config, 'lmstudio'),
			notes: 'If lmstudio is explicitly selected.',
			provider: backendProvider(config, 'lmstudio'),
			reasoning: backendReasoning(config, 'lmstudio'),
			scenario: 'Explicit lmstudio backend',
		},
		{
			backend: 'openai',
			model: backendModel(config, 'openai'),
			notes: 'If openai is explicitly selected.',
			provider: backendProvider(config, 'openai'),
			reasoning: backendReasoning(config, 'openai'),
			scenario: 'Explicit openai backend',
		},
	];

	for (const entry of directAiSurfaces) {
		rows.push({ ...directAiSurfaceRow(config, entry.surface), scenario: entry.label });
	}

	addTriumvirateRows(rows, config);
	return rows;
}

export function formatConfigMatrix(config: ResolvedConfig): string {
	const rows = buildConfigMatrixRows(config);
	const table = formatConfigMatrixTable(rows);

	return [
		'Effective aidd config matrix',
		'',
		`User config:    ${getUserConfigPath()}`,
		config.projectDir
			? `Project config: ${config.projectDir}/.aidd/aidd.config.json`
			: 'Project config: none',
		'Runtime override flags are ignored for this report; pass --project-dir only to include project config.',
		'Secrets and provider base URLs are intentionally omitted.',
		'',
		table,
	].join('\n');
}
