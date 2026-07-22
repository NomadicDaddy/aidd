export type SettingsTab =
	'ai-director' | 'control-panel' | 'integrations' | 'run-engine' | 'workspace';

const settingsTabIds = new Set<SettingsTab>([
	'ai-director',
	'control-panel',
	'integrations',
	'run-engine',
	'workspace',
]);

export function readSettingsTab(value: null | string): SettingsTab {
	if (value && settingsTabIds.has(value as SettingsTab)) return value as SettingsTab;
	return 'workspace';
}

export function settingsTabSearchParams(
	current: URLSearchParams,
	tab: SettingsTab
): URLSearchParams {
	const next = new URLSearchParams(current);
	if (tab === 'workspace') next.delete('tab');
	else next.set('tab', tab);
	return next;
}
