import type { WebConfigSettings } from '../../api/types.ts';
import type { SettingsTab } from './settingsNavigation.ts';

import { normalizeIgnoredFolders } from './settingsUtils.ts';

/**
 * Which tab edits which config key.
 *
 * The toolbar commits all five tabs at once, and `TabPanel` unmounts the inactive ones — so an
 * operator who edits Run Engine and switches to Integrations sees an armed Save button with no
 * indication of what is pending or where it lives. This map is what lets the tab trigger carry
 * that locator.
 *
 * `readOnlySettingsKeys` holds the fields the form reports but never edits. They are listed rather
 * than omitted so the exhaustiveness test can hold: a key that belongs to no tab would silently
 * never light a dot, which is the failure mode this whole map exists to prevent.
 */
export const settingsTabKeys: Record<SettingsTab, readonly (keyof WebConfigSettings)[]> = {
	'ai-director': [
		'auditModel',
		'auditsEnabled',
		'cli',
		'codeModel',
		'defaultProvider',
		'directAi',
		'directorAutoLaunchAllowedRecipes',
		'directorAutoLaunchEnabled',
		'directorAutoLaunchMaxPerCycle',
		'directorAutoLaunchMaxRank',
		'directorAutoLaunchRiskCeiling',
		'directorChatAllowFileEdits',
		'directorSuggestionGranularity',
		'directorSuggestionMaxPerBucket',
		'model',
		'providers',
		'reasoningEffort',
		'triumvirate',
	],
	'control-panel': ['allowRemote', 'allowedOrigins', 'hostname', 'port', 'traceDataMovement'],
	integrations: ['telegram'],
	'run-engine': [
		'backends',
		'dirtyTreeThreshold',
		'idleNudgeTimeoutSeconds',
		'idleTimeoutSeconds',
		'maxConcurrentRuns',
		'maxConsecutiveTimeoutRetries',
		'maxCostUsd',
		'maxIterations',
		'maxTokens',
		'maxTurns',
		'noClean',
		'noWorkBackoffMs',
		'quitOnAbort',
		'rateLimitBackoffSeconds',
		'rateLimitBufferSeconds',
		'timeoutSeconds',
		'useWorktrees',
	],
	workspace: [
		'applicationRoots',
		'applicationsRoot',
		'ignoredFolders',
		'showSpernakitProject',
		'sharedDirs',
		'sharedFiles',
		'spernakitInitScript',
		'spernakitTemplateRef',
		'spernakitTemplateRepo',
	],
};

/** Reported by the settings endpoint, rendered as context, never edited by the form. */
export const readOnlySettingsKeys: readonly (keyof WebConfigSettings)[] = [
	'authTokenConfigured',
	'configPath',
	'templates',
];

/**
 * The tabs whose fields differ from the saved config. Compared through the same
 * `normalizeIgnoredFolders` the page-level dirty check uses, so a tab never lights up for a
 * difference the toolbar does not consider dirty.
 */
export function dirtySettingsTabs(
	form: WebConfigSettings,
	saved: undefined | WebConfigSettings,
): ReadonlySet<SettingsTab> {
	const dirty = new Set<SettingsTab>();
	if (!saved) return dirty;
	const left = normalizeIgnoredFolders(form);
	const right = normalizeIgnoredFolders(saved);
	for (const [tab, keys] of Object.entries(settingsTabKeys) as [
		SettingsTab,
		readonly (keyof WebConfigSettings)[],
	][]) {
		if (keys.some((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key])))
			dirty.add(tab);
	}
	return dirty;
}
