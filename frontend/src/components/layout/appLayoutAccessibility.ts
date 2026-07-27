export function activeExecutionCountAccessibleName(
	activeExecutionCount: number,
): string | undefined {
	if (activeExecutionCount === 0) return undefined;
	return `${activeExecutionCount} active ${
		activeExecutionCount === 1 ? 'execution' : 'executions'
	}`;
}

export function searchControlAccessibleName(collapsed: boolean): string | undefined {
	return collapsed ? 'Open command palette' : undefined;
}
