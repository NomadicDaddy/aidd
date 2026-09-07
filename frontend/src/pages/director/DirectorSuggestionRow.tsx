import { default as ExternalLink } from 'lucide-react/dist/esm/icons/external-link';
import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { useId } from 'react';
import { Link } from 'react-router';

import type { DirectorSuggestionRecord } from '../../api/types.ts';
import type { Tone } from '../../lib/tones.ts';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { riskLabel, riskTone } from '../../lib/directorConstants.ts';
import { humanizeEnum } from '../../lib/formatters.ts';
import {
	microLabelClass,
	monoEditorMeasureClass,
	proseMeasureClass,
} from '../../lib/typography.ts';

function TaskReading({ taskType }: { taskType: DirectorSuggestionRecord['taskType'] }) {
	return <span className="text-xs text-muted-foreground">{humanizeEnum(taskType)}</span>;
}

function statusTone(status: DirectorSuggestionRecord['status']): Tone {
	if (status === 'launched') return 'emerald';
	if (status === 'launching') return 'teal';
	return 'neutral';
}

function NarrativeSection({ children, title }: { children: string; title: string }) {
	return (
		<section>
			<h4 className={`${microLabelClass} text-muted-foreground`}>{title}</h4>
			<p className={`mt-1 text-sm break-words text-foreground ${proseMeasureClass}`}>
				{children}
			</p>
		</section>
	);
}

function formatStructuredEvidence(evidence: string): string {
	try {
		const value: unknown = JSON.parse(evidence);
		return JSON.stringify(value, null, 2) ?? evidence;
	} catch {
		return evidence;
	}
}

function StructuredEvidence({ evidence }: { evidence: string }) {
	return (
		<section>
			<h4 className={`${microLabelClass} text-muted-foreground`}>Evidence</h4>
			<OverflowScroller
				ariaLabel="Suggestion evidence"
				className={`mt-1 ${monoEditorMeasureClass}`}
				scrollerClassName="rounded-md border border-border bg-card"
				surface="card">
				<pre className="w-max min-w-full p-3 font-mono text-xs text-foreground">
					<code>{formatStructuredEvidence(evidence)}</code>
				</pre>
			</OverflowScroller>
		</section>
	);
}

export function DirectorSuggestionRow({
	expanded,
	onDismiss,
	onLaunch,
	onPreview,
	onToggle,
	suggestion,
}: {
	expanded: boolean;
	onDismiss: (id: string) => void;
	onLaunch: (id: string) => void;
	onPreview: (suggestion: DirectorSuggestionRecord) => void;
	onToggle: () => void;
	suggestion: DirectorSuggestionRecord;
}) {
	const detailsId = useId();
	const isFleetWide = suggestion.projectId === null;
	const launchHref = suggestion.launchedPipelineSessionId
		? `/pipeline-sessions/${encodeURIComponent(suggestion.launchedPipelineSessionId)}`
		: suggestion.launchedRunId
			? `/runs?run=${encodeURIComponent(suggestion.launchedRunId)}`
			: null;

	return (
		<div className="rounded-md bg-muted p-3">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0 flex-[1_1_20rem]">
					<h3
						className="truncate text-sm font-semibold text-foreground"
						title={suggestion.title}>
						{suggestion.title}
					</h3>
					<div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
						{/* The order the Director chose, not the row's position on screen — filters
						    and dismissals move rows around, and an operator comparing two of them
						    should not have to count. A suggestion with no rank shows nothing
						    rather than a zero that would read as "ranked last". */}
						{suggestion.rank === null ? null : (
							<Badge
								casing="preserve"
								title="Rank within the cycle that produced this suggestion">
								#{suggestion.rank}
							</Badge>
						)}
						{suggestion.projectId ? (
							<Link
								className="text-xs font-medium text-accent hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
								to={`/projects/${encodeURIComponent(suggestion.projectId)}`}>
								{suggestion.projectId}
							</Link>
						) : (
							<Badge>Fleet-wide</Badge>
						)}
						<TaskReading taskType={suggestion.taskType} />
						<Badge showDot tone={riskTone(suggestion.riskLevel)}>
							{riskLabel(suggestion.riskLevel)}
						</Badge>
						<Badge showDot tone={statusTone(suggestion.status)}>
							{humanizeEnum(suggestion.status)}
						</Badge>
					</div>
				</div>
				<Button
					aria-controls={detailsId}
					aria-expanded={expanded}
					aria-label={`${expanded ? 'Hide details for suggestion' : 'Review suggestion'}: ${suggestion.title}`}
					onClick={onToggle}
					size="compact"
					variant="secondary">
					<DisclosureMarker open={expanded} />
					{expanded ? 'Hide' : 'Review'}
				</Button>
			</div>

			{expanded ? (
				<div className="mt-3 border-t border-border pt-3" id={detailsId}>
					<div className="space-y-3">
						<NarrativeSection title="Suggestion">
							{suggestion.description}
						</NarrativeSection>
						<NarrativeSection title="Reasoning">
							{suggestion.reasoning}
						</NarrativeSection>
						{suggestion.evidence ? (
							<StructuredEvidence evidence={suggestion.evidence} />
						) : null}
						{isFleetWide ? (
							<p className={`text-xs text-muted-foreground ${proseMeasureClass}`}>
								Fleet-wide suggestions are guidance rather than launchable project
								work. Dismiss this suggestion after the guidance has been handled.
							</p>
						) : null}
					</div>
					<div className="mt-3 flex flex-wrap justify-start gap-2 border-t border-border pt-3">
						{launchHref ? (
							<Link
								className={buttonClassName('secondary', undefined, 'compact')}
								to={launchHref}>
								<ExternalLink className="h-3.5 w-3.5" />
								View launch output
							</Link>
						) : null}
						{!isFleetWide ? (
							<Button
								aria-label={`Preview launch for suggestion: ${suggestion.title}`}
								onClick={() => onPreview(suggestion)}
								size="compact"
								title="Show the exact prompt Launch will send"
								variant="secondary">
								<Eye className="h-3.5 w-3.5" />
								Preview
							</Button>
						) : null}
						<Button
							aria-label={`Launch suggestion: ${suggestion.title}`}
							disabled={suggestion.status !== 'pending' || isFleetWide}
							onClick={() => onLaunch(suggestion.id)}
							size="compact"
							variant="primary">
							<Play className="h-3.5 w-3.5" />
							Launch
						</Button>
						{suggestion.status === 'pending' ? (
							<Button
								aria-label={`Dismiss suggestion: ${suggestion.title}`}
								onClick={() => onDismiss(suggestion.id)}
								size="compact"
								variant="ghost">
								<Trash2 className="h-3.5 w-3.5" />
								Dismiss
							</Button>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
