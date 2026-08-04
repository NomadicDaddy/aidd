import type { SkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { useId } from 'react';

import type { ProjectSummary } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { cn } from '../../lib/cn.ts';
import { fieldLabelClass, selectClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { LaunchTargetControl } from './LaunchTargetControl.tsx';

interface LaunchFormProps {
	args: string;
	className?: string;
	executionIntent: SkillExecutionIntent;
	launchLabel: string;
	launchPending: boolean;
	launchTarget: LaunchTargetValue;
	onExecutionIntentChange: (value: SkillExecutionIntent) => void;
	onLaunch: () => void;
	onLaunchTargetChange: (value: LaunchTargetValue) => void;
	projectDir: string;
	projects: ProjectSummary[];
	setArgs: (value: string) => void;
	setProjectDir: (value: string) => void;
}

export function LaunchForm({
	args,
	className,
	executionIntent,
	launchLabel,
	launchPending,
	launchTarget,
	onExecutionIntentChange,
	onLaunch,
	onLaunchTargetChange,
	projectDir,
	projects,
	setArgs,
	setProjectDir,
}: LaunchFormProps) {
	const hintId = useId();
	const projectMissing = projectDir.length === 0;
	const disabled = projectMissing || launchPending;
	return (
		<Card {...(className ? { className } : {})}>
			<div className="space-y-3">
				<div className="grid gap-3 md:grid-cols-2">
					<label className="space-y-1">
						<span className={fieldLabelClass}>Project</span>
						<select
							aria-describedby={projectMissing ? hintId : undefined}
							aria-invalid={projectMissing || undefined}
							className={`${selectClass} w-full`}
							onChange={(event) => setProjectDir(event.target.value)}
							value={projectDir}>
							<option value="">Select project</option>
							{projects.map((project) => (
								<option key={project.path} value={project.path}>
									{project.name}
								</option>
							))}
						</select>
						{projectMissing ? (
							<p className={cn('text-xs', toneText.amber)} id={hintId}>
								Choose a project to enable launch.
							</p>
						) : null}
					</label>
					<label className="space-y-1">
						<span className={fieldLabelClass}>Arguments</span>
						<Input
							onChange={(event) => setArgs(event.target.value)}
							placeholder="Passed as $ARGUMENTS"
							value={args}
						/>
					</label>
				</div>
				<div className="rounded-md border border-accent/30 bg-accent-muted/60 p-3 text-sm">
					<p className="font-medium text-foreground">
						Skills run as autonomous directives, not aidd audits.
					</p>
					<label className="mt-3 grid gap-1">
						<span className={fieldLabelClass}>Execution intent</span>
						<select
							className={`${selectClass} w-full`}
							onChange={(event) =>
								onExecutionIntentChange(event.target.value as SkillExecutionIntent)
							}
							value={executionIntent}>
							<option value="review-only">Review only</option>
							<option value="apply-changes">Apply changes</option>
						</select>
						<span className="text-xs text-muted-foreground">
							{executionIntent === 'review-only'
								? 'The directive forbids repository, metadata, changelog, and git mutations.'
								: 'The directive may execute commands, edit project files and metadata, and create commits when needed.'}
						</span>
					</label>
				</div>
				<LaunchTargetControl
					mode="directive"
					onChange={onLaunchTargetChange}
					projectDir={projectDir}
					value={launchTarget}
				/>
				<Button disabled={disabled} onClick={onLaunch} variant="primary">
					<Play className="h-4 w-4" />
					{launchLabel}
				</Button>
			</div>
		</Card>
	);
}
