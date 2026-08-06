import { default as Play } from 'lucide-react/dist/esm/icons/play';

import type { RunMode } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { FilePath } from '../../components/shared/FilePath.tsx';
import { LaunchTargetControl } from '../../components/shared/LaunchTargetControl.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { cn } from '../../lib/cn.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';

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
			{/* The section title belongs to the card, not to the page background above it — the
			    house header row (icon + title) is what Dashboard and Director use at this type step. */}
			<CardHeader
				className="mb-3"
				icon={<Play aria-hidden="true" className="h-4 w-4 text-accent" />}
				title="Launch Run"
			/>
			<div className="flex flex-wrap items-center gap-3">
				<select
					aria-errormessage={projectError ? 'launch-project-error' : undefined}
					aria-invalid={projectError || undefined}
					aria-label="Project to launch"
					// No 'chosen' fill: a teal wash on the picked project made a third teal
					// emphasis in a row that already has the solid teal Launch CTA, and the
					// select already shows its own value. The invalid state comes from
					// formControlClass's aria-invalid variant.
					className={cn(selectClass, 'min-w-44 flex-1')}
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
						size="control"
						value={launchTarget}
					/>
				) : null}
				<Button disabled={disabled} onClick={onLaunch} variant="primary">
					<Play className="h-4 w-4" />
					Launch
				</Button>
			</div>
			{projectError && (
				<p className={`text-xs ${toneText.red}`} id="launch-project-error" role="alert">
					Select a project before launching
				</p>
			)}
			{selectedLaunchProject && (
				// Only the resolved path: 'Selected: {name}' restated the value the select
				// already displays, in a third teal that competed with the Launch button.
				<p aria-live="polite" className="min-w-0">
					<FilePath
						className="block truncate text-xs text-muted-foreground"
						path={selectedLaunchProject.path}
					/>
				</p>
			)}
		</Card>
	);
}
