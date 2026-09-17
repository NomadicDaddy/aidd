import type {
	ProjectFeature,
	ProjectFeatureStatus,
	ProjectRoadmapSummary,
} from '../../../api/types.ts';

import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { humanizeEnum } from '../../../lib/formatters.ts';
import { microLabelClass } from '../../../lib/typography.ts';
import { featurePassesDisagrees } from './featureLaunchEligibility.ts';
import {
	FeatureActions,
	FeatureMilestoneControl,
	FeaturePriorityControl,
} from './FeatureRowControls.tsx';
import { featureSearchContext } from './featureSearchUtils.ts';
import { featureShippedVersion, featureSourceLabel } from './featuresUtils.ts';
import { featureAddedAt, featureCompletedAt } from './featureTimestamps.ts';
import { featureSourceDisplayLabel, statusTone, stringValue } from './shared.ts';

export function FeatureMobileCard({
	decision,
	deemphasizePriority,
	disabled,
	feature,
	inventory,
	launching,
	milestoneOptions,
	onApprove,
	onDecisionChange,
	onDelete,
	onLaunchRun,
	onMilestoneChange,
	onSelect,
	onStatusChange,
	query,
	roadmap,
	runActive,
}: {
	decision: string;
	deemphasizePriority: boolean;
	disabled: boolean;
	feature: ProjectFeature;
	/** Every feature the project has, so the launch rule can test this one's prerequisites. */
	inventory: ProjectFeature[];
	launching: boolean;
	milestoneOptions: string[];
	onApprove: (feature: ProjectFeature, decisionRequired: boolean) => void;
	onDecisionChange: (value: string) => void;
	onDelete: (feature: ProjectFeature) => void;
	onLaunchRun: (feature: ProjectFeature) => void;
	onMilestoneChange: (feature: ProjectFeature, milestone: string) => void;
	onSelect: (feature: ProjectFeature) => void;
	onStatusChange: (feature: ProjectFeature, status: ProjectFeatureStatus) => void;
	query: string;
	roadmap: null | ProjectRoadmapSummary;
	runActive: boolean;
}) {
	const id = feature.id || stringValue(feature, 'id');
	const title = stringValue(feature, 'title') || id;
	const status = stringValue(feature, 'status') || 'unknown';
	const source = featureSourceDisplayLabel(featureSourceLabel(feature));
	const searchContext = featureSearchContext(feature, query);
	return (
		<div className="@container rounded-md border border-border p-3">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="font-medium text-foreground">{title}</div>
					<div className="font-mono text-xs break-all text-muted-foreground">{id}</div>
					{searchContext ? (
						<div className="line-clamp-2 text-xs text-muted-foreground">
							{searchContext.before}
							<mark className="bg-accent/20 text-foreground">
								{searchContext.match}
							</mark>
							{searchContext.after}
						</div>
					) : null}
				</div>
				<div className="flex flex-wrap justify-end gap-1">
					<Badge tone={statusTone(status)}>{humanizeEnum(status)}</Badge>
					{featurePassesDisagrees(feature, status) ? (
						<Badge
							title="Status and passes disagree; completion requires completed plus passes=true"
							tone="amber">
							metadata conflict
						</Badge>
					) : null}
				</div>
			</div>
			<dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs @min-[40rem]:grid-cols-3">
				<div className="space-y-1">
					<dt className={`text-muted-foreground ${microLabelClass}`}>Priority</dt>
					<dd>
						<FeaturePriorityControl
							deemphasized={deemphasizePriority}
							disabled={disabled}
							feature={feature}
							onChange={(milestone) => onMilestoneChange(feature, milestone)}
							priority={feature.priority}
							roadmap={roadmap}
						/>
					</dd>
				</div>
				<div className="space-y-1">
					<dt className={`text-muted-foreground ${microLabelClass}`}>Shipped</dt>
					<dd className="font-mono text-foreground">
						{featureShippedVersion(feature) ?? '—'}
					</dd>
				</div>
				<div className="space-y-1">
					<dt className={`text-muted-foreground ${microLabelClass}`}>Source</dt>
					<dd className="text-foreground">{source}</dd>
				</div>
				<div className="space-y-1">
					<dt className={`text-muted-foreground ${microLabelClass}`}>Milestone</dt>
					<dd>
						<FeatureMilestoneControl
							disabled={disabled}
							feature={feature}
							milestoneOptions={milestoneOptions}
							onChange={(milestone) => onMilestoneChange(feature, milestone)}
							roadmap={roadmap}
						/>
					</dd>
				</div>
				<div className="space-y-1">
					<dt className={`text-muted-foreground ${microLabelClass}`}>Added</dt>
					<dd className="text-foreground">
						<RelativeAge value={featureAddedAt(feature)?.iso ?? null} />
					</dd>
				</div>
				<div className="space-y-1">
					<dt className={`text-muted-foreground ${microLabelClass}`}>Completed</dt>
					<dd className="text-foreground">
						<RelativeAge value={featureCompletedAt(feature)?.iso ?? null} />
					</dd>
				</div>
			</dl>
			<div className="mt-3 border-t border-border pt-3">
				<FeatureActions
					decision={decision}
					disabled={disabled}
					feature={feature}
					inventory={inventory}
					launching={launching}
					onApprove={onApprove}
					onDecisionChange={onDecisionChange}
					onDelete={onDelete}
					onLaunchRun={onLaunchRun}
					onSelect={onSelect}
					onStatusChange={onStatusChange}
					runActive={runActive}
					showStatusControl={false}
					status={status}
				/>
			</div>
		</div>
	);
}
