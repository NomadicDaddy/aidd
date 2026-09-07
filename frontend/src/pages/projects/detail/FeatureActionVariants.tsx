import { isDismissableFinding } from 'aidd-shared/contracts/finding-dispositions';
import { default as Check } from 'lucide-react/dist/esm/icons/check';
import { default as ClipboardCheck } from 'lucide-react/dist/esm/icons/clipboard-check';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';

import type { ProjectFeature, ProjectFeatureStatus } from '../../../api/types.ts';
import type {
	FeatureDetailsActionProps,
	FeatureLaunchButtonProps,
} from './FeatureActionControls.tsx';

import { Button } from '../../../components/ui/button.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { dangerRowActionClass } from '../../../lib/tones.ts';
import {
	FeatureActionGroup,
	FeatureDetailsButton,
	FeatureLaunchButton,
	FeatureStatusSelect,
} from './FeatureActionControls.tsx';
import { stringValue } from './shared.ts';

export type InProgressFeatureActionsProps = FeatureDetailsActionProps & FeatureLaunchButtonProps;

export interface BacklogFeatureActionsProps extends InProgressFeatureActionsProps {
	onDelete: (feature: ProjectFeature) => void;
	onStatusChange: (feature: ProjectFeature, status: ProjectFeatureStatus) => void;
	showStatusControl?: boolean;
}

export interface InvalidStatusFeatureActionsProps extends FeatureDetailsActionProps {
	disabled: boolean;
	feature: ProjectFeature;
	onStatusChange: (feature: ProjectFeature, status: ProjectFeatureStatus) => void;
	showStatusControl?: boolean;
	status: string;
}

export interface WaitingApprovalFeatureActionsProps extends FeatureDetailsActionProps {
	decision: string;
	disabled: boolean;
	onApprove: (feature: ProjectFeature, decisionRequired: boolean) => void;
	onDecisionChange: (value: string) => void;
	onDelete: (feature: ProjectFeature) => void;
}

export function BacklogFeatureActions({
	disabled,
	feature,
	inventory,
	launching,
	onDelete,
	onLaunchRun,
	onSelect,
	onStatusChange,
	runActive,
	showStatusControl = true,
}: BacklogFeatureActionsProps) {
	const id = feature.id || stringValue(feature, 'id');
	const isFinding = isDismissableFinding(feature);
	return (
		<FeatureActionGroup>
			<FeatureDetailsButton feature={feature} onSelect={onSelect} />
			{showStatusControl ? (
				<FeatureStatusSelect
					disabled={disabled}
					feature={feature}
					onStatusChange={onStatusChange}
					status="backlog"
				/>
			) : null}
			<FeatureLaunchButton
				disabled={disabled}
				feature={feature}
				inventory={inventory}
				launching={launching}
				onLaunchRun={onLaunchRun}
				runActive={runActive}
			/>
			<Button
				aria-label={`${isFinding ? 'Dismiss' : 'Delete'} ${id}`}
				className={dangerRowActionClass}
				disabled={disabled}
				onClick={() => onDelete(feature)}
				size="compact"
				title={isFinding ? 'Dismiss' : 'Delete'}
				variant="ghost">
				<Trash2 className="h-4 w-4" />
				{isFinding ? 'Dismiss' : 'Delete'}
			</Button>
		</FeatureActionGroup>
	);
}

export function InvalidStatusFeatureActions({
	disabled,
	feature,
	onSelect,
	onStatusChange,
	showStatusControl = true,
	status,
}: InvalidStatusFeatureActionsProps) {
	return (
		<FeatureActionGroup>
			<FeatureDetailsButton feature={feature} onSelect={onSelect} />
			{showStatusControl ? (
				<FeatureStatusSelect
					disabled={disabled}
					feature={feature}
					onStatusChange={onStatusChange}
					status={status}
				/>
			) : null}
		</FeatureActionGroup>
	);
}

export function InProgressFeatureActions(props: InProgressFeatureActionsProps) {
	const { disabled, feature, inventory, launching, onLaunchRun, onSelect, runActive } = props;
	return (
		<FeatureActionGroup>
			<FeatureDetailsButton feature={feature} onSelect={onSelect} />
			<FeatureLaunchButton
				disabled={disabled}
				feature={feature}
				inventory={inventory}
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
	const isFinding = isDismissableFinding(feature);
	return (
		<FeatureActionGroup>
			<FeatureDetailsButton feature={feature} onSelect={onSelect} />
			<Button
				aria-label={`${isFinding ? 'Dismiss' : 'Delete'} ${id}`}
				className={dangerRowActionClass}
				disabled={disabled}
				onClick={() => onDelete(feature)}
				size="compact"
				title={isFinding ? 'Dismiss' : 'Delete'}
				variant="ghost">
				<Trash2 className="h-4 w-4" />
				{isFinding ? 'Dismiss' : 'Delete'}
			</Button>
			{/* A row action, not the surface's action. WaitingApprovalRows made the same call on the
			    dashboard; its comment records why a queue of solid plates leads with nothing. */}
			<Button
				aria-label={`Approve ${id}`}
				disabled={disabled}
				onClick={() => onApprove(feature, false)}
				size="compact"
				title="Approve"
				variant="secondary">
				<Check className="h-4 w-4" />
				Approve
			</Button>
			{/* The field and the button that consumes it share a line. `w-full` on the Input took a
			    line of its own and pushed the button onto a third, which is why a waiting-approval
			    row was the tallest thing in the table. The pair keeps `flex-wrap`, so where the cell
			    is narrower than the button it stacks instead of overflowing. */}
			<div className="flex w-full min-w-0 flex-wrap items-center gap-2">
				<Input
					aria-label={`Decision for ${id}`}
					className="w-auto min-w-32 flex-1"
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
					title="Approve with decision"
					variant="secondary">
					<ClipboardCheck className="h-4 w-4" />
					Approve with decision
				</Button>
			</div>
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
