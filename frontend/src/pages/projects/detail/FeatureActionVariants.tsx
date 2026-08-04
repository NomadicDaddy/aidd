import type { ReactNode } from 'react';

import { default as Check } from 'lucide-react/dist/esm/icons/check';
import { default as ClipboardCheck } from 'lucide-react/dist/esm/icons/clipboard-check';
import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';

import type { ProjectFeature, ProjectFeatureStatus } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { selectClass } from '../../../lib/formStyles.ts';
import { FEATURE_STATUS_OPTIONS } from './featuresUtils.ts';
import { stringValue } from './shared.ts';

interface FeatureDetailsActionProps {
	feature: ProjectFeature;
	onSelect: (feature: ProjectFeature) => void;
}

interface FeatureLaunchButtonProps {
	disabled: boolean;
	feature: ProjectFeature;
	launching: boolean;
	onLaunchRun: (feature: ProjectFeature) => void;
	runActive: boolean;
}

export type InProgressFeatureActionsProps = FeatureDetailsActionProps & FeatureLaunchButtonProps;

export interface BacklogFeatureActionsProps extends InProgressFeatureActionsProps {
	onDelete: (feature: ProjectFeature) => void;
	onStatusChange: (feature: ProjectFeature, status: ProjectFeatureStatus) => void;
}

export interface InvalidStatusFeatureActionsProps extends FeatureDetailsActionProps {
	disabled: boolean;
	feature: ProjectFeature;
	onStatusChange: (feature: ProjectFeature, status: ProjectFeatureStatus) => void;
	status: string;
}

export interface WaitingApprovalFeatureActionsProps extends FeatureDetailsActionProps {
	decision: string;
	disabled: boolean;
	onApprove: (feature: ProjectFeature, decisionRequired: boolean) => void;
	onDecisionChange: (value: string) => void;
	onDelete: (feature: ProjectFeature) => void;
}

function FeatureActionGroup({
	children,
	className = 'flex flex-wrap items-center gap-2',
}: {
	children: ReactNode;
	className?: string;
}) {
	return <div className={className}>{children}</div>;
}

function FeatureDetailsButton({ feature, onSelect }: FeatureDetailsActionProps) {
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

function FeatureLaunchButton({
	disabled,
	feature,
	launching,
	onLaunchRun,
	runActive,
}: FeatureLaunchButtonProps) {
	const id = feature.id || stringValue(feature, 'id');
	return (
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
	);
}

function FeatureStatusSelect({
	disabled,
	feature,
	onStatusChange,
	status,
}: { status: string } & Pick<
	BacklogFeatureActionsProps,
	'disabled' | 'feature' | 'onStatusChange'
>) {
	const id = feature.id || stringValue(feature, 'id');
	const invalidStatus = !FEATURE_STATUS_OPTIONS.some((option) => option === status);
	return (
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
					{status} (invalid)
				</option>
			) : null}
			{FEATURE_STATUS_OPTIONS.map((option) => (
				<option key={option} value={option}>
					{option}
				</option>
			))}
		</select>
	);
}

export function BacklogFeatureActions({
	disabled,
	feature,
	launching,
	onDelete,
	onLaunchRun,
	onSelect,
	onStatusChange,
	runActive,
}: BacklogFeatureActionsProps) {
	const id = feature.id || stringValue(feature, 'id');
	return (
		<FeatureActionGroup>
			<FeatureDetailsButton feature={feature} onSelect={onSelect} />
			<FeatureStatusSelect
				disabled={disabled}
				feature={feature}
				onStatusChange={onStatusChange}
				status="backlog"
			/>
			<FeatureLaunchButton
				disabled={disabled}
				feature={feature}
				launching={launching}
				onLaunchRun={onLaunchRun}
				runActive={runActive}
			/>
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
		</FeatureActionGroup>
	);
}

export function InvalidStatusFeatureActions({
	disabled,
	feature,
	onSelect,
	onStatusChange,
	status,
}: InvalidStatusFeatureActionsProps) {
	return (
		<FeatureActionGroup>
			<FeatureDetailsButton feature={feature} onSelect={onSelect} />
			<FeatureStatusSelect
				disabled={disabled}
				feature={feature}
				onStatusChange={onStatusChange}
				status={status}
			/>
		</FeatureActionGroup>
	);
}

export function InProgressFeatureActions(props: InProgressFeatureActionsProps) {
	const { disabled, feature, launching, onLaunchRun, onSelect, runActive } = props;
	return (
		<FeatureActionGroup>
			<FeatureDetailsButton feature={feature} onSelect={onSelect} />
			<FeatureLaunchButton
				disabled={disabled}
				feature={feature}
				launching={launching}
				onLaunchRun={onLaunchRun}
				runActive={runActive}
			/>
		</FeatureActionGroup>
	);
}

export function WaitingApprovalFeatureActions({
	decision,
	disabled,
	feature,
	onApprove,
	onDecisionChange,
	onDelete,
	onSelect,
}: WaitingApprovalFeatureActionsProps) {
	const id = feature.id || stringValue(feature, 'id');
	return (
		<FeatureActionGroup>
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
		</FeatureActionGroup>
	);
}

export function ReadOnlyFeatureActions(props: FeatureDetailsActionProps) {
	// The shared wrapping contract prevents the Details button from clipping at 320px.
	return (
		<FeatureActionGroup className="flex min-w-0 flex-wrap items-center gap-2">
			<FeatureDetailsButton {...props} />
		</FeatureActionGroup>
	);
}
