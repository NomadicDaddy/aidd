import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as Cpu } from 'lucide-react/dist/esm/icons/cpu';

import type { DirectorCycle, DirectorCycleArtifacts } from '../../api/types.ts';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { FilePath } from '../../components/shared/FilePath.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import {
	cycleElapsed,
	cycleStageDescriptions,
	cycleStageLabels,
} from '../../lib/directorConstants.ts';
import { humanizeEnum } from '../../lib/formatters.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';
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
		<div className="min-w-0 rounded-md border border-border p-2">
			<div className="flex items-center justify-between gap-2">
				<span className="text-xs font-medium text-foreground">{label}</span>
				<span className={`text-xs font-medium ${artifactTone(status)}`}>{status}</span>
			</div>
			<FilePath className="mt-1 block text-2xs break-all text-muted-foreground" path={path} />
		</div>
	);
}

export function ActiveCyclePanel({ cycle, now }: { cycle: DirectorCycle; now: number }) {
	const artifacts: DirectorCycleArtifacts = cycle.artifacts;
	const isDirectAi = cycle.stage === 'running_direct_ai';
	return (
		<div className={`mt-4 rounded-md border p-3 ${toneBorder.teal} ${toneSurface.teal}`}>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
						<Activity className={`h-4 w-4 ${toneText.teal}`} />
						<span className="truncate">{cycleStageLabels[cycle.stage]}</span>
					</div>
					<p className="mt-1 text-sm text-foreground">
						{cycleStageDescriptions[cycle.stage]}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Badge tone="teal">{humanizeEnum(cycle.status)}</Badge>
					<Badge>
						<span className="tabular-nums">{cycleElapsed(cycle, now)}</span>
					</Badge>
				</div>
			</div>
			{isDirectAi && cycle.directAiMeta && (
				<div className="mt-3 flex items-center gap-3 rounded-md border border-accent/50 bg-card px-3 py-2">
					<Cpu className={`h-4 w-4 shrink-0 ${toneText.teal}`} />
					<div className="min-w-0 text-sm text-foreground">
						<ExecutionIdentityBadges
							backend="direct"
							model={cycle.directAiMeta.model}
							provider={cycle.directAiMeta.provider}
							reasoningEffort={cycle.directAiMeta.reasoningEffort}
						/>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Analyzing fleet summary and producing director suggestions.
						</p>
					</div>
				</div>
			)}
			<div className="mt-3 grid gap-2 lg:grid-cols-3">
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
			<p className="mt-3 text-xs text-muted-foreground">
				Director cycles run inside the web backend. They produce suggestions here; launched
				suggestions create normal runs in the activity console.
			</p>
		</div>
	);
}
