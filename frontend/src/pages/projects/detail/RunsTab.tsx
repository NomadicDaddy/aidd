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
					runs={runList}
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
				runs={runList}
			/>
			<LocalAiddHistoryPanel
				description={
					<>
						Rows read from the project&apos;s{' '}
						<code className="font-mono">.aidd/runs.jsonl</code> and{' '}
						<code className="font-mono">.aidd/iterations</code> metadata.
					</>
				}
				iterations={localIterations}
				runs={localRuns}
			/>
			<ProjectUsagePanel usage={usage} />
		</div>
	);
}
