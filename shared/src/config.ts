export {
	defaultDirectorIntervalHours,
	defaultDirectorMaxPerBucket,
	defaultDirectorSuggestionGranularity,
} from './config/defaults.ts';
export { getUserConfigPath, readConfig, resolveConfig } from './config/read.ts';
export { isSynthesizedSpernakitTemplate } from './config/resolve-templates.ts';
export { normalizeAllowedOrigins, resolveMergedConfig } from './config/resolve.ts';
export { configSchema, defaultIgnoredFolders, type PartialAiddConfig } from './config/schema.ts';
export type {
	DirectAiSurface,
	DirectorSuggestionGranularity,
	ResolvedConfig,
	ResolvedProjectTemplateConfig,
	ResolvedTelegramBridgeConfig,
	ResolvedTriumvirateConfig,
	ResolvedWebConfig,
} from './config/types.ts';
