import type {
	BackendDefaultSettings,
	DirectAiSettings,
	TriumvirateSettings,
	WebConfigSettings,
} from '../../api/types.ts';

export function emptyBackendDefault(): BackendDefaultSettings {
	return {
		idleNudgeTimeoutSeconds: null,
		idleTimeoutSeconds: null,
		model: null,
	};
}

export function emptyTriumvirate(): TriumvirateSettings {
	return {
		execCli: null,
		execModel: null,
		overseerCli: null,
		overseerModel: null,
		secondaryCli: null,
		secondaryModel: null,
	};
}

export function emptyDirectAiSettings(): DirectAiSettings {
	return {
		apiKeyConfigured: false,
		baseUrl: null,
		enabled: false,
		model: null,
		provider: null,
		reasoningEffort: null,
		surfaces: {
			directorChat: false,
			directorCycle: false,
			projectAdvisor: false,
			runSummaries: false,
		},
		timeoutSeconds: null,
	};
}

export function createBlankSettings(): WebConfigSettings {
	return {
		allowedOrigins: [],
		allowRemote: false,
		applicationRoots: [''],
		applicationsRoot: null,
		auditModel: null,
		auditsEnabled: true,
		authTokenConfigured: false,
		backends: {},
		cli: 'native',
		codeModel: null,
		configPath: '',
		defaultProvider: null,
		directAi: emptyDirectAiSettings(),
		directorAutoCycleEnabled: false,
		directorAutoCycleIntervalHours: 12,
		directorChatAllowFileEdits: false,
		directorSuggestionGranularity: 'targeted',
		directorSuggestionMaxPerBucket: 3,
		dirtyTreeThreshold: null,
		hostname: '127.0.0.1',
		idleNudgeTimeoutSeconds: null,
		idleTimeoutSeconds: null,
		ignoredFolders: ['.git', 'data', 'dist', 'frontend', 'logs', 'node_modules', 'screenshots'],
		initModel: null,
		maxConcurrentRuns: 2,
		maxConsecutiveTimeoutRetries: null,
		maxIterations: null,
		maxTurns: null,
		model: null,
		noClean: false,
		noWorkBackoffMs: null,
		port: 3210,
		providers: {},
		quitOnAbort: null,
		rateLimitBackoffSeconds: null,
		rateLimitBufferSeconds: null,
		reasoningEffort: 'low',
		sharedDirs: [],
		sharedFiles: [],
		showSpernakitProject: false,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		spernakitTemplateRepo: null,
		telegram: {
			allowedChatIds: [],
			botTokenConfigured: false,
		},
		templates: [],
		timeoutSeconds: null,
		traceDataMovement: false,
		triumvirate: emptyTriumvirate(),
		useWorktrees: false,
	};
}

export function textValue(value: null | string): string {
	return value ?? '';
}

export function nullableText(value: string): null | string {
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

export function cleanIgnoredFolders(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function normalizeIgnoredFolders(settings: WebConfigSettings): WebConfigSettings {
	return {
		...settings,
		allowedOrigins: cleanIgnoredFolders(settings.allowedOrigins),
		directAi: settings.directAi ?? emptyDirectAiSettings(),
		ignoredFolders: cleanIgnoredFolders(settings.ignoredFolders),
		telegram: settings.telegram ?? { allowedChatIds: [], botTokenConfigured: false },
	};
}

export function numberValue(value: null | number): string {
	return value === null ? '' : String(value);
}

export function nullableNumber(value: string): null | number {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
}

export function describeListEntry(label: string, item: string, index: number): string {
	const trimmed = item.trim();
	return trimmed ? `${label} entry ${trimmed}` : `${label} entry ${index + 1}`;
}
