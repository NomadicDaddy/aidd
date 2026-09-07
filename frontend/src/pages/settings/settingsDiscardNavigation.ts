export function discardSettingsChangesAndProceed(
	discardChanges: () => void,
	proceed: (() => void) | undefined,
): void {
	discardChanges();
	proceed?.();
}
