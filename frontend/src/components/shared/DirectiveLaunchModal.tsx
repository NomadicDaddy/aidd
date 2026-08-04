/* eslint-disable react-hooks/set-state-in-effect */
import type { SkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { useLaunchDefaults } from '../../hooks/useLaunchDefaults.ts';
import { useProjectNames } from '../../hooks/useProjects.ts';
import { useLaunchDirectiveRun } from '../../hooks/useRuns.ts';
import { cn } from '../../lib/cn.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { fieldLabelClass, selectClass, textareaClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { Button, IconButton } from '../ui/button.tsx';
import { Dialog, DialogPanel } from '../ui/dialog.tsx';
import {
	canLaunchDirective,
	DIRECTIVE_PROMPT_SAFETY_NOTICE,
	isDirectiveSubmitShortcut,
} from './directive-launch-policy.ts';
import { chooseDirectiveProjectPath } from './directive-launch-target.ts';
import { LaunchTargetBadge } from './LaunchTargetBadge.tsx';

interface DirectiveLaunchModalProps {
	onClose: () => void;
	open: boolean;
}

export function DirectiveLaunchModal({ onClose, open }: DirectiveLaunchModalProps) {
	const location = useLocation();
	const navigate = useNavigate();
	const projectsQuery = useProjectNames();
	const launch = useLaunchDirectiveRun();
	const projects = useMemo(
		() =>
			(projectsQuery.data?.projects ?? [])
				.filter((project) => !project.name.endsWith('.old'))
				.sort((left, right) => left.name.localeCompare(right.name)),
		[projectsQuery.data?.projects],
	);
	const [executionIntent, setExecutionIntent] = useState<SkillExecutionIntent>('review-only');
	const [projectDir, setProjectDir] = useState('');
	const [prompt, setPrompt] = useState('');
	const defaults = useLaunchDefaults(projectDir || undefined, 'directive');
	const effective = defaults.data?.effective;
	const canSubmit = canLaunchDirective({
		isPending: launch.isPending,
		projectDir,
		prompt,
	});

	useEffect(() => {
		if (!open) return;
		setProjectDir(chooseDirectiveProjectPath(projects, location.pathname));
	}, [location.pathname, open, projects]);

	function reset(): void {
		setExecutionIntent('review-only');
		setProjectDir('');
		setPrompt('');
	}

	function close(): void {
		onClose();
		reset();
	}

	function submit(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		const directive = prompt.trim();
		if (!projectDir) {
			toast.error('Select a project before launching');
			return;
		}
		if (!directive) {
			toast.error('Enter a directive before launching');
			return;
		}

		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'runs.directive.launch',
			source: 'DirectiveLaunchModal',
			summary: {
				executionIntent,
				projectSelected: true,
				promptLength: directive.length,
			},
			target: '/api/v1/runs/directive',
		});
		launch.mutate(
			{ executionIntent, projectDir, prompt: directive },
			{
				onError(error) {
					toast.error(error instanceof Error ? error.message : 'Directive launch failed');
				},
				onSuccess(run) {
					close();
					toast.success('Directive run launched', {
						action: {
							label: 'View run',
							onClick: () => {
								void navigate(`/runs?run=${encodeURIComponent(run.id)}`);
							},
						},
						description: run.projectName,
					});
				},
			},
		);
	}

	return (
		<Dialog
			aria-describedby="directive-launch-description"
			aria-labelledby="directive-launch-title"
			onClose={close}
			open={open}
			role="dialog">
			<DialogPanel className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto p-5">
				<form onSubmit={submit}>
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<ShieldCheck aria-hidden="true" className="h-4 w-4 text-accent" />
								<h2
									className="text-base font-semibold text-foreground"
									id="directive-launch-title">
									Launch directive
								</h2>
							</div>
							<p
								className="mt-1 text-sm text-muted-foreground"
								id="directive-launch-description">
								Send a free-text instruction to one project as a supervised run.
							</p>
						</div>
						<IconButton
							ariaLabel="Close directive launcher"
							onClick={close}
							variant="ghost">
							<X className="h-4 w-4" />
						</IconButton>
					</div>

					<div className="mt-5 grid gap-4">
						<label className="grid gap-1.5">
							<span className={fieldLabelClass}>Project</span>
							<select
								className={`${selectClass} h-10 w-full`}
								disabled={projectsQuery.isLoading || projects.length === 0}
								onChange={(event) => setProjectDir(event.target.value)}
								required
								value={projectDir}>
								<option value="">Select project</option>
								{projects.map((project) => (
									<option key={project.id} value={project.path}>
										{project.name}
									</option>
								))}
							</select>
						</label>

						<label className="grid gap-1.5">
							<span className={fieldLabelClass}>Directive</span>
							<textarea
								className={`${textareaClass} min-h-40 resize-y`}
								onChange={(event) => setPrompt(event.target.value)}
								onKeyDown={(event) => {
									if (isDirectiveSubmitShortcut(event)) {
										event.preventDefault();
										event.currentTarget.form?.requestSubmit();
									}
								}}
								placeholder="Review the current implementation and report the highest-risk gaps…"
								required
								value={prompt}
							/>
							<span className="text-xs text-muted-foreground">
								Press Ctrl+Enter or Cmd+Enter to launch.
							</span>
							<span className={cn('text-xs', toneText.amber)}>
								{DIRECTIVE_PROMPT_SAFETY_NOTICE}
							</span>
						</label>

						<div className="rounded-md border border-accent/30 bg-accent-muted/60 p-3">
							<label className="grid gap-1.5">
								<span className={fieldLabelClass}>Execution intent</span>
								<select
									className={`${selectClass} w-full`}
									onChange={(event) =>
										setExecutionIntent(
											event.target.value as SkillExecutionIntent,
										)
									}
									value={executionIntent}>
									<option value="review-only">Review only</option>
									<option value="apply-changes">Apply changes</option>
								</select>
								<span className="text-xs text-muted-foreground">
									{executionIntent === 'review-only'
										? 'The run may inspect the project but must not edit files, metadata, or git history.'
										: 'The run may edit, test, update metadata, and create commits when the directive requires it.'}
								</span>
							</label>
						</div>

						<div className="flex min-h-8 flex-wrap items-center gap-2">
							<span className={fieldLabelClass}>Resolved target</span>
							{effective ? (
								<LaunchTargetBadge
									backend={effective.backend}
									hint={
										defaults.data?.projectConfigApplied
											? 'Project configuration applied'
											: 'Global configuration'
									}
									provider={effective.provider}
									reasoningEffort={effective.reasoningEffort}
									{...(effective.model !== undefined
										? { model: effective.model }
										: {})}
								/>
							) : (
								<span className="text-xs text-muted-foreground">
									{defaults.isError
										? 'Launch target unavailable'
										: 'Resolving launch target…'}
								</span>
							)}
						</div>
					</div>

					<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button
							className="w-full sm:w-auto"
							onClick={close}
							type="button"
							variant="ghost">
							Cancel
						</Button>
						<Button
							className="w-full sm:w-auto"
							disabled={!canSubmit}
							type="submit"
							variant="primary">
							<Play className="h-4 w-4" />
							{launch.isPending ? 'Launching…' : 'Launch directive'}
						</Button>
					</div>
				</form>
			</DialogPanel>
		</Dialog>
	);
}
