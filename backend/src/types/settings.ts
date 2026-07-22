import type { DirectorSuggestionGranularity } from 'aidd-shared/config';
import type { WebSocketEvent } from 'aidd-shared/contracts/websocket';
import type { BackendName } from 'aidd-shared/plan/types';

import type { ReasoningEffort } from './run.ts';

export interface DirectAiSurfaceSettingsDto {
	directorChat: boolean;
	directorCycle: boolean;
	projectAdvisor: boolean;
	runSummaries: boolean;
}

export interface DirectAiSettingsDto {
	apiKeyConfigured: boolean;
	baseUrl: null | string;
	enabled: boolean;
	model: null | string;
	provider: null | string;
	reasoningEffort: null | ReasoningEffort;
	surfaces: DirectAiSurfaceSettingsDto;
	timeoutSeconds: null | number;
}

export interface BackendDefaultSettingsDto {
	idleNudgeTimeoutSeconds: null | number;
	idleTimeoutSeconds: null | number;
	model: null | string;
}

export interface TriumvirateSettingsDto {
	execCli: BackendName | null;
	execModel: null | string;
	overseerCli: BackendName | null;
	overseerModel: null | string;
	secondaryCli: BackendName | null;
	secondaryModel: null | string;
}

export interface SharedFileEntryDto {
	source: string;
	target: null | string;
}

export interface ProviderSettingsDto {
	apiKeyConfigured: boolean;
	baseUrl: null | string;
	model: null | string;
	reasoningEffort: null | ReasoningEffort;
}

export interface TelegramChannelSettingsDto {
	allowedChatIds: number[];
	botTokenConfigured: boolean;
}

export interface ProjectTemplateSummaryDto {
	description: string;
	name: string;
	/** 'coding-run' scaffolds then launches a coding run (spernakit); 'ingest' scaffolds then
	 * runs metadata-only project-intake (third-party templates). */
	postCreate: 'coding-run' | 'ingest';
	requiresDescription: boolean;
	rootMustBeInitDir: boolean;
}

export interface WebConfigSettingsDto {
	allowedOrigins: string[];
	allowRemote: boolean;
	applicationRoots: string[];
	applicationsRoot: null | string;
	auditModel: null | string;
	auditsEnabled: boolean;
	authTokenConfigured: boolean;
	backends: Partial<Record<BackendName, BackendDefaultSettingsDto>>;
	cli: BackendName;
	codeModel: null | string;
	configPath: string;
	defaultProvider: null | string;
	directAi: DirectAiSettingsDto;
	directorAutoCycleEnabled: boolean;
	directorAutoCycleIntervalHours: number;
	directorChatAllowFileEdits: boolean;
	directorSuggestionGranularity: DirectorSuggestionGranularity;
	directorSuggestionMaxPerBucket: number;
	dirtyTreeThreshold: null | number;
	hostname: string;
	idleNudgeTimeoutSeconds: null | number;
	idleTimeoutSeconds: null | number;
	ignoredFolders: string[];
	initModel: null | string;
	maxConcurrentRuns: number;
	maxConsecutiveTimeoutRetries: null | number;
	maxIterations: null | number;
	maxTurns: null | number;
	model: null | string;
	noClean: boolean;
	noWorkBackoffMs: null | number;
	port: number;
	providers: Record<string, ProviderSettingsDto>;
	quitOnAbort: null | number;
	rateLimitBackoffSeconds: null | number;
	rateLimitBufferSeconds: null | number;
	reasoningEffort: ReasoningEffort;
	sharedDirs: string[];
	sharedFiles: SharedFileEntryDto[];
	showSpernakitProject: boolean;
	spernakitInitScript: null | string;
	spernakitTemplateRef: null | string;
	spernakitTemplateRepo: null | string;
	telegram: TelegramChannelSettingsDto;
	/** Registered project-creation templates (incl. the synthesized spernakit entry). */
	templates: ProjectTemplateSummaryDto[];
	timeoutSeconds: null | number;
	traceDataMovement: boolean;
	triumvirate: null | TriumvirateSettingsDto;
	useWorktrees: boolean;
}

export type SettingsToolStatus = 'available' | 'configured' | 'missing' | 'unavailable';

export interface SettingsCliStatusDto {
	authStatus: null | string;
	backend: BackendName;
	command: string;
	detail: string;
	status: SettingsToolStatus;
	version: null | string;
}

export interface SettingsSourceControlStatusDto {
	authStatus: null | string;
	command: null | string;
	detail: string;
	id: 'azure-devops' | 'git' | 'github' | 'gitlab';
	label: string;
	status: SettingsToolStatus;
	version: null | string;
}

// The wire contract for hub broadcasts lives in aidd-shared/contracts/websocket as the discriminated
// `WebSocketEvent` union (single source of truth). `WebSocketMessage` is kept as an alias so existing
// importers (the hub and ~6 emitter modules) need no churn while gaining compile-time enforcement.
export type WebSocketMessage = WebSocketEvent;
