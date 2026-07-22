import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as Cpu } from 'lucide-react/dist/esm/icons/cpu';

import type { DirectorCycle, DirectorCycleArtifacts } from '../../api/types.ts';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import {
	cycleElapsed,
	cycleStageDescriptions,
	cycleStageLabels,
} from '../../lib/directorConstants.ts';
import { artifactTone, contextArtifactLabel, outputArtifactLabel } from './directorUtils.ts';

function CycleArtifactRow({
	label,
	path,
	status,
}: {
	label: string;
	path: string;
	status: string;
}) {
	return (
		<div className="min-w-0 rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
			<div className="flex items-center justify-between gap-2">
				<span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
					{label}
				</span>
				<span className={`text-xs font-medium ${artifactTone(status)}`}>{status}</span>
			</div>
			<div className="mt-1 text-[11px] break-all text-neutral-500 dark:text-neutral-400">
				{path}
			</div>
		</div>
	);
}

export function ActiveCyclePanel({ cycle, now }: { cycle: DirectorCycle; now: number }) {
	const artifacts: DirectorCycleArtifacts = cycle.artifacts;
	const isDirectAi = cycle.stage === 'running_direct_ai';
	return (
		<div className="mt-4 rounded-md border border-cyan-200 bg-cyan-50 p-3 dark:border-cyan-900 dark:bg-cyan-950/30">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-sm font-semibold text-neutral-950 dark:text-neutral-50">
						<Activity className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
						<span className="truncate">{cycleStageLabels[cycle.stage]}</span>
					</div>
					<p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
						{cycleStageDescriptions[cycle.stage]}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Badge>{cycle.status}</Badge>
					<Badge>{cycleElapsed(cycle, now)}</Badge>
				</div>
			</div>
			{isDirectAi && cycle.directAiMeta && (
				<div className="mt-3 flex items-center gap-3 rounded-md border border-cyan-300 bg-cyan-100/60 px-3 py-2 dark:border-cyan-800 dark:bg-cyan-950/50">
					<Cpu className="h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-300" />
					<div className="min-w-0 text-sm text-neutral-700 dark:text-neutral-300">
						<ExecutionIdentityBadges
							backend="direct"
							model={cycle.directAiMeta.model}
							provider={cycle.directAiMeta.provider}
							reasoningEffort={cycle.directAiMeta.reasoningEffort}
						/>
						<p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
							Analyzing fleet summary and producing director suggestions.
						</p>
					</div>
				</div>
			)}
			<div className="mt-3 grid gap-2 md:grid-cols-3">
				<CycleArtifactRow
					label="Fleet snapshot"
					path={artifacts.fleetSummaryPath}
					status={artifacts.fleetSummaryExists ? 'Ready' : 'Pending'}
				/>
				<CycleArtifactRow
					label="Cycle context"
					path={artifacts.contextPath}
					status={contextArtifactLabel(cycle)}
				/>
				<CycleArtifactRow
					label="Director output"
					path={artifacts.outputPath}
					status={outputArtifactLabel(cycle)}
				/>
			</div>
			<p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
				Director cycles run inside the web backend. They produce suggestions here; launched
				suggestions create normal runs in the activity console.
			</p>
		</div>
	);
}
