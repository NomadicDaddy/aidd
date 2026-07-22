import type { useQueryClient } from '@tanstack/react-query';

export async function cancelProjectQueries(
	queryClient: ReturnType<typeof useQueryClient>,
	id: string | undefined
): Promise<void> {
	await Promise.all([
		queryClient.cancelQueries({ queryKey: ['project', id] }),
		queryClient.cancelQueries({ queryKey: ['project-reports', id] }),
		queryClient.cancelQueries({ queryKey: ['projects'] }),
		queryClient.cancelQueries({ queryKey: ['runs'] }),
		queryClient.cancelQueries({ queryKey: ['director', 'fleet'] }),
	]);
}

export function invalidateProjectQueries(
	queryClient: ReturnType<typeof useQueryClient>,
	id: string | undefined
): void {
	void queryClient.invalidateQueries({ queryKey: ['project', id] });
	void queryClient.invalidateQueries({ queryKey: ['project-reports', id] });
	void queryClient.invalidateQueries({ queryKey: ['projects'] });
	void queryClient.invalidateQueries({ queryKey: ['director', 'fleet'] });
}
