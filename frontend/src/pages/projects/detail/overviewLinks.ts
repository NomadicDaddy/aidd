export type LinkedDetailTab = 'artifacts' | 'features' | 'interview' | 'profile' | 'runs';

export function projectDetailTabSearch(
	tab: LinkedDetailTab,
	params: Record<string, string> = {},
): string {
	const searchParams = new URLSearchParams();
	searchParams.set('tab', tab);
	for (const [key, value] of Object.entries(params)) {
		if (value.length > 0) searchParams.set(key, value);
	}
	return `?${searchParams.toString()}`;
}
