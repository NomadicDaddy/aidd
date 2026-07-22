import { useQuery } from '@tanstack/react-query';

import { getAllAppLaunchStatuses } from '../api/appLauncher.ts';

// Freshness is driven by the backend `app_launch` WebSocket event (see
// useRealtimeInvalidation), not client-side polling.
export function useAppLaunches() {
	return useQuery({
		queryFn: getAllAppLaunchStatuses,
		queryKey: ['app-launch-all'],
	});
}
