import type { LaunchTargetValue } from '../../../api/types/launchDefaults.ts';

import { LaunchTargetControl } from '../../../components/shared/LaunchTargetControl.tsx';

// Tab-level "which CLI/model will runs launched here use" row: one chip governs every
// feature run started from the surrounding tab (per-row chips would be noise × N rows).
//
// It renders as a strip inside the card whose Launch run buttons it governs — the features table,
// the dependency graph — rather than in the tab's flow. Loose in the flow it was the only uncarded
// control on either tab, a bordered chip floating in the 12px gap between two bordered panels, and
// it was the only thing on the page not visibly attached to what it changed. Overview already
// placed the identical control inside the Project maturity card header; this is that placement.
//
// The label is fixed rather than a prop. The two call sites had drifted to `Feature runs use` and
// `Runs use` for the same control governing the same kind of run.
export function FeatureLaunchTargetRow({
	onChange,
	projectDir,
	value,
}: {
	onChange: (value: LaunchTargetValue) => void;
	projectDir: string;
	value: LaunchTargetValue;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
			<span className="text-xs text-muted-foreground">Feature runs use</span>
			<LaunchTargetControl onChange={onChange} projectDir={projectDir} value={value} />
		</div>
	);
}
