import type { ProjectFeature, ProjectRoadmapSummary } from '../../../api/types.ts';
import type {
	BacklogFeatureActionsProps,
	InProgressFeatureActionsProps,
	InvalidStatusFeatureActionsProps,
	WaitingApprovalFeatureActionsProps,
} from './FeatureActionVariants.tsx';

import { Badge } from '../../../components/ui/badge.tsx';
import { quietSelectClass, selectClass } from '../../../lib/formStyles.ts';
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
 * Priority, rendered the one way. Both the table and the stacked card below `xl` call this, so the
 * value does not change shape with the layout — a bare `PRIORITY / 3` in foreground text on the
 * card where the table shows a toned `P3`. A priority shared by every visible row stays neutral;
 * otherwise the tone carries the distinction (P1 red, P2 amber, P3 neutral).
 */
export function FeaturePriorityBadge({
	deemphasized,
	priority,
}: {
	deemphasized: boolean;
	priority: number | string | undefined;
}) {
	if (typeof priority !== 'number') {
		return <span className="text-xs text-muted-foreground">—</span>;
	}
	return (
		<Badge tone={deemphasized ? 'neutral' : featurePriorityTone(priority)}>P{priority}</Badge>
	);
}

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
				className={
					quiet
						? `${quietSelectClass} max-w-full px-2`
						: `${selectClass} w-full max-w-44 min-w-0 px-2`
				}
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
	showStatusControl?: boolean;
	status: string;
}

export function FeatureActions({
	decision,
	disabled,
	feature,
	inventory,
	launching,
	onApprove,
	onDecisionChange,
	onDelete,
	onLaunchRun,
	onSelect,
	onStatusChange,
	runActive,
	showStatusControl = true,
	status,
}: FeatureActionsProps) {
	const inProgressProps: InProgressFeatureActionsProps = {
		disabled,
		feature,
		inventory,
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
				showStatusControl={showStatusControl}
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
			showStatusControl,
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
