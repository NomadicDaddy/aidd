import type { ReactNode } from 'react';

import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as Play } from 'lucide-react/dist/esm/icons/play';

import type { ProjectFeature, ProjectFeatureStatus } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { humanizeEnum } from '../../../lib/formatters.ts';
import { selectClass } from '../../../lib/formStyles.ts';
import {
	featureLaunchBlockedTitle,
	featureLaunchGate,
	featurePassesDisagrees,
} from './featureLaunchEligibility.ts';
import { FEATURE_STATUS_OPTIONS } from './featuresUtils.ts';
import { stringValue } from './shared.ts';

export interface FeatureDetailsActionProps {
	feature: ProjectFeature;
	onSelect: (feature: ProjectFeature) => void;
}

export interface FeatureLaunchButtonProps {
	disabled: boolean;
	feature: ProjectFeature;
	/** Every feature the project has. A prerequisite absent from this list reads as unsatisfied. */
	inventory: ProjectFeature[];
	launching: boolean;
	onLaunchRun: (feature: ProjectFeature) => void;
	runActive: boolean;
}

export interface FeatureStatusSelectProps {
	disabled: boolean;
	feature: ProjectFeature;
	onStatusChange: (feature: ProjectFeature, status: ProjectFeatureStatus) => void;
	status: string;
}

export function FeatureActionGroup({
	children,
	className = 'flex flex-wrap items-center gap-2',
}: {
	children: ReactNode;
	className?: string;
}) {
	return <div className={className}>{children}</div>;
}

export function FeatureDetailsButton({ feature, onSelect }: FeatureDetailsActionProps) {
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

export function FeatureLaunchButton({
	disabled,
	feature,
	inventory,
	launching,
	onLaunchRun,
	runActive,
}: FeatureLaunchButtonProps) {
	const id = feature.id || stringValue(feature, 'id');
	const metadataConflict = featurePassesDisagrees(feature, stringValue(feature, 'status'));
	const gate = featureLaunchGate(feature, inventory);
	return (
		<Button
			aria-label={`Launch coding run for ${id}`}
			disabled={disabled || launching || !gate.canLaunch || runActive}
			onClick={() => onLaunchRun(feature)}
			size="compact"
			title={
				metadataConflict
					? 'Cannot launch: passes is true while status is not completed'
					: gate.blockedBy.length > 0
						? featureLaunchBlockedTitle(gate.blockedBy)
						: runActive
							? 'A run for this project is already in progress'
							: 'Launch a feature-specific coding run'
			}>
			<Play className="h-4 w-4" />
			{launching ? 'Launching…' : runActive ? 'Run active' : 'Launch run'}
		</Button>
	);
}

export function FeatureStatusSelect({
	disabled,
	feature,
	onStatusChange,
	status,
}: FeatureStatusSelectProps) {
	const id = feature.id || stringValue(feature, 'id');
	const invalidStatus = !FEATURE_STATUS_OPTIONS.some((option) => option === status);
	return (
		// No width, which is what `selectClass` documents: `w-full` on a flex item resolves to the
		// whole action group and takes a line of its own, so this select alone made every backlog row
		// three lines tall however much width the column had. Its intrinsic width is its longest
		// option — 156px — and `min-w-0` from the shared chrome still lets it shrink below that.
		<select
			aria-label={`Status for ${id}`}
			className={`${selectClass} px-2`}
			disabled={disabled}
			onChange={(event) =>
				onStatusChange(feature, event.target.value as ProjectFeatureStatus)
			}
			value={status}>
			{invalidStatus ? (
				<option disabled value={status}>
					{humanizeEnum(status)} (invalid)
				</option>
			) : null}
			{FEATURE_STATUS_OPTIONS.map((option) => (
				<option key={option} value={option}>
					{humanizeEnum(option)}
				</option>
			))}
		</select>
	);
}
