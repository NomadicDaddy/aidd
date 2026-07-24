import { useState } from 'react';
import { toast } from 'sonner';

import type { RunLaunchRequest, RunMode, RunRecord } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { useLaunchRun } from '../../hooks/useRuns.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { nullableText } from './runsUtils.ts';

// Launch-form state and submit flow, extracted from useRunsPage so the unified page
// orchestration stays under the file-size budget. The page supplies onLaunched to
// adjust filters/selection so the new run is visible.
export function useRunLaunchForm(onLaunched: (run: RunRecord) => void) {
	const launch = useLaunchRun();
	const [projectDir, setProjectDir] = useState('');
	const [projectError, setProjectError] = useState(false);
	const [mode, setMode] = useState<RunMode>('coding');
	// Overrides-only launch targets: an empty object means "use the resolved defaults",
	// which LaunchTargetControl displays live from /api/v1/launch-defaults rather than
	// copying settings values into editable fields.
	const [primaryTarget, setPrimaryTarget] = useState<LaunchTargetValue>({});
	const [secondaryTarget, setSecondaryTarget] = useState<LaunchTargetValue>({});
	const [overseerTarget, setOverseerTarget] = useState<LaunchTargetValue>({});
	const [execTarget, setExecTarget] = useState<LaunchTargetValue>({});
	const [extraArgs, setExtraArgs] = useState('');

	function submitLaunch(): void {
		if (!projectDir) {
			setProjectError(true);
			toast.error('Select a project before launching');
			return;
		}
		const request: RunLaunchRequest = { mode, projectDir };
		const launchExtraArgs = nullableText(extraArgs);
		if (launchExtraArgs) request.extraArgs = launchExtraArgs;
		// Only explicit overrides travel on the request; unset fields resolve on the
		// server (project config, then global config) — matching what the chip displays.
		if (primaryTarget.backend) request.backend = primaryTarget.backend;
		const primaryModel = nullableText(primaryTarget.model ?? '');
		if (primaryModel) request.model = primaryModel;
		const primaryEffort = nullableText(primaryTarget.reasoningEffort ?? '');
		if (primaryEffort) request.reasoningEffort = primaryEffort;
		if (mode === 'triumvirate') {
			if (secondaryTarget.backend) request.secondaryBackend = secondaryTarget.backend;
			if (overseerTarget.backend) request.overseerBackend = overseerTarget.backend;
			if (execTarget.backend) request.execBackend = execTarget.backend;
			const nextSecondaryModel = nullableText(secondaryTarget.model ?? '');
			const nextOverseerModel = nullableText(overseerTarget.model ?? '');
			const nextExecModel = nullableText(execTarget.model ?? '');
			if (nextSecondaryModel) request.secondaryModel = nextSecondaryModel;
			if (nextOverseerModel) request.overseerModel = nextOverseerModel;
			if (nextExecModel) request.execModel = nextExecModel;
		}
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'runs.launch.submit',
			source: 'RunsPage',
			summary: {
				hasExtraArgs: Boolean(launchExtraArgs),
				mode,
				projectSelected: projectDir.length > 0,
			},
			target: '/api/v1/runs',
		});
		launch.mutate(request, {
			onError(error) {
				toast.error(error instanceof Error ? error.message : 'Run launch failed');
			},
			onSuccess(run) {
				onLaunched(run);
				toast.success('Run launched');
			},
		});
	}

	return {
		execTarget,
		extraArgs,
		launch,
		mode,
		overseerTarget,
		primaryTarget,
		projectDir,
		projectError,
		secondaryTarget,
		setExecTarget,
		setExtraArgs,
		setMode,
		setOverseerTarget,
		setPrimaryTarget,
		setProjectDir,
		setProjectError,
		setSecondaryTarget,
		submitLaunch,
	};
}
