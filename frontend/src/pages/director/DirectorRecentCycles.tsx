import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as Clock } from 'lucide-react/dist/esm/icons/clock';
import { default as FileJson } from 'lucide-react/dist/esm/icons/file-json';
import { default as Timer } from 'lucide-react/dist/esm/icons/timer';
import { type ReactNode } from 'react';

import type { DirectorCycle } from '../../api/types.ts';
import type { Tone } from '../../lib/tones.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { cycleElapsed, cycleStageLabels } from '../../lib/directorConstants.ts';
import { formatDate } from '../../lib/formatters.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';
import { humanizeEnum } from './directorUtils.ts';

function cycleTone(status: DirectorCycle['status']): Tone {
	if (status === 'failed') return 'red';
	if (status === 'running') return 'teal';
	return 'emerald';
}

/** A `·`-separated segment of the cycle meta line. */
function MetaItem({ children }: { children: ReactNode }) {
	return <span className="inline-flex items-center gap-1">{children}</span>;
}

function CycleRow({ cycle, now }: { cycle: DirectorCycle; now: number }) {
	// The stage line said 'Completed' directly under a badge that said 'completed'. It earns its
	// place only while the cycle is mid-flight and the stage names something the status cannot.
	const showStage = cycle.stage !== cycle.status;
	return (
		<div className="rounded-md bg-muted p-3">
			<div className="flex items-center justify-between gap-2">
				{/* The cycle id is an opaque machine token; in proportional body weight it read as
				    the row's title. Mono at 12px it reads as the identifier it is. */}
				<div className="truncate font-mono text-xs text-foreground">{cycle.id}</div>
				<Badge tone={cycleTone(cycle.status)}>{humanizeEnum(cycle.status)}</Badge>
			</div>
			{/* Four stacked icon rows gave each cycle the height of a card for four short facts, so
			    a 28rem list showed three cycles. One wrapping line shows the same four. */}
			<div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
				<MetaItem>
					<Clock className="h-3.5 w-3.5" />
					{formatDate(cycle.startedAt)}
				</MetaItem>
				<span aria-hidden="true">·</span>
				<MetaItem>
					<Timer className="h-3.5 w-3.5" />
					<span className="tabular-nums">{cycleElapsed(cycle, now)}</span>
				</MetaItem>
				<span aria-hidden="true">·</span>
				<MetaItem>
					<FileJson className="h-3.5 w-3.5" />
					{cycle.totalSuggestions}{' '}
					{cycle.totalSuggestions === 1 ? 'suggestion' : 'suggestions'}
				</MetaItem>
				{showStage ? (
					<>
						<span aria-hidden="true">·</span>
						<MetaItem>
							<Activity className="h-3.5 w-3.5" />
							{cycleStageLabels[cycle.stage]}
						</MetaItem>
					</>
				) : null}
			</div>
			{cycle.status === 'failed' && cycle.failureReason && (
				<div
					className={`mt-2 flex items-start gap-1.5 rounded-md border p-2 text-xs ${toneBorder.red} ${toneSurface.red} ${toneText.red}`}>
					<AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
					<span className="break-words">{cycle.failureReason}</span>
				</div>
			)}
		</div>
	);
}

export function DirectorRecentCycles({ cycles, now }: { cycles: DirectorCycle[]; now: number }) {
	return (
		<section aria-labelledby="director-cycles-heading">
			<Card>
				{/* Was 14px/12px against the 16px/14px every other section heading on this page
				    uses, so the page had two heading scales for two peer sections. Both now come
				    from CardHeader, which is the only place that scale is declared. */}
				<CardHeader
					className="mb-3"
					description="History of completed analysis passes."
					id="director-cycles-heading"
					title="Recent Cycles"
				/>
				<div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
					{cycles.map((cycle) => (
						<CycleRow cycle={cycle} key={cycle.id} now={now} />
					))}
					{cycles.length === 0 && <EmptyState>No cycles run yet.</EmptyState>}
				</div>
			</Card>
		</section>
	);
}
