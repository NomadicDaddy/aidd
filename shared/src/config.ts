export {
	defaultDirectorIntervalHours,
	defaultDirectorMaxPerBucket,
	defaultDirectorSuggestionGranularity,
} from './config/defaults.ts';
export {
	applyConfig,
	getUserConfigPath,
	readConfig,
	type ResolveConfigOptions,
	resolveConfig,
} from './config/read.ts';
export { isSynthesizedSpernakitTemplate } from './config/resolve-templates.ts';
export {
	normalizeAllowedOrigins,
	resolveMergedConfig,
	resolveProjectDirInput,
} from './config/resolve.ts';
export { configSchema, defaultIgnoredFolders, type PartialAiddConfig } from './config/schema.ts';
export type {
	DirectAiSurface,
	DirectAiSurfaceConfig,
	DirectorSuggestionGranularity,
	ResolvedBackendConfig,
	ResolvedChannelsConfig,
	ResolvedConfig,
	ResolvedDirectorConfig,
	ResolvedDirectorScheduleConfig,
	ResolvedDirectorSuggestionsConfig,
	ResolvedDirectAiConfig,
	ResolvedProjectTemplateConfig,
	ResolvedProviderConfig,
	ResolvedTelegramBridgeConfig,
	ResolvedTriumvirateConfig,
	ResolvedWebConfig,
} from './config/types.ts';
