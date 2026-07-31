import type { BackendInputName, BackendName } from './skills.ts';

export type ReasoningEffort = 'high' | 'low' | 'medium' | 'minimal' | 'none' | 'xhigh';

export interface DirectAiSurfaceSettings {
	directorChat: boolean;
	directorCycle: boolean;
	projectAdvisor: boolean;
	runSummaries: boolean;
}

export interface DirectAiSettings {
	apiKey?: null | string;
	apiKeyConfigured: boolean;
	baseUrl: null | string;
	enabled: boolean;
	model: null | string;
	provider: null | string;
	reasoningEffort: null | ReasoningEffort;
	surfaces: DirectAiSurfaceSettings;
	timeoutSeconds: null | number;
}

export interface BackendDefaultSettings {
	idleNudgeTimeoutSeconds: null | number;
	idleTimeoutSeconds: null | number;
	model: null | string;
	reasoningEffort: null | ReasoningEffort;
}

export interface TriumvirateSettings {
	execCli: BackendInputName | null;
	execModel: null | string;
	overseerCli: BackendInputName | null;
	overseerModel: null | string;
	secondaryCli: BackendInputName | null;
	secondaryModel: null | string;
}

export interface SharedFileEntry {
	source: string;
	target: null | string;
}

export interface ProviderSettings {
	apiKey?: null | string;
	apiKeyConfigured: boolean;
	baseUrl: null | string;
	model: null | string;
	reasoningEffort: null | ReasoningEffort;
}

export interface TelegramChannelSettings {
	allowedChatIds: number[];
	botToken?: null | string;
	botTokenConfigured: boolean;
}

export interface ProjectTemplateSummary {
	description: string;
	name: string;
	postCreate: 'coding-run' | 'ingest';
	requiresDescription: boolean;
	rootMustBeInitDir: boolean;
}

export interface WebConfigSettings {
	allowedOrigins: string[];
	allowRemote: boolean;
	applicationRoots: string[];
	applicationsRoot: null | string;
	auditModel: null | string;
	auditsEnabled: boolean;
	authTokenConfigured: boolean;
	backends: Partial<Record<BackendName, BackendDefaultSettings>>;
	cli: BackendInputName;
	codeModel: null | string;
	configPath: string;
	defaultProvider: null | string;
	directAi: DirectAiSettings;
	directorAutoCycleEnabled: boolean;
	directorAutoCycleIntervalHours: number;
	directorChatAllowFileEdits: boolean;
	directorSuggestionGranularity: 'aggregate' | 'targeted';
	directorSuggestionMaxPerBucket: number;
	dirtyTreeThreshold: null | number;
	hostname: string;
	idleNudgeTimeoutSeconds: null | number;
	idleTimeoutSeconds: null | number;
	ignoredFolders: string[];
	initModel: null | string;
	maxConcurrentRuns: number;
	maxConsecutiveTimeoutRetries: null | number;
	maxCostUsd: null | number;
	maxIterations: null | number;
	maxTokens: null | number;
	maxTurns: null | number;
	model: null | string;
	noClean: boolean;
	noWorkBackoffMs: null | number;
	port: number;
	providers: Record<string, ProviderSettings>;
	quitOnAbort: null | number;
	rateLimitBackoffSeconds: null | number;
	rateLimitBufferSeconds: null | number;
	reasoningEffort: ReasoningEffort;
	sharedDirs: string[];
	sharedFiles: SharedFileEntry[];
	showSpernakitProject: boolean;
	spernakitInitScript: null | string;
	spernakitTemplateRef: null | string;
	spernakitTemplateRepo: null | string;
	telegram: TelegramChannelSettings;
	templates: ProjectTemplateSummary[];
	timeoutSeconds: null | number;
	traceDataMovement: boolean;
	triumvirate: null | TriumvirateSettings;
	useWorktrees: boolean;
}

export type SettingsToolStatus = 'available' | 'configured' | 'missing' | 'unavailable';

export interface SettingsCliStatus {
	authStatus: null | string;
	backend: BackendName;
	command: string;
	detail: string;
	status: SettingsToolStatus;
	version: null | string;
}

export interface SettingsSourceControlStatus {
	authStatus: null | string;
	command: null | string;
	detail: string;
	id: 'azure-devops' | 'git' | 'github' | 'gitlab';
	label: string;
	status: SettingsToolStatus;
	version: null | string;
}
