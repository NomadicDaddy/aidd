export function activeExecutionCountAccessibleName(
	activeExecutionCount: number,
): string | undefined {
	if (activeExecutionCount === 0) return undefined;
	return `${activeExecutionCount} active ${
		activeExecutionCount === 1 ? 'execution' : 'executions'
	}`;
}

// Null while the count is still loading; zero renders no badge, so neither state has anything
// to announce.
export function projectCountAccessibleName(projectCount: null | number): string | undefined {
	if (projectCount === null || projectCount === 0) return undefined;
	return `${projectCount} discovered project${projectCount === 1 ? '' : 's'}`;
}

export function searchControlAccessibleName(collapsed: boolean): string | undefined {
	return collapsed ? 'Open command palette' : undefined;
}
