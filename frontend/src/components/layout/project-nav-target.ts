export function projectDetailTarget(projectId: string, currentSearch: string): string {
	const path = `/projects/${encodeURIComponent(projectId)}`;
	const tab = new URLSearchParams(currentSearch).get('tab');
	if (!tab) return path;

	const search = new URLSearchParams({ tab });
	return `${path}?${search.toString()}`;
}
