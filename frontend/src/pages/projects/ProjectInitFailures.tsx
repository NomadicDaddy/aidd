import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { toast } from 'sonner';

import type { ProjectInitFailure } from '../../api/types.ts';

import { projectInitFailureLogUrl } from '../../api/projects.ts';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import {
	useDismissProjectInitFailure,
	useRetryProjectInitFailure,
} from '../../hooks/useProjects.ts';

// Surfaces failed project-template scaffolds so a broken init stays visible with retry
// and dismiss actions instead of vanishing after the toast.
export function ProjectInitFailures({ failures }: { failures: ProjectInitFailure[] }) {
	const retry = useRetryProjectInitFailure();
	const dismiss = useDismissProjectInitFailure();
	if (failures.length === 0) return null;

	function handleRetry(failure: ProjectInitFailure): void {
		retry.mutate(failure.id, {
			onError: (error) =>
				toast.error('Retry failed', {
					description: error instanceof Error ? error.message : 'Unknown error.',
				}),
			onSuccess: () => toast.success('Retry launched', { description: failure.name }),
		});
	}

	function handleDismiss(id: string): void {
		dismiss.mutate(id, {
			onError: (error) =>
				toast.error('Dismiss failed', {
					description: error instanceof Error ? error.message : 'Unknown error.',
				}),
		});
	}

	return (
		<Card className="space-y-3 border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20">
			<div className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-200">
				<AlertTriangle className="h-4 w-4" />
				Failed project inits ({failures.length})
			</div>
			<ul className="space-y-2">
				{failures.map((failure) => (
					<li
						className="space-y-1 rounded border border-red-200 bg-white p-3 text-sm dark:border-red-900/50 dark:bg-neutral-950"
						key={failure.id}>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="min-w-0">
								<span className="text-foreground font-medium">{failure.name}</span>
								<span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
									{failure.template}
								</span>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								{failure.hasLog ? (
									<a
										className="text-xs text-teal-700 underline dark:text-teal-300"
										href={projectInitFailureLogUrl(failure.id)}
										rel="noreferrer"
										target="_blank">
										View log
									</a>
								) : null}
								<Button
									disabled={retry.isPending}
									onClick={() => handleRetry(failure)}
									variant="secondary">
									{retry.isPending && retry.variables === failure.id ? (
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
									) : null}
									Retry
								</Button>
								<Button
									disabled={dismiss.isPending}
									onClick={() => handleDismiss(failure.id)}
									variant="ghost">
									Dismiss
								</Button>
							</div>
						</div>
						<p className="font-mono text-xs break-all text-neutral-500">
							{failure.targetPath}
						</p>
						<p className="text-xs text-red-700 dark:text-red-300">
							{failure.errorSummary}
						</p>
						{failure.quarantinePath ? (
							<p className="text-xs text-neutral-500">
								Partial output quarantined at{' '}
								<span className="font-mono break-all">
									{failure.quarantinePath}
								</span>
							</p>
						) : null}
					</li>
				))}
			</ul>
		</Card>
	);
}
