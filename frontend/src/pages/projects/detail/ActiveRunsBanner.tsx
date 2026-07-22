import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { Link } from 'react-router-dom';

import { RunCommandInfo } from '../../../components/shared/RunCommandInfo.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { buttonClassName } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { useRuns } from '../../../hooks/useRuns.ts';
import { formatDate } from '../../../lib/formatters.ts';

// Surfaced above the project tabs so a run launched from anywhere on the project page (maturity
// next-action, audit dispatch, feature launch) gives an immediate in-page indication that work is
// running — not just a transient toast. Renders nothing while no run for this project is active.
export function ActiveRunsBanner({ projectPath }: { projectPath: string }) {
	const runs = useRuns(projectPath);
	const running = (runs.data?.pages.flatMap((page) => page.runs) ?? []).filter(
		(run) => run.status === 'running'
	);
	if (running.length === 0) return null;
	return (
		<Card className="flex flex-wrap items-center gap-3 border-amber-200/80 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
			<div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-neutral-950 dark:text-neutral-50">
				<Activity className="h-4 w-4 text-amber-600 dark:text-amber-300" />
				{running.length === 1 ? 'Run in progress' : `${running.length} runs in progress`}
				<Badge pulse showDot tone="amber">
					{running.length}
				</Badge>
			</div>
			<ul className="min-w-0 flex-1 space-y-2">
				{running.map((run) => (
					<li
						className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200/80 bg-white/60 px-3 py-1.5 text-sm dark:border-amber-900/60 dark:bg-amber-950/10"
						key={run.id}>
						<div className="min-w-0">
							<span className="inline-flex min-w-0 items-center gap-1.5">
								<span className="font-mono text-xs text-neutral-900 dark:text-neutral-100">
									{run.id}
								</span>
								<RunCommandInfo command={run.launchCommand} runId={run.id} />
							</span>
							<span className="ml-2 text-xs text-neutral-600 dark:text-neutral-400">
								{run.mode} · started {formatDate(run.startedAt)}
							</span>
						</div>
						<Link
							aria-label={`Open run ${run.id} in Live Console`}
							className={buttonClassName('primary', undefined, 'compact')}
							to={`/runs?project=${encodeURIComponent(projectPath)}&run=${encodeURIComponent(run.id)}`}>
							Open in Live Console
						</Link>
					</li>
				))}
			</ul>
		</Card>
	);
}
