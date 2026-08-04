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
import { FEATURE_STATUS_OPTIONS } from './featuresUtils.ts';
import { stringValue } from './shared.ts';

export function FeatureMilestoneControl({
	disabled,
	feature,
	milestoneOptions,
	onChange,
	roadmap,
}: {
	disabled: boolean;
	feature: ProjectFeature;
	milestoneOptions: string[];
	onChange: (milestone: string) => void;
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
				className={`${selectClass} w-full max-w-44 min-w-0 px-2`}
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
