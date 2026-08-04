import type {
	ProjectFeature,
	ProjectFeatureStatus,
	ProjectRoadmapSummary,
} from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { FeatureActions, FeatureMilestoneControl } from './FeatureRowControls.tsx';
import { featureShippedVersion, featureSourceLabel } from './featuresUtils.ts';
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
		<div className="rounded-md border border-border p-3">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="font-medium text-foreground">{title}</div>
					<div className="text-xs break-all text-muted-foreground">{id}</div>
				</div>
				<Badge tone={statusTone(status)}>{status}</Badge>
			</div>
			<dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
				<div className="space-y-1">
					<dt className="font-medium text-muted-foreground uppercase">Priority</dt>
					<dd className="text-foreground">{String(feature.priority ?? '—')}</dd>
				</div>
				<div className="space-y-1">
					<dt className="font-medium text-muted-foreground uppercase">Passes</dt>
					<dd>
						{feature.passes === true ? (
							<Badge tone="emerald">yes</Badge>
						) : (
							<Badge tone="neutral">no</Badge>
						)}
					</dd>
				</div>
				<div className="space-y-1">
					<dt className="font-medium text-muted-foreground uppercase">Shipped</dt>
					<dd className="font-mono text-foreground">
						{featureShippedVersion(feature) ?? '—'}
					</dd>
				</div>
				<div className="space-y-1">
					<dt className="font-medium text-muted-foreground uppercase">Source</dt>
					<dd className="text-foreground">{source}</dd>
				</div>
				<div className="col-span-2 space-y-1">
					<dt className="font-medium text-muted-foreground uppercase">Milestone</dt>
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
			<div className="mt-3 border-t border-border pt-3">
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
