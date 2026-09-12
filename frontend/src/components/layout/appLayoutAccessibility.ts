// The sidebar's destination counts name themselves in navBadges.ts, beside the tone each one
// carries; this module keeps the shell controls that have no count.
export function searchControlAccessibleName(collapsed: boolean): string | undefined {
	return collapsed ? 'Open command palette' : undefined;
}
