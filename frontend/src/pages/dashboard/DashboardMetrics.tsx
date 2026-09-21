import { default as Bot } from 'lucide-react/dist/esm/icons/bot';
import { default as CheckCircle2 } from 'lucide-react/dist/esm/icons/check-circle-2';
import { default as FolderKanban } from 'lucide-react/dist/esm/icons/folder-kanban';
import { default as History } from 'lucide-react/dist/esm/icons/history';
import { Link } from 'react-router';

import type { Tone } from '../../lib/tones.ts';
import type { ProjectsReading } from './projectsReading.ts';

import { Metric } from '../../components/shared/Metric.tsx';
import { toneText } from '../../lib/tones.ts';
import { PriorityHealthFooter } from './PriorityHealthFooter.tsx';

const metricLinkClass =
	'min-h-11 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/80';

export function DashboardMetrics({
	activeRunCount,
	activeRunDetail,
	featureHealthTone,
	featureHealthValue,
	fleetFeaturePassing,
	fleetFeatureTotal,
	healthBand,
	onRetryProjects,
	pendingSuggestionCount,
	priorityHealthLoading,
	projectsLoading,
	projectsReading,
	runsLoading,
	suggestionsLoading,
}: {
	activeRunCount: number;
	/** Running/queued split, present only while something is queued. */
	activeRunDetail: string | undefined;
	featureHealthTone: Tone;
	featureHealthValue: number;
	fleetFeaturePassing: number;
	fleetFeatureTotal: number;
	healthBand: string | undefined;
	onRetryProjects: () => void;
	pendingSuggestionCount: number;
	priorityHealthLoading: boolean;
	projectsLoading: boolean;
	/** The tile is rendered in its failed state when this is null. */
	projectsReading: null | ProjectsReading;
	runsLoading: boolean;
	suggestionsLoading: boolean;
}) {
	// Held in a variable because the failed state carries a Retry button, and a button cannot
	// sit inside the Link that wraps every other tile. The wrapper goes away exactly when the
	// button arrives, so the tile is never a link to a page it has nothing to say about.
	const projectsTile = (
		<Metric
			compactOnMobile
			detail={
				projectsReading?.split ? (
					<>
						{projectsReading.split.healthy} healthy /{' '}
						<span
							className={
								projectsReading.split.failing > 0 ? toneText.red : undefined
							}>
							{projectsReading.split.failing} need attention
						</span>
					</>
				) : undefined
			}
			error={
				projectsReading
					? undefined
					: { message: 'Failed to load projects.', onRetry: onRetryProjects }
			}
			icon={<FolderKanban className="h-5 w-5" />}
			interactive={projectsReading !== null}
			label="Projects"
			loading={projectsLoading}
			value={projectsReading?.count ?? '--'}
		/>
	);
	return (
		<section aria-label="Fleet metrics" className="@container">
			{/* The cards share a row height so the four labels and values keep one visual baseline;
			    Priority Health uses the extra depth for its progress footer while the other readings
			    remain top-aligned.

			    The steps read this section, not the viewport: it measures 358px inside a 390px
			    viewport and 328px inside a 360px one. A 22rem step sat between those two, so the
			    same phone layout was two columns on one common handset width and four stacked
			    rows on the other. Two columns is wanted at both — 158px a column at 328px, against
			    171px at 358px, and these are compactOnMobile readings of a label and an integer —
			    so the step goes below the narrower measurement. It still falls back to one column
			    under about a 350px viewport, which is the width where 158px would stop holding a
			    reading. */}
			<div className="grid items-stretch gap-4 @min-[20rem]:grid-cols-2 @min-[61rem]:grid-cols-4">
				<Link className={metricLinkClass} to="/director">
					<Metric
						compactOnMobile
						detail="pending director actions"
						icon={<Bot className="h-5 w-5" />}
						interactive
						label="Suggestions"
						loading={suggestionsLoading}
						value={pendingSuggestionCount}
					/>
				</Link>
				<Link className={metricLinkClass} to="/projects">
					<Metric
						compactOnMobile
						detail={`${fleetFeaturePassing}/${fleetFeatureTotal} passing`}
						footer={
							<PriorityHealthFooter
								band={healthBand}
								tone={featureHealthTone}
								value={featureHealthValue}
							/>
						}
						icon={<CheckCircle2 className="h-5 w-5" />}
						interactive
						label="Priority Health"
						loading={priorityHealthLoading}
						tone={featureHealthTone}
						value={`${featureHealthValue}%`}
					/>
				</Link>
				<Link className={metricLinkClass} to="/runs">
					<Metric
						compactOnMobile
						detail={
							activeRunDetail ??
							(activeRunCount === 1 ? 'run in progress' : 'runs in progress')
						}
						icon={<History className="h-5 w-5" />}
						interactive
						label="Active Runs"
						loading={runsLoading}
						tone={activeRunCount > 0 ? 'teal' : 'neutral'}
						value={activeRunCount}
					/>
				</Link>
				{projectsReading !== null ? (
					<Link className={metricLinkClass} to="/projects">
						{projectsTile}
					</Link>
				) : (
					projectsTile
				)}
			</div>
		</section>
	);
}
