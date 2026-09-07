import type { SkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { useProjectNames } from '../../hooks/useProjects.ts';
import { useLaunchDirectiveRun } from '../../hooks/useRuns.ts';
import { cn } from '../../lib/cn.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { selectClass, textareaClass } from '../../lib/formStyles.ts';
import {
	toneBorder,
	toneSurface,
	toneSurfaceHover,
	toneText,
	toneTextHoverStrong,
} from '../../lib/tones.ts';
import { AlertDialog } from '../ui/alert-dialog.tsx';
import { Button } from '../ui/button.tsx';
import { Dialog, DialogBody, DialogFooter, DialogPanel } from '../ui/dialog.tsx';
import { FieldRow } from '../ui/field.tsx';
import {
	canLaunchDirective,
	DIRECTIVE_PROMPT_SAFETY_NOTICE,
	isDirectiveSubmitShortcut,
} from './directive-launch-policy.ts';
import {
	advanceDirectiveProjectSeed,
	createDirectiveProjectSeedState,
	visibleDirectiveProjects,
} from './directive-launch-target.ts';
import { DirectiveIntentField } from './DirectiveIntentField.tsx';
import { DirectiveLaunchHeader } from './DirectiveLaunchHeader.tsx';
import { DirectiveProjectHint } from './DirectiveProjectHint.tsx';
import { DirectiveTargetField } from './DirectiveTargetField.tsx';

interface DirectiveLaunchModalProps {
	onClose: () => void;
	open: boolean;
}

export function DirectiveLaunchModal({ onClose, open }: DirectiveLaunchModalProps) {
	const location = useLocation();
	const navigate = useNavigate();
	const projectsQuery = useProjectNames();
	const launch = useLaunchDirectiveRun();
	const projects = visibleDirectiveProjects(projectsQuery.data?.projects ?? []);
	const [executionIntent, setExecutionIntent] = useState<SkillExecutionIntent>('review-only');
	const [discardOpen, setDiscardOpen] = useState(false);
	const [launchTarget, setLaunchTarget] = useState<LaunchTargetValue>({});
	const [projectDir, setProjectDir] = useState('');
	const [projectTouched, setProjectTouched] = useState(false);
	const [prompt, setPrompt] = useState('');
	const promptRef = useRef<HTMLTextAreaElement>(null);
	const [promptTouched, setPromptTouched] = useState(false);
	const projectSeedRef = useRef(createDirectiveProjectSeedState());
	const selectedProject = projects.find((project) => project.path === projectDir);
	const canSubmit = canLaunchDirective({ isPending: launch.isPending, projectDir, prompt });
	const projectError =
		projectTouched && !projectDir ? 'Select a project before launching.' : null;
	const promptError =
		promptTouched && !prompt.trim() ? 'Enter a directive before launching.' : null;
	const applyChanges = executionIntent === 'apply-changes';

	useEffect(() => {
		const result = advanceDirectiveProjectSeed(projectSeedRef.current, {
			open,
			pathname: location.pathname,
			projects: projectsQuery.data?.projects,
		});
		projectSeedRef.current = result.state;
		if (result.projectDir !== null) setProjectDir(result.projectDir);
	}, [location.pathname, open, projectsQuery.data?.projects]);

	function reset(): void {
		setExecutionIntent('review-only');
		setLaunchTarget({});
		setProjectDir('');
		setProjectTouched(false);
		setPrompt('');
		setPromptTouched(false);
	}

	function closeAndReset(): void {
		setDiscardOpen(false);
		onClose();
		reset();
	}

	function requestClose(): void {
		if (prompt.trim()) {
			setDiscardOpen(true);
			return;
		}
		closeAndReset();
	}

	function submit(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		setProjectTouched(true);
		setPromptTouched(true);
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
			{ executionIntent, ...launchTarget, projectDir, prompt: directive },
			{
				onError(error) {
					toast.error(error instanceof Error ? error.message : 'Directive launch failed');
				},
				onSuccess(run) {
					closeAndReset();
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
		<>
			<Dialog
				aria-describedby="directive-launch-description"
				aria-labelledby="directive-launch-title"
				initialFocusRef={promptRef}
				onClose={requestClose}
				open={open}>
				<DialogPanel className="flex w-full max-w-xl flex-col overflow-hidden">
					<form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
						<DirectiveLaunchHeader onClose={requestClose} />

						<DialogBody className="grid gap-4 px-5 py-5">
							<FieldRow
								error={projectError}
								hint={
									projectDir ? (
										<DirectiveProjectHint
											projectDir={projectDir}
											projectId={selectedProject?.id}
										/>
									) : (
										'Select a project to show its path and branch.'
									)
								}
								label="Project"
								required>
								<select
									className={`${selectClass} w-full`}
									disabled={projectsQuery.isLoading || projects.length === 0}
									onChange={(event) => {
										setProjectTouched(true);
										setProjectDir(event.target.value);
									}}
									value={projectDir}>
									<option value="">Select project</option>
									{projects.map((project) => (
										<option key={project.id} value={project.path}>
											{project.name}
										</option>
									))}
								</select>
							</FieldRow>

							<FieldRow
								error={promptError}
								hint={
									<>
										<span>Press Ctrl+Enter or Cmd+Enter to launch.</span>
										<span className={toneText.amber}>
											{DIRECTIVE_PROMPT_SAFETY_NOTICE}
										</span>
									</>
								}
								label="Directive"
								required>
								<textarea
									className={`${textareaClass} min-h-40 resize-y`}
									onBlur={() => setPromptTouched(true)}
									onChange={(event) => setPrompt(event.target.value)}
									onKeyDown={(event) => {
										if (isDirectiveSubmitShortcut(event)) {
											event.preventDefault();
											event.currentTarget.form?.requestSubmit();
										}
									}}
									placeholder="Review the current implementation and report the highest-risk gaps…"
									ref={promptRef}
									value={prompt}
								/>
							</FieldRow>

							<DirectiveIntentField
								onChange={setExecutionIntent}
								value={executionIntent}
							/>

							<DirectiveTargetField
								onChange={setLaunchTarget}
								projectDir={projectDir}
								value={launchTarget}
							/>
						</DialogBody>

						<DialogFooter className="border-t border-border p-5">
							<Button
								className="w-full sm:w-auto"
								onClick={requestClose}
								type="button"
								variant="secondary">
								Cancel
							</Button>
							<Button
								className={cn(
									'w-full sm:w-auto',
									applyChanges && toneBorder.amber,
									applyChanges && toneSurface.amber,
									applyChanges && toneText.amber,
									applyChanges && toneSurfaceHover.amber,
									applyChanges && toneTextHoverStrong.amber,
								)}
								disabled={!canSubmit}
								type="submit"
								variant={applyChanges ? 'secondary' : 'primary'}>
								<Play className="h-4 w-4" />
								{launch.isPending
									? 'Launching…'
									: applyChanges
										? 'Launch and apply changes'
										: 'Launch directive'}
							</Button>
						</DialogFooter>
					</form>
				</DialogPanel>
			</Dialog>
			<AlertDialog
				cancelLabel="Keep editing"
				confirmLabel="Discard directive"
				description="The directive text has not been launched and will be lost."
				destructive
				onClose={() => setDiscardOpen(false)}
				onConfirm={closeAndReset}
				open={discardOpen}
				title="Discard unsaved directive?"
			/>
		</>
	);
}
