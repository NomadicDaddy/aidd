export function projectApiPath(id: string): string {
	return `/api/v1/projects/${encodeURIComponent(id)}`;
}
