import { executionStatusPresentation } from 'aidd-shared/runs/outcome';
import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { Link } from 'react-router';

import { RunCommandInfo } from '../../../components/shared/RunCommandInfo.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { buttonClassName } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { useNow } from '../../../hooks/useNow.ts';
import { useRuns } from '../../../hooks/useRuns.ts';
import { cn } from '../../../lib/cn.ts';
import { formatDate } from '../../../lib/formatters.ts';
import { toneBorder, toneSurface, toneText } from '../../../lib/tones.ts';
import { RunLivenessIndicator } from '../../runs/RunLivenessIndicator.tsx';
import { inFlightBreakdown, inFlightRuns } from '../../runs/runsUtils.ts';

// Surfaced above the project tabs so a run launched from anywhere on the project page (maturity
// next-action, audit dispatch, feature launch) gives an immediate in-page indication that work is
// running — not just a transient toast. Queued runs are listed too, after the running ones, so a
// launch held by the run ceiling is visibly accepted. Renders nothing while nothing is in flight.
export function ActiveRunsBanner({ projectPath }: { projectPath: string }) {
	const runs = useRuns(projectPath);
	const running = inFlightRuns(runs.data?.pages.flatMap((page) => page.runs) ?? []);
	const breakdown = inFlightBreakdown(running);
	const anyExecuting = running.some((run) => run.status === 'running');
	const now = useNow(running.length > 0);
	if (running.length === 0) return null;
	return (
		<Card
			className={cn(
				'flex flex-wrap items-center gap-3 p-3',
				toneBorder.amber,
				toneSurface.amber,
			)}>
			<div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground">
				<Activity className={cn('h-4 w-4', toneText.amber)} />
				{running.length === 1 ? 'Run in progress' : `${running.length} runs in progress`}
				{breakdown ? (
					<span className="text-xs font-normal text-muted-foreground">{breakdown}</span>
				) : null}
				<Badge pulse={anyExecuting} showDot tone="amber">
					{running.length}
				</Badge>
			</div>
			<ul className="min-w-0 flex-1 space-y-2">
				{running.map((run) => (
					<li
						className={cn(
							'flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card/60 px-3 py-1.5 text-sm',
							toneBorder.amber,
						)}
						key={run.id}>
						<div className="min-w-0">
							<span className="inline-flex min-w-0 items-center gap-1.5">
								<span className="font-mono text-xs text-foreground">{run.id}</span>
								<RunCommandInfo command={run.launchCommand} runId={run.id} />
								{run.status === 'queued' ? (
									<Badge
										showDot
										title={executionStatusPresentation.queued.title}
										tone="teal">
										{executionStatusPresentation.queued.label}
									</Badge>
								) : null}
							</span>
							<span className="ml-2 text-xs text-muted-foreground">
								{run.mode} · {run.status === 'queued' ? 'queued' : 'started'}{' '}
								{formatDate(run.startedAt)}
							</span>
							<RunLivenessIndicator now={now} run={run} />
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
