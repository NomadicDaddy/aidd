import { default as Check } from 'lucide-react/dist/esm/icons/check';
import { default as ClipboardCheck } from 'lucide-react/dist/esm/icons/clipboard-check';
import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';

import type {
	ProjectFeature,
	ProjectFeatureStatus,
	ProjectRoadmapSummary,
} from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { selectClass } from '../../../lib/formStyles.ts';
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
		return <span className="text-xs text-neutral-500">—</span>;
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

function FeatureDetailsButton({
	feature,
	onSelect,
}: {
	feature: ProjectFeature;
	onSelect: (feature: ProjectFeature) => void;
}) {
	const id = feature.id || stringValue(feature, 'id');
	return (
		<Button
			aria-label={`View details for ${id}`}
			onClick={() => onSelect(feature)}
			size="compact"
			title="View feature details"
			variant="secondary">
			<Eye className="h-4 w-4" />
			Details
		</Button>
	);
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
}: {
	decision: string;
	disabled: boolean;
	feature: ProjectFeature;
	launching: boolean;
	onApprove: (feature: ProjectFeature, decisionRequired: boolean) => void;
	onDecisionChange: (value: string) => void;
	onDelete: (feature: ProjectFeature) => void;
	onLaunchRun: (feature: ProjectFeature) => void;
	onSelect: (feature: ProjectFeature) => void;
	onStatusChange: (feature: ProjectFeature, status: ProjectFeatureStatus) => void;
	runActive: boolean;
	status: string;
}) {
	const id = feature.id || stringValue(feature, 'id');
	if (status === 'backlog') {
		return (
			<div className="flex flex-wrap items-center gap-2">
				<FeatureDetailsButton feature={feature} onSelect={onSelect} />
				<select
					aria-label={`Status for ${id}`}
					className={`${selectClass} px-2`}
					disabled={disabled}
					onChange={(event) =>
						onStatusChange(feature, event.target.value as ProjectFeatureStatus)
					}
					value={status}>
					{FEATURE_STATUS_OPTIONS.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
				<Button
					aria-label={`Launch coding run for ${id}`}
					disabled={disabled || launching || runActive}
					onClick={() => onLaunchRun(feature)}
					size="compact"
					title={
						runActive
							? 'A run for this project is already in progress'
							: 'Launch a feature-specific coding run'
					}>
					<Play className="h-4 w-4" />
					{launching ? 'Launching…' : runActive ? 'Run active' : 'Launch run'}
				</Button>
				<Button
					aria-label={`Delete ${id}`}
					disabled={disabled}
					onClick={() => onDelete(feature)}
					size="compact"
					title="Delete"
					variant="danger">
					<Trash2 className="h-4 w-4" />
					Delete
				</Button>
			</div>
		);
	}
	if (status === 'in_progress') {
		return (
			<div className="flex flex-wrap items-center gap-2">
				<FeatureDetailsButton feature={feature} onSelect={onSelect} />
				<Button
					aria-label={`Launch coding run for ${id}`}
					disabled={disabled || launching || runActive}
					onClick={() => onLaunchRun(feature)}
					size="compact"
					title={
						runActive
							? 'A run for this project is already in progress'
							: 'Launch a feature-specific coding run'
					}>
					<Play className="h-4 w-4" />
					{launching ? 'Launching…' : runActive ? 'Run active' : 'Launch run'}
				</Button>
			</div>
		);
	}
	if (status === 'waiting_approval') {
		return (
			<div className="flex flex-wrap items-center gap-2">
				<FeatureDetailsButton feature={feature} onSelect={onSelect} />
				<Button
					aria-label={`Delete ${id}`}
					disabled={disabled}
					onClick={() => onDelete(feature)}
					size="compact"
					title="Delete"
					variant="danger">
					<Trash2 className="h-4 w-4" />
					Delete
				</Button>
				<Button
					aria-label={`Approve ${id}`}
					disabled={disabled}
					onClick={() => onApprove(feature, false)}
					size="compact"
					title="Approve">
					<Check className="h-4 w-4" />
					Approve
				</Button>
				<Input
					aria-label={`Decision for ${id}`}
					className="w-full min-w-0"
					disabled={disabled}
					onChange={(event) => onDecisionChange(event.target.value)}
					placeholder="Decision"
					value={decision}
				/>
				<Button
					aria-label={`Approve ${id} with decision`}
					disabled={disabled}
					onClick={() => onApprove(feature, true)}
					size="compact"
					title="Approve with decision">
					<ClipboardCheck className="h-4 w-4" />
					Approve with decision
				</Button>
			</div>
		);
	}
	// Read-only statuses (completed etc.): same wrapping container as the interactive
	// branches — the bare button clipped out of view at the narrowest mobile width (320px).
	return (
		<div className="flex min-w-0 flex-wrap items-center gap-2">
			<FeatureDetailsButton feature={feature} onSelect={onSelect} />
		</div>
	);
}
