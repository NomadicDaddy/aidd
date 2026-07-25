import type {
	ProjectFeature,
	ProjectFeatureStatus,
	ProjectRoadmapSummary,
} from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { FeatureActions, FeatureMilestoneControl } from './FeatureRowControls.tsx';
import { featureSourceLabel } from './featuresUtils.ts';
import { statusTone, stringValue } from './shared.ts';

export function FeatureMobileCard({
	decision,
	disabled,
	feature,
	launching,
	milestoneOptions,
	onApprove,
	onDecisionChange,
	onDelete,
	onLaunchRun,
	onMilestoneChange,
	onSelect,
	onStatusChange,
	roadmap,
	runActive,
}: {
	decision: string;
	disabled: boolean;
	feature: ProjectFeature;
	launching: boolean;
	milestoneOptions: string[];
	onApprove: (feature: ProjectFeature, decisionRequired: boolean) => void;
	onDecisionChange: (value: string) => void;
	onDelete: (feature: ProjectFeature) => void;
	onLaunchRun: (feature: ProjectFeature) => void;
	onMilestoneChange: (feature: ProjectFeature, milestone: string) => void;
	onSelect: (feature: ProjectFeature) => void;
	onStatusChange: (feature: ProjectFeature, status: ProjectFeatureStatus) => void;
	roadmap: null | ProjectRoadmapSummary;
	runActive: boolean;
}) {
	const id = feature.id || stringValue(feature, 'id');
	const title = stringValue(feature, 'title') || id;
	const status = stringValue(feature, 'status') || 'unknown';
	const source = featureSourceLabel(feature);
	return (
		<div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="font-medium text-foreground">{title}</div>
					<div className="text-xs break-all text-neutral-500">{id}</div>
				</div>
				<Badge tone={statusTone(status)}>{status}</Badge>
			</div>
			<dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
				<div className="space-y-1">
					<dt className="font-medium text-neutral-500 uppercase">Priority</dt>
					<dd className="text-neutral-800 dark:text-neutral-200">
						{String(feature.priority ?? '—')}
					</dd>
				</div>
				<div className="space-y-1">
					<dt className="font-medium text-neutral-500 uppercase">Passes</dt>
					<dd>
						{feature.passes === true ? (
							<Badge tone="emerald">yes</Badge>
						) : (
							<Badge tone="neutral">no</Badge>
						)}
					</dd>
				</div>
				<div className="col-span-2 space-y-1">
					<dt className="font-medium text-neutral-500 uppercase">Source</dt>
					<dd className="text-neutral-700 dark:text-neutral-300">{source}</dd>
				</div>
				<div className="col-span-2 space-y-1">
					<dt className="font-medium text-neutral-500 uppercase">Milestone</dt>
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
			</dl>
			<div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
				<FeatureActions
					decision={decision}
					disabled={disabled}
					feature={feature}
					launching={launching}
					onApprove={onApprove}
					onDecisionChange={onDecisionChange}
					onDelete={onDelete}
					onLaunchRun={onLaunchRun}
					onSelect={onSelect}
					onStatusChange={onStatusChange}
					runActive={runActive}
					status={status}
				/>
			</div>
		</div>
	);
}
