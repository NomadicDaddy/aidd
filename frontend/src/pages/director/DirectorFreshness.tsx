import { useQueryClient } from '@tanstack/react-query';

import { DataFreshness } from '../../components/shared/DataFreshness.tsx';
import { type useDirector } from '../../hooks/useDirector.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';

/**
 * Director's freshness readout and refresh control.
 *
 * SYS-4: Director is one of the two most live surfaces in the panel and had no freshness readout,
 * so a cycle could finish and the page looked identical to one showing an hour-old answer.
 *
 * The refresh is `DashboardPage`'s shape deliberately — same trace, same refetch with
 * `throwOnError`, same every-fulfilled result — because the surfaces carrying this control should
 * refresh identically rather than each inventing a variant.
 *
 * `useDirector`'s own `refresh` is not reused: it invalidates, returns void, and exists to settle
 * caches after a mutation. `DataFreshness` needs a refetch it can await and report the outcome of.
 *
 * It is a component rather than an inline block because `DirectorPage` sat three lines under the
 * 300-line cap, so the control had nowhere to live in the page itself.
 */
export function DirectorFreshness({ director }: { director: ReturnType<typeof useDirector> }) {
	const queryClient = useQueryClient();

	async function refresh(): Promise<boolean> {
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'director.refresh',
			source: 'DirectorPage',
			summary: {
				queries: ['suggestions', 'director-cycles', 'director.fleet', 'director-profile'],
			},
		});
		const results = await Promise.allSettled([
			queryClient.refetchQueries({ queryKey: ['suggestions'] }, { throwOnError: true }),
			queryClient.refetchQueries({ queryKey: ['director-cycles'] }, { throwOnError: true }),
			queryClient.refetchQueries({ queryKey: ['director', 'fleet'] }, { throwOnError: true }),
			queryClient.refetchQueries({ queryKey: ['director-profile'] }, { throwOnError: true }),
		]);
		return results.every((result) => result.status === 'fulfilled');
	}

	return (
		<DataFreshness
			label="Director data"
			onRefresh={refresh}
			sources={[
				{ label: 'Suggestions', query: director.suggestions },
				{ label: 'Cycles', query: director.cycles },
				{ label: 'Fleet summary', query: director.fleet },
				{ label: 'Profile', query: director.profile },
			]}
		/>
	);
}
