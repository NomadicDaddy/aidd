export {
	defaultDirectorAutoLaunchAllowedRecipes,
	defaultDirectorAutoLaunchEnabled,
	defaultDirectorAutoLaunchMaxPerCycle,
	defaultDirectorAutoLaunchMaxRank,
	defaultDirectorAutoLaunchRiskCeiling,
	defaultDirectorIntervalHours,
	defaultDirectorMaxPerBucket,
	defaultDirectorSuggestionGranularity,
	defaults,
	defaultWebConfig,
} from './config/defaults.ts';
export {
	applyEnvSecrets,
	configFileCredentials,
	TELEGRAM_BOT_TOKEN_ENV,
	WEB_AUTH_TOKEN_ENV,
} from './config/env-secrets.ts';
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
