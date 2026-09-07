import type { DirectorRiskLevel } from 'aidd-shared';
import type {
	DirectorSuggestionGranularity,
	ResolvedConfig,
	ResolvedWebConfig,
} from 'aidd-shared/config';
import type { BackendInputName, BackendName } from 'aidd-shared/plan/types';

import type { ReasoningEffort, WebConfigSettingsDto } from '../../types.ts';

export type WebRuntimeConfig = { web: ResolvedWebConfig } & ResolvedConfig;

export interface BackendDefaultSettingsInput {
	idleNudgeTimeoutSeconds?: null | number;
	idleTimeoutSeconds?: null | number;
	model?: null | string;
	reasoningEffort?: null | ReasoningEffort;
}

export interface TriumvirateSettingsInput {
	execCli?: BackendInputName | null;
	execModel?: null | string;
	overseerCli?: BackendInputName | null;
	overseerModel?: null | string;
	secondaryCli?: BackendInputName | null;
	secondaryModel?: null | string;
}

export interface DirectAiSurfaceSettingsInput {
	directorChat?: boolean;
	directorCycle?: boolean;
	projectAdvisor?: boolean;
	runSummaries?: boolean;
}

export interface DirectAiSettingsInput {
	apiKey?: null | string;
	baseUrl?: null | string;
	enabled?: boolean;
	model?: null | string;
	provider?: null | string;
	reasoningEffort?: null | ReasoningEffort;
	surfaces?: DirectAiSurfaceSettingsInput | null;
	timeoutSeconds?: null | number;
}

export interface ProviderSettingsInput {
	apiKey?: null | string;
	baseUrl?: null | string;
	model?: null | string;
	reasoningEffort?: null | ReasoningEffort;
}

export interface SharedFileEntryInput {
	source: string;
	target?: null | string;
}

export interface TelegramChannelSettingsInput {
	allowedChatIds?: number[];
	botToken?: null | string;
}

export interface WebConfigSettingsInput {
	allowedOrigins?: string[];
	allowRemote?: boolean;
	applicationRoots: string[];
	applicationsRoot?: null | string;
	auditModel?: null | string;
	auditsEnabled?: boolean;
	backends?: Partial<Record<BackendName, BackendDefaultSettingsInput>>;
	cli: BackendInputName;
	codeModel?: null | string;
	defaultProvider?: null | string;
	directAi?: DirectAiSettingsInput | null;
	directorAutoLaunchAllowedRecipes?: string[];
	directorAutoLaunchEnabled?: boolean;
	directorAutoLaunchMaxPerCycle?: number;
	directorAutoLaunchMaxRank?: number;
	directorAutoLaunchRiskCeiling?: DirectorRiskLevel;
	directorChatAllowFileEdits?: boolean;
	directorSuggestionGranularity?: DirectorSuggestionGranularity;
	directorSuggestionMaxPerBucket?: number;
	dirtyTreeThreshold?: null | number;
	hostname?: string;
	idleNudgeTimeoutSeconds?: null | number;
	idleTimeoutSeconds?: null | number;
	ignoredFolders: string[];
	maxConcurrentRuns?: number;
	maxConsecutiveTimeoutRetries?: null | number;
	maxCostUsd?: null | number;
	maxIterations?: null | number;
	maxTokens?: null | number;
	maxTurns?: null | number;
	model?: null | string;
	noClean?: boolean;
	noWorkBackoffMs?: null | number;
	port?: number;
	providers?: Record<string, ProviderSettingsInput>;
	quitOnAbort?: null | number;
	rateLimitBackoffSeconds?: null | number;
	rateLimitBufferSeconds?: null | number;
	reasoningEffort: ReasoningEffort;
	sharedDirs?: string[];
	sharedFiles?: SharedFileEntryInput[];
	showSpernakitProject?: boolean;
	spernakitInitScript?: null | string;
	spernakitTemplateRef?: null | string;
	spernakitTemplateRepo?: null | string;
	telegram?: null | TelegramChannelSettingsInput;
	timeoutSeconds?: null | number;
	traceDataMovement?: boolean;
	triumvirate?: null | TriumvirateSettingsInput;
	useWorktrees?: boolean;
}

export interface SettingsUpdateResult {
	config: WebConfigSettingsDto;
	resolvedConfig: WebRuntimeConfig;
}
