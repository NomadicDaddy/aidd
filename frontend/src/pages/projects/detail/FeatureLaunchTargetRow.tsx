import type { LaunchTargetValue } from '../../../api/types/launchDefaults.ts';

import { LaunchTargetControl } from '../../../components/shared/LaunchTargetControl.tsx';

// Tab-level "which CLI/model will runs launched here use" row: one chip governs every
// feature run started from the surrounding tab (per-row chips would be noise × N rows).
export function FeatureLaunchTargetRow({
	label,
	onChange,
	projectDir,
	value,
}: {
	label: string;
	onChange: (value: LaunchTargetValue) => void;
	projectDir: string;
	value: LaunchTargetValue;
}) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-xs text-muted-foreground">{label}</span>
			<LaunchTargetControl onChange={onChange} projectDir={projectDir} value={value} />
		</div>
	);
}
