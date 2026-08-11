import type { ProjectFeature, ProjectRoadmapSummary } from '../../../api/types.ts';
import type {
	BacklogFeatureActionsProps,
	InProgressFeatureActionsProps,
	InvalidStatusFeatureActionsProps,
	WaitingApprovalFeatureActionsProps,
} from './FeatureActionVariants.tsx';

import { Badge } from '../../../components/ui/badge.tsx';
import { selectClass } from '../../../lib/formStyles.ts';
import {
	BacklogFeatureActions,
	InProgressFeatureActions,
	InvalidStatusFeatureActions,
	ReadOnlyFeatureActions,
	WaitingApprovalFeatureActions,
} from './FeatureActionVariants.tsx';
import { FEATURE_STATUS_OPTIONS, featurePriorityTone } from './featuresUtils.ts';
import { stringValue } from './shared.ts';

/**
 * Priority, rendered the one way. The stacked card below `xl` used to print the bare number as
 * foreground text — `PRIORITY / 3` where the table showed a toned `P3` — so the tone that carries
 * the entire signal (P1 red, P2 amber, P3 neutral) vanished at the width where the table did, and
 * the value changed shape at the same time. Both layouts call this now.
 */
export function FeaturePriorityBadge({ priority }: { priority: number | string | undefined }) {
	if (typeof priority !== 'number') {
		return <span className="text-xs text-muted-foreground">—</span>;
	}
	return <Badge tone={featurePriorityTone(priority)}>P{priority}</Badge>;
}

/**
 * A `quiet` control reads as its value until the row is hovered or the control is focused, at which
 * point it takes on the full `selectClass` chrome. In the features table a bordered select per row
 * was the heaviest element in the row — heavier than the feature title — so fifteen rows read as a
 * form rather than a list. Styling rather than conditional rendering keeps it in the tab order.
 */
const quietSelectClass =
	'w-full max-w-44 min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-foreground transition-colors group-hover:border-border group-hover:bg-card focus:border-border focus:bg-card focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none';

export function FeatureMilestoneControl({
	disabled,
	feature,
	milestoneOptions,
	onChange,
	quiet = false,
	roadmap,
}: {
	disabled: boolean;
	feature: ProjectFeature;
	milestoneOptions: string[];
	onChange: (milestone: string) => void;
	quiet?: boolean;
	roadmap: null | ProjectRoadmapSummary;
}) {
	const id = feature.id || stringValue(feature, 'id');
	const milestone = typeof feature.milestone === 'string' ? feature.milestone : '';
	const milestoneIsKnown = milestone === '' || milestoneOptions.includes(milestone);
	if (!roadmap) {
		return <span className="text-xs text-muted-foreground">—</span>;
	}
	return (
		<div className="flex flex-wrap items-center gap-2">
			<select
				aria-label={`Milestone for ${id}`}
				className={quiet ? quietSelectClass : `${selectClass} w-full max-w-44 min-w-0 px-2`}
				disabled={disabled || milestoneOptions.length === 0}
				onChange={(event) => onChange(event.target.value)}
				value={milestone}>
				{milestone ? null : (
					<option disabled value="">
						Unassigned
					</option>
				)}
				{milestone && !milestoneIsKnown ? (
					<option disabled value={milestone}>
						Invalid: {milestone}
					</option>
				) : null}
				{milestoneOptions.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
			{milestone ? null : <Badge tone="amber">Unassigned</Badge>}
			{milestone && !milestoneIsKnown ? <Badge tone="red">Invalid</Badge> : null}
		</div>
	);
}

interface FeatureActionsProps extends BacklogFeatureActionsProps {
	decision: string;
	onApprove: (feature: ProjectFeature, decisionRequired: boolean) => void;
	onDecisionChange: (value: string) => void;
	status: string;
}

export function FeatureActions({
	decision,
	disabled,
	feature,
	launching,
	onApprove,
	onDecisionChange,
	onDelete,
	onLaunchRun,
	onSelect,
	onStatusChange,
	runActive,
	status,
}: FeatureActionsProps) {
	const inProgressProps: InProgressFeatureActionsProps = {
		disabled,
		feature,
		launching,
		onLaunchRun,
		onSelect,
		runActive,
	};
	if (status === 'backlog') {
		return (
			<BacklogFeatureActions
				{...inProgressProps}
				onDelete={onDelete}
				onStatusChange={onStatusChange}
			/>
		);
	}
	if (
		typeof feature.status === 'string' &&
		!FEATURE_STATUS_OPTIONS.some((option) => option === feature.status)
	) {
		const invalidStatusProps: InvalidStatusFeatureActionsProps = {
			disabled,
			feature,
			onSelect,
			onStatusChange,
			status,
		};
		return <InvalidStatusFeatureActions {...invalidStatusProps} />;
	}
	if (status === 'in_progress') return <InProgressFeatureActions {...inProgressProps} />;
	if (status === 'waiting_approval') {
		const waitingApprovalProps: WaitingApprovalFeatureActionsProps = {
			decision,
			disabled,
			feature,
			onApprove,
			onDecisionChange,
			onDelete,
			onSelect,
		};
		return <WaitingApprovalFeatureActions {...waitingApprovalProps} />;
	}
	return <ReadOnlyFeatureActions feature={feature} onSelect={onSelect} />;
}
