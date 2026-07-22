import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as Sparkles } from 'lucide-react/dist/esm/icons/sparkles';

import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { LaunchTargetControl } from '../../components/shared/LaunchTargetControl.tsx';
import { Button } from '../../components/ui/button.tsx';

// Footer of the create lane: launch-target chip for the first run/intake (global
// defaults — the project directory does not exist yet) plus cancel/advisor/create.
export function ProjectCreateActions({
	advisorDisabled,
	advisorNeedsSpec,
	advisorPending,
	createDisabled,
	createLabel,
	createPending,
	launchTarget,
	onAskAdvisor,
	onClose,
	onLaunchTargetChange,
	onSubmit,
	showAdvisor,
}: {
	advisorDisabled: boolean;
	advisorNeedsSpec: boolean;
	advisorPending: boolean;
	createDisabled: boolean;
	createLabel: string;
	createPending: boolean;
	launchTarget: LaunchTargetValue;
	onAskAdvisor: () => void;
	onClose: () => void;
	onLaunchTargetChange: (value: LaunchTargetValue) => void;
	onSubmit: () => void;
	showAdvisor: boolean;
}) {
	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			<div className="mr-auto">
				<LaunchTargetControl onChange={onLaunchTargetChange} value={launchTarget} />
			</div>
			<Button onClick={onClose} variant="ghost">
				Cancel
			</Button>
			{showAdvisor ? (
				<Button
					disabled={advisorDisabled}
					onClick={onAskAdvisor}
					title={
						advisorNeedsSpec
							? 'Add a spec so the advisor can recommend a mode.'
							: undefined
					}
					variant="secondary">
					{advisorPending ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Sparkles className="h-4 w-4" />
					)}
					{advisorPending ? 'Asking advisor…' : 'Choose for me'}
				</Button>
			) : null}
			<Button disabled={createDisabled} onClick={onSubmit}>
				{createPending ? (
					<Loader2 className="h-4 w-4 animate-spin" />
				) : (
					<Plus className="h-4 w-4" />
				)}
				{createLabel}
			</Button>
		</div>
	);
}
