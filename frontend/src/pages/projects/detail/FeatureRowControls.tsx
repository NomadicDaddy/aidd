import type { ProjectFeature, ProjectRoadmapSummary } from '../../../api/types.ts';
import type {
	BacklogFeatureActionsProps,
	InProgressFeatureActionsProps,
	InvalidStatusFeatureActionsProps,
	WaitingApprovalFeatureActionsProps,
} from './FeatureActionVariants.tsx';

import { Badge } from '../../../components/ui/badge.tsx';
import { cn } from '../../../lib/cn.ts';
import { controlFocusClass, quietSelectClass, selectClass } from '../../../lib/formStyles.ts';
import { toneBadge } from '../../../lib/tones.ts';
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
 * Priority, edited the one way. Both the table and the stacked card call this roadmap-backed
 * selector, so changing P1/P2/etc. moves the feature to the matching milestone and lets the store
 * keep the two values aligned. A priority shared by every visible row stays neutral; otherwise the
 * tone carries the distinction (P1 red, P2 amber, P3 neutral).
 */
export function FeaturePriorityControl({
	deemphasized,
	disabled,
	feature,
	onChange,
	priority,
	roadmap,
}: {
	deemphasized: boolean;
	disabled: boolean;
	feature: ProjectFeature;
	onChange: (milestone: string) => void;
	priority: number | string | undefined;
	roadmap: null | ProjectRoadmapSummary;
}) {
	if (typeof priority !== 'number') {
		return <span className="text-xs text-muted-foreground">—</span>;
	}
	const id = feature.id || stringValue(feature, 'id');
	const milestone = typeof feature.milestone === 'string' ? feature.milestone : '';
	const options =
		roadmap?.milestoneOrder.map((name, index) => ({ name, priority: index + 1 })) ?? [];
	if (!milestone || !options.some((option) => option.name === milestone)) {
		return (
			<Badge tone={deemphasized ? 'neutral' : featurePriorityTone(priority)}>
				P{priority}
			</Badge>
		);
	}
	const tone = deemphasized ? 'neutral' : featurePriorityTone(priority);
	return (
		<select
			aria-label={`Priority for ${id}`}
			className={cn(
				'min-h-11 w-20 cursor-pointer rounded-md border-0 px-2 py-1 text-xs font-medium whitespace-nowrap ring-1 outline-none ring-inset sm:min-h-0',
				controlFocusClass,
				toneBadge[tone],
			)}
			disabled={disabled}
			onChange={(event) => onChange(event.target.value)}
			title={`Priority P${priority} (${milestone}); changing priority also changes the milestone`}
			value={milestone}>
			{options.map((option) => (
				<option key={option.name} value={option.name}>
					P{option.priority} — {option.name}
				</option>
			))}
		</select>
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
