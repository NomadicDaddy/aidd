export function resolveTabFocusTarget<T extends string>(
	tabIds: readonly T[],
	currentId: T,
	key: string,
): T | undefined {
	const currentIndex = tabIds.indexOf(currentId);
	if (currentIndex === -1 || tabIds.length === 0) return undefined;
	const tabAt = (index: number): T | undefined =>
		tabIds[((index % tabIds.length) + tabIds.length) % tabIds.length];
	if (key === 'ArrowRight') return tabAt(currentIndex + 1);
	if (key === 'ArrowLeft') return tabAt(currentIndex - 1);
	if (key === 'Home') return tabIds[0];
	if (key === 'End') return tabIds[tabIds.length - 1];
	return undefined;
}
