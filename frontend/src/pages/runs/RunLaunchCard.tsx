import { default as Play } from 'lucide-react/dist/esm/icons/play';

import type { RunMode } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { LaunchTargetControl } from '../../components/shared/LaunchTargetControl.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { cn } from '../../lib/cn.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { selectClass } from '../../lib/formStyles.ts';

export function RunLaunchCard({
	disabled,
	extraArgs,
	launchTarget,
	mode,
	onExtraArgsChange,
	onLaunch,
	onLaunchTargetChange,
	onModeChange,
	onProjectDirChange,
	projectDir,
	projectError,
	projects,
	selectedLaunchProject,
}: {
	disabled: boolean;
	extraArgs: string;
	launchTarget: LaunchTargetValue;
	mode: RunMode;
	onExtraArgsChange: (value: string) => void;
	onLaunch: () => void;
	onLaunchTargetChange: (value: LaunchTargetValue) => void;
	onModeChange: (mode: RunMode) => void;
	onProjectDirChange: (value: string) => void;
	projectDir: string;
	projectError: boolean;
	projects: { id: string; name: string; path: string }[];
	selectedLaunchProject: { name: string; path: string } | undefined;
}) {
	return (
		<Card className="space-y-2">
			<div className="flex flex-wrap items-center gap-3">
				<select
					aria-errormessage={projectError ? 'launch-project-error' : undefined}
					aria-invalid={projectError || undefined}
					aria-label="Project to launch"
					className={cn(
						selectClass,
						'min-w-44 flex-1',
						projectError
							? 'border-red-500 bg-card text-foreground focus:border-red-500 focus-visible:ring-red-200 dark:border-red-400 dark:focus:border-red-400 dark:focus-visible:ring-red-900/40'
							: projectDir
								? 'border-teal-500 bg-teal-50 text-teal-950 focus-visible:ring-teal-200 dark:border-teal-500 dark:bg-teal-950/30 dark:text-teal-100 dark:focus-visible:ring-teal-900/40'
								: 'border-border bg-card text-foreground focus-visible:ring-ring',
					)}
					onChange={(event) => {
						traceDataMovement({
							category: 'event',
							layer: 'ui',
							operation: 'runs.launch.project.change',
							source: 'RunsPage',
							summary: { selected: event.target.value.length > 0 },
						});
						onProjectDirChange(event.target.value);
					}}
					value={projectDir}>
					<option value="">Select project</option>
					{projects.map((project) => (
						<option key={project.id} value={project.path}>
							{project.name}
						</option>
					))}
				</select>
				<select
					aria-label="Run mode"
					className={cn(selectClass, 'min-w-32')}
					onChange={(event) => {
						traceDataMovement({
							category: 'event',
							layer: 'ui',
							operation: 'runs.launch.mode.change',
							source: 'RunsPage',
							summary: { mode: event.target.value },
						});
						onModeChange(event.target.value as RunMode);
					}}
					value={mode}>
					<option value="coding">Coding</option>
					<option value="audit">Audit</option>
					<option value="todo">Todo</option>
					<option value="triumvirate">Triumvirate</option>
					<option value="validate">Validate</option>
				</select>
				<Input
					aria-label="Additional CLI args"
					className="min-w-56 flex-[2]"
					onChange={(event) => onExtraArgsChange(event.target.value)}
					placeholder="Additional args (e.g. --filter-by id --filter audit-*)"
					value={extraArgs}
				/>
				{/* Triumvirate launches configure all four roles in the dedicated panel below. */}
				{mode !== 'triumvirate' ? (
					<LaunchTargetControl
						mode={mode}
						onChange={onLaunchTargetChange}
						projectDir={projectDir}
						value={launchTarget}
					/>
				) : null}
				<Button disabled={disabled} onClick={onLaunch} variant="primary">
					<Play className="h-4 w-4" />
					Launch
				</Button>
			</div>
			{projectError && (
				<p
					className="text-xs text-red-700 dark:text-red-400"
					id="launch-project-error"
					role="alert">
					Select a project before launching
				</p>
			)}
			{selectedLaunchProject && (
				<p aria-live="polite" className="text-xs text-teal-800 dark:text-teal-200">
					Selected: {selectedLaunchProject.name}
					<span className="block truncate text-teal-700/80 dark:text-teal-300/80">
						{selectedLaunchProject.path}
					</span>
				</p>
			)}
		</Card>
	);
}
