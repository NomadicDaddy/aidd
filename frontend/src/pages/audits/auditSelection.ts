// Pure selection helpers for the audit catalog multi-select. Keeping them outside CatalogTab makes
// select-all / clear / toggle behavior and header tri-state derivation unit-testable without
// mounting the component. The component delegates to these so there is a single source of truth for
// "operate on the visible + enabled audits only" and "a disabled audit can never be toggled on".

// Merge the visible enabled audit names into the current selection, de-duplicating. Names already
// selected (including any that are not currently visible) are preserved.
export function selectVisibleAudits(current: string[], visibleEnabledNames: string[]): string[] {
	return Array.from(new Set([...current, ...visibleEnabledNames]));
}

// Remove exactly the visible enabled audit names from the current selection, leaving any selected
// names that are not currently visible untouched.
export function clearVisibleAudits(current: string[], visibleEnabledNames: string[]): string[] {
	const visible = new Set(visibleEnabledNames);
	return current.filter((name) => !visible.has(name));
}

// Toggle a single audit's membership in the selection. Disabled audits (not in enabledDefinitionNames)
// are a no-op: the same array reference is returned so a disabled row can never enter the selection.
export function toggleAuditSelected(
	current: string[],
	name: string,
	enabledDefinitionNames: ReadonlySet<string>
): string[] {
	if (!enabledDefinitionNames.has(name)) return current;
	return current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
}

export interface VisibleSelectionState {
	allSelected: boolean;
	someSelected: boolean;
	visibleSelectedNames: string[];
}

// Derive the header tri-state from the visible enabled audits and the current selection.
// - allSelected: every visible enabled audit is selected (and there is at least one visible audit)
// - someSelected: at least one visible enabled audit is selected
export function deriveVisibleSelection(
	visibleEnabledNames: string[],
	selectedAuditNames: string[]
): VisibleSelectionState {
	const selectedSet = new Set(selectedAuditNames);
	const visibleSelectedNames = visibleEnabledNames.filter((name) => selectedSet.has(name));
	return {
		allSelected:
			visibleEnabledNames.length > 0 &&
			visibleSelectedNames.length === visibleEnabledNames.length,
		someSelected: visibleSelectedNames.length > 0,
		visibleSelectedNames,
	};
}
