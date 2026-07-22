import type { PersistedReasoningEffortValue } from '../args/constants.ts';
import type { BackendName } from '../plan/types.ts';
import type { PartialAiddConfig } from './schema.ts';

export type DirectAiSurface = 'directorChat' | 'directorCycle' | 'projectAdvisor' | 'runSummaries';

export interface DirectAiSurfaceConfig {
	directorChat: boolean;
	directorCycle: boolean;
	projectAdvisor: boolean;
	runSummaries: boolean;
}

export interface ResolvedDirectAiConfig {
	baseUrl?: string | undefined;
	enabled: boolean;
	model?: string | undefined;
	provider?: string | undefined;
	reasoningEffort?: PersistedReasoningEffortValue | undefined;
	surfaces: DirectAiSurfaceConfig;
	timeoutSeconds: number;
}

export interface ResolvedDirectorChatConfig {
	allowFileEdits: boolean;
}

export interface ResolvedDirectorScheduleConfig {
	/** When true, the web process auto-runs a fleet cycle on the configured cadence. */
	enabled: boolean;
	/** Hours between automatic cycles (and the startup staleness threshold). */
	intervalHours: number;
}

export type DirectorSuggestionGranularity = 'aggregate' | 'targeted';

export interface ResolvedDirectorSuggestionsConfig {
	/**
	 * 'targeted' surfaces one suggestion per concrete artifact (top N per bucket) plus a
	 * rollup for the remainder; 'aggregate' keeps the legacy single-bucket suggestion.
	 */
	granularity: DirectorSuggestionGranularity;
	/** Max individual artifacts surfaced per backlog bucket before they roll up. */
	maxPerBucket: number;
}

export interface ResolvedDirectorConfig {
	chat: ResolvedDirectorChatConfig;
	schedule: ResolvedDirectorScheduleConfig;
	suggestions: ResolvedDirectorSuggestionsConfig;
}

export interface ResolvedProviderConfig {
	apiKey?: string | undefined;
	baseUrl?: string | undefined;
	model?: string | undefined;
	reasoningEffort?: PersistedReasoningEffortValue | undefined;
}

export interface ResolvedBackendConfig {
	idleNudgeTimeoutSeconds?: number | undefined;
	idleTimeoutSeconds?: number | undefined;
	model?: string | undefined;
	timeoutSeconds?: number | undefined;
}

export interface ResolvedConfig {
	applicationsRoot?: string;
	auditModel?: string;
	auditsEnabled?: boolean;
	backends?: Partial<Record<BackendName, ResolvedBackendConfig>>;
	channels?: ResolvedChannelsConfig;
	cli: BackendName;
	codeModel?: string;
	complexityTieredPlanning?: boolean;
	consistencyGateEnabled?: boolean;
	defaultProvider?: string;
	directAi?: ResolvedDirectAiConfig;
	director?: ResolvedDirectorConfig;
	dirtyTreeThreshold: number;
	idleNudgeTimeoutSeconds: number;
	idleTimeoutSeconds: number;
	initModel?: string;
	maxConsecutiveTimeoutRetries: number;
	maxCostUsd?: number;
	maxIterations: null | number;
	maxTokens?: number;
	model?: string;
	noClean: boolean;
	noWorkBackoffMs: number;
	/** Run the fast backend/toolchain preflight probes before the first iteration (default true). */
	preflightDoctor?: boolean;
	projectDir?: string;
	providers?: Record<string, ResolvedProviderConfig>;
	quitOnAbort: number;
	rateLimitBackoffSeconds: number;
	rateLimitBufferSeconds: number;
	reasoningEffort: PersistedReasoningEffortValue;
	sharedDirs?: string[];
	sharedFiles?: ({ source: string; target?: string | undefined } | string)[];
	sharedModel?: string;
	timeoutSeconds: number;
	triumvirate?: ResolvedTriumvirateConfig;
	web?: ResolvedWebConfig;
}

export interface ResolvedTelegramBridgeConfig {
	allowedChatIds: number[];
	botToken: string;
}

export interface ResolvedChannelsConfig {
	telegram?: ResolvedTelegramBridgeConfig;
}

export interface ResolvedProjectTemplateConfig {
	cwd: 'root' | 'targetPath';
	description: string;
	/** argv; {name} {description} {targetPath} {root} substituted at run time. */
	initCommand: string[];
	name: string;
	postCreate: 'coding-run' | 'ingest';
	requiresDescription: boolean;
	rootMustBeInitDir: boolean;
	validationCommand: null | string;
}

export interface ResolvedWebConfig {
	allowedOrigins: string[];
	allowedRoots: string[];
	allowRemote: boolean;
	/** Inbound bearer token; when set, non-loopback callers must present it. */
	authToken?: string;
	/** Max auto-launched follow-up runs per chain (counted from the original run). */
	autoChainLimit: number;
	/** Opt-in: auto-launch a follow-up run when a coding run ends continuation-eligible
	 * (wall-clock timeout with incomplete selected features, or initializer completion). */
	autoChainRuns: boolean;
	dataDir: string;
	hostname: string;
	ignoredFolders: string[];
	maxConcurrentRuns: number;
	/** Per-project cap on concurrent non-terminal runs (each isolated in its own worktree). */
	maxConcurrentRunsPerProject: number;
	port: number;
	/** When true, the spernakit template checkout is listed on the projects page (hidden by default). */
	showSpernakitProject: boolean;
	/** Fleet manifest (spernakit.psd1) used for Spernakit-derived detection during intake. */
	spernakitFleetManifest: null | string;
	spernakitInitScript: null | string;
	/** Git ref (tag/branch) to clone when provisioning spernakit on demand; null = default branch. */
	spernakitTemplateRef: null | string;
	/** owner/repo cloned when spernakit is created without a local checkout configured. */
	spernakitTemplateRepo: string;
	/** Project-creation templates. The spernakit entry is synthesized from
	 * spernakitInitScript when set; explicit web.templates entries override by name. */
	templates: ResolvedProjectTemplateConfig[];
	traceDataMovement: boolean;
	/** When true, web/Director-launched coding runs execute in an isolated git worktree. */
	useWorktrees: boolean;
}

export type ResolvedTriumvirateConfig = NonNullable<PartialAiddConfig['triumvirate']>;
