import { Link } from 'react-router';

import type {
	ProjectLocalIteration,
	ProjectLocalRun,
	ProjectUsageSummary,
} from '../../../api/types.ts';

import { LocalAiddHistoryPanel } from '../../../components/shared/LocalAiddHistoryPanel.tsx';
import { TabIntro } from '../../../components/shared/TabIntro.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { useRuns } from '../../../hooks/useRuns.ts';
import { compareRunsByLiveness } from '../../runs/runsUtils.ts';
import { ActiveRunsPanel } from './ActiveRunsPanel.tsx';
import { ProjectUsagePanel } from './ProjectUsagePanel.tsx';

export function RunsTab({
	localIterations,
	localRuns,
	projectPath,
	usage,
}: {
	localIterations: ProjectLocalIteration[];
	localRuns: ProjectLocalRun[];
	projectPath: string;
	usage: ProjectUsageSummary;
}) {
	const activeRuns = useRuns(projectPath);
	const runList = (activeRuns.data?.pages.flatMap((page) => page.runs) ?? [])
		.slice()
		.sort(compareRunsByLiveness);
	const activeRunList = runList.filter((run) => run.status === 'running');
	const localTotal = localIterations.length;
	const localRunTotal = localRuns.length;
	if (
		localTotal === 0 &&
		localRunTotal === 0 &&
		!activeRuns.isLoading &&
		!activeRuns.isError &&
		runList.length === 0
	) {
		return (
			<div className="space-y-4">
				<TabIntro
					description="Recent activity and the recorded run ledger, followed by lifetime AI accounting."
					title="Runs"
				/>
				<ActiveRunsPanel
					isError={activeRuns.isError}
					isLoading={activeRuns.isLoading}
					projectPath={projectPath}
					runs={activeRunList}
				/>
				<Card className="py-10 text-center text-sm text-muted-foreground">
					<p>No runs recorded for this project.</p>
					<p className="mt-1 text-xs">
						Launch a run from the{' '}
						<Link
							className="underline"
							to={`/runs?project=${encodeURIComponent(projectPath)}`}>
							Runs page
						</Link>{' '}
						to see history here.
					</p>
				</Card>
				<ProjectUsagePanel usage={usage} />
			</div>
		);
	}
	return (
		<div className="space-y-4">
			<TabIntro
				description="Recent activity and the recorded run ledger, followed by lifetime AI accounting."
				title="Runs"
			/>
			<ActiveRunsPanel
				isError={activeRuns.isError}
				isLoading={activeRuns.isLoading}
				projectPath={projectPath}
				runs={activeRunList}
			/>
			<LocalAiddHistoryPanel
				description={
					<>
						Rows read from the project&apos;s{' '}
						<code className="font-mono">.aidd/runs.jsonl</code> and{' '}
						<code className="font-mono">.aidd/iterations</code> metadata.{' '}
						{localRuns.length < usage.totals.runCount
							? `Showing the ${localRuns.length} most recent of ${usage.totals.runCount} finalized Runs.`
							: `Showing all ${usage.totals.runCount} finalized ${usage.totals.runCount === 1 ? 'Run' : 'Runs'}.`}
					</>
				}
				iterations={localIterations}
				runs={localRuns}
				title="Local runs"
				totalRunCount={usage.totals.runCount}
			/>
			<ProjectUsagePanel usage={usage} />
		</div>
	);
}
