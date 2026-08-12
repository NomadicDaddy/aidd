import type { BackendDefaultSettings } from '../../api/types.ts';

export function backendDefaultsEqual(
	current: BackendDefaultSettings,
	saved: BackendDefaultSettings,
): boolean {
	return (
		current.model === saved.model &&
		current.reasoningEffort === saved.reasoningEffort &&
		current.idleTimeoutSeconds === saved.idleTimeoutSeconds &&
		current.idleNudgeTimeoutSeconds === saved.idleNudgeTimeoutSeconds
	);
}

export function backendHasLocalDefaults(defaults: BackendDefaultSettings): boolean {
	return (
		defaults.model !== null ||
		defaults.reasoningEffort !== null ||
		defaults.idleTimeoutSeconds !== null ||
		defaults.idleNudgeTimeoutSeconds !== null
	);
}

export function effectiveBackendModel(
	defaults: BackendDefaultSettings,
	sharedModel: null | string | undefined,
): string {
	return defaults.model ?? sharedModel ?? 'Backend default';
}

export function nextBackendDisclosureExpanded(expanded: boolean, dirty: boolean): boolean {
	if (!expanded) return true;
	return dirty;
}

export function focusBackendDisclosureTrigger(
	trigger: null | Pick<HTMLButtonElement, 'focus'>,
): void {
	trigger?.focus({ preventScroll: true });
}
