import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as Square } from 'lucide-react/dist/esm/icons/square';
import { toast } from 'sonner';

import type { AppLaunch } from '../../api/types.ts';

import { getAppLaunchStatus, startApp, stopApp } from '../../api/appLauncher.ts';
import { retryUnlessClientError } from '../../api/retry.ts';
import { Button } from '../ui/button.tsx';

interface AppLaunchControlProps {
	/** Optional context (e.g. project name) appended to button accessible names. */
	accessibleContext?: string | undefined;
	compact?: boolean;
	projectId: string;
	/**
	 * When false, the control never issues its own /status/:id request and renders
	 * purely from the `status` supplied by a parent batch query (useAppLaunches).
	 * List views set this to avoid an N+1 fan-out of one request per project; the
	 * brief pre-batch window shows the loading state instead. Defaults to true so
	 * standalone usages (e.g. the project detail page) still self-fetch.
	 */
	selfFetch?: boolean;
	status?: AppLaunch | undefined;
}

export function AppLaunchControl({
	accessibleContext,
	compact = false,
	projectId,
	selfFetch = true,
	status,
}: AppLaunchControlProps) {
	const withContext = (label: string) =>
		accessibleContext ? `${label} — ${accessibleContext}` : label;
	const queryClient = useQueryClient();
	// One-shot fetch only when self-fetching and no cached parent status is supplied;
	// further freshness comes from the backend `app_launch` WebSocket event (see
	// useRealtimeInvalidation), not client-side polling.
	const query = useQuery({
		enabled: selfFetch && status === undefined,
		queryFn: () => getAppLaunchStatus(projectId),
		queryKey: ['app-launch', projectId],
		retry: retryUnlessClientError,
	});
	const current: AppLaunch | undefined = status ?? query.data;
	const unavailable = current !== undefined && current.command === '';
	// While not self-fetching, "no status yet" means the batch query is still loading.
	const loading = current === undefined && (selfFetch ? query.isPending : status === undefined);

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: ['app-launch', projectId] });
		void queryClient.invalidateQueries({ queryKey: ['app-launch-all'] });
	};

	const startMutation = useMutation({
		mutationFn: () => startApp(projectId),
		onError: (error: Error) => toast.error(`Start failed: ${error.message}`),
		onSettled: invalidate,
		onSuccess: (data) => toast.success(`App started (pid ${data.pid ?? 'unknown'})`),
	});

	const stopMutation = useMutation({
		mutationFn: () => stopApp(projectId),
		onError: (error: Error) => toast.error(`Stop failed: ${error.message}`),
		onSettled: invalidate,
		onSuccess: () => toast.success('App stopped'),
	});

	const isMutating = startMutation.isPending || stopMutation.isPending;
	const running = current?.status === 'running';
	const crashed = current?.status === 'crashed';
	const runningTitle = current?.pid === null ? 'Running' : `Running (pid ${current?.pid})`;

	if (loading) {
		return (
			<Button
				aria-label={withContext('Checking app launch status')}
				disabled
				size={compact ? 'compact' : 'default'}
				title="Checking app launch status…"
				variant="secondary">
				<Loader2 className="h-4 w-4 animate-spin" />
				<span>Checking…</span>
			</Button>
		);
	}

	if (isMutating) {
		const pendingLabel = startMutation.isPending ? 'Starting app' : 'Stopping app';
		const pendingText = startMutation.isPending ? 'Starting…' : 'Stopping…';
		return (
			<Button
				aria-label={withContext(pendingLabel)}
				disabled
				size={compact ? 'compact' : 'default'}
				title={pendingText}
				variant="secondary">
				<Loader2 className="h-4 w-4 animate-spin" />
				<span>{pendingText}</span>
			</Button>
		);
	}

	if (running) {
		return (
			<Button
				aria-label={withContext('Stop app')}
				onClick={() => stopMutation.mutate()}
				size={compact ? 'compact' : 'default'}
				title={runningTitle}
				variant="danger">
				<Square className="h-4 w-4" />
				<span>Stop</span>
			</Button>
		);
	}

	if (unavailable) {
		const unavailableLabel = 'App launch unavailable — no dev or start script configured';
		// One control, both densities. The full-size branch used to set the same sentence a second
		// time as visible prose beside the button, which in the project header read as a loose
		// unattributed line next to a button whose tooltip already said it.
		return (
			<Button
				aria-label={withContext(unavailableLabel)}
				disabled
				size={compact ? 'compact' : 'default'}
				title={unavailableLabel}
				variant="secondary">
				<AlertTriangle className="h-4 w-4" />
				<span>Unavailable</span>
			</Button>
		);
	}

	return (
		<Button
			aria-label={withContext(crashed ? 'Restart app' : 'Start app')}
			onClick={() => startMutation.mutate()}
			size={compact ? 'compact' : 'default'}
			title={crashed ? 'Previous run crashed — click to restart' : 'Start app'}
			variant={crashed ? 'secondary' : 'primary'}>
			{crashed ? <AlertTriangle className="h-4 w-4" /> : <Play className="h-4 w-4" />}
			<span>{crashed ? 'Restart' : 'Start'}</span>
		</Button>
	);
}
