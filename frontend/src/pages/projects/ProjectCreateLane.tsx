/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import type { ProjectCreateMode, ProjectRecommendResult } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';
import type { ProjectTemplateSummary } from '../../api/types/settings.ts';

import { Input } from '../../components/ui/input.tsx';
import { useCreateProject, useRecommendProjectMode } from '../../hooks/useProjects.ts';
import { useSettingsConfig } from '../../hooks/useSettings.ts';
import { fieldLabelClass, selectClass } from '../../lib/formStyles.ts';
import { BlueprintOnlyToggle } from './BlueprintOnlyToggle.tsx';
import { ProjectAdvisorRecommendation } from './ProjectAdvisorRecommendation.tsx';
import { ProjectCreateActions } from './ProjectCreateActions.tsx';
import { GithubRepoField, ProjectTemplatePicker } from './ProjectCreateSourceFields.tsx';
import { buildSpec, NAME_PATTERN, type SpecKind } from './projectNewPanelUtils.ts';
import { ProjectSpecField } from './ProjectSpecField.tsx';
import { useGithubTemplateSource } from './useGithubTemplateSource.ts';

export function ProjectCreateLane({
	lane,
	onClose,
	onSwitchToIngest,
	templates,
}: {
	lane: 'fresh' | 'github' | 'template';
	onClose: () => void;
	onSwitchToIngest: () => void;
	templates: ProjectTemplateSummary[];
}) {
	const settings = useSettingsConfig();
	const navigate = useNavigate();
	const createProject = useCreateProject();
	const recommend = useRecommendProjectMode();

	const roots = useMemo(
		() => settings.data?.applicationRoots ?? [],
		[settings.data?.applicationRoots],
	);
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [root, setRoot] = useState('');
	const [templateName, setTemplateName] = useState(templates[0]?.name ?? '');
	const [specKind, setSpecKind] = useState<SpecKind>('none');
	const [specText, setSpecText] = useState('');
	const [specPath, setSpecPath] = useState('');
	const [recommendation, setRecommendation] = useState<null | ProjectRecommendResult>(null);
	const [launchTarget, setLaunchTarget] = useState<LaunchTargetValue>({});
	const [stopBeforeImplementation, setStopBeforeImplementation] = useState(true);
	const github = useGithubTemplateSource(name, setName);

	useEffect(() => {
		if (root === '' && roots.length > 0) setRoot(roots[0] ?? '');
	}, [root, roots]);
	useEffect(() => {
		if (lane === 'template' && templateName === '' && templates.length > 0) {
			setTemplateName(templates[0]?.name ?? '');
		}
	}, [lane, templateName, templates]);

	const selectedTemplate =
		lane === 'template'
			? (templates.find((template) => template.name === templateName) ?? templates[0] ?? null)
			: null;
	const nameError =
		name.length > 0 && !NAME_PATTERN.test(name)
			? 'Use letters, digits, dot, underscore, or hyphen only.'
			: null;

	const specReady =
		specKind === 'none' ||
		(specKind === 'text' && specText.trim().length > 0) ||
		(specKind === 'path' && specPath.trim().length > 0);

	const trimmedDescription = description.trim();
	const requiresDescription = selectedTemplate?.requiresDescription ?? false;
	const descriptionMissing = requiresDescription && trimmedDescription.length === 0;
	const advisorNeedsSpec = specKind === 'none';

	const baseInvalid =
		name.length === 0 ||
		nameError !== null ||
		root === '' ||
		!specReady ||
		createProject.isPending;
	const noTemplate = lane === 'template' && selectedTemplate === null;
	const githubBlocked = lane === 'github' && github.incomplete;
	const createDisabled = baseInvalid || descriptionMissing || noTemplate || githubBlocked;
	const advisorDisabled = baseInvalid || advisorNeedsSpec || recommend.isPending;

	async function performCreate(request: {
		mode: ProjectCreateMode;
		template?: string;
		templateUrl?: string;
	}): Promise<void> {
		const spec = buildSpec(specKind, specText, specPath);
		try {
			const result = await createProject.mutateAsync({
				mode: request.mode,
				name,
				root,
				stopBeforeImplementation,
				...(request.template ? { template: request.template } : {}),
				...(request.templateUrl ? { templateUrl: request.templateUrl } : {}),
				...(trimmedDescription ? { description: trimmedDescription } : {}),
				...(spec ? { spec } : {}),
				...(launchTarget.backend ? { backend: launchTarget.backend } : {}),
				...(launchTarget.model ? { model: launchTarget.model } : {}),
				...(launchTarget.reasoningEffort
					? { reasoningEffort: launchTarget.reasoningEffort }
					: {}),
			});
			const outcome = result.runId
				? `, run ${result.runId}`
				: result.intakeSessionId
					? `, intake ${result.intakeSessionId}`
					: '';
			toast.success(
				result.stopBeforeImplementation
					? 'Blueprint creation started'
					: 'Project build started',
				{ description: `${result.path}${outcome}` },
			);
			onClose();
			void navigate(`/projects/${encodeURIComponent(result.projectId)}?tab=overview`);
		} catch (error) {
			toast.error('Could not create project', {
				description: error instanceof Error ? error.message : 'Unknown error.',
			});
		}
	}

	async function askAdvisor(): Promise<void> {
		const spec = buildSpec(specKind, specText, specPath);
		if (!spec) return;
		try {
			const result = await recommend.mutateAsync({ name, root, spec });
			setRecommendation(result);
		} catch (error) {
			toast.error('Could not generate recommendation', {
				description: error instanceof Error ? error.message : 'Unknown error.',
			});
		}
	}

	function submit(): void {
		if (lane === 'github') {
			void performCreate({ mode: 'fresh', templateUrl: github.trimmedUrl });
		} else if (lane === 'template' && selectedTemplate) {
			void performCreate({ mode: 'fresh', template: selectedTemplate.name });
		} else {
			void performCreate({ mode: 'fresh' });
		}
	}

	return (
		<div className="space-y-4">
			{lane === 'github' ? <GithubRepoField source={github} /> : null}

			{lane === 'template' ? (
				<ProjectTemplatePicker
					onChange={setTemplateName}
					selectedTemplate={selectedTemplate}
					templateName={templateName}
					templates={templates}
				/>
			) : null}

			<div className="grid gap-3 sm:grid-cols-2">
				<label className="space-y-1">
					<span className={fieldLabelClass}>Name</span>
					<Input
						onChange={(event) => github.editName(event.target.value)}
						placeholder="my-new-app"
						value={name}
					/>
					{nameError ? (
						<p className="text-xs text-red-600 dark:text-red-400">{nameError}</p>
					) : null}
				</label>
				<label className="space-y-1">
					<span className={fieldLabelClass}>Root</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) => setRoot(event.target.value)}
						value={root}>
						{roots.length === 0 ? (
							<option value="">No application roots configured</option>
						) : null}
						{roots.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
				</label>
			</div>

			<label className="space-y-1">
				<span className={fieldLabelClass}>
					Description
					{requiresDescription ? <span className="text-red-500"> *</span> : null}
				</span>
				<Input
					maxLength={500}
					onChange={(event) => setDescription(event.target.value)}
					placeholder="What this application is for"
					value={description}
				/>
				{descriptionMissing ? (
					<p className="text-xs text-red-600 dark:text-red-400">
						The {selectedTemplate?.name ?? 'selected'} template requires a description.
					</p>
				) : null}
			</label>

			<ProjectSpecField
				setSpecKind={setSpecKind}
				setSpecPath={setSpecPath}
				setSpecText={setSpecText}
				specKind={specKind}
				specPath={specPath}
				specText={specText}
			/>

			<BlueprintOnlyToggle
				checked={stopBeforeImplementation}
				onChange={setStopBeforeImplementation}
			/>

			{lane === 'fresh' && recommendation ? (
				<ProjectAdvisorRecommendation
					createPending={createProject.isPending}
					onCancel={() => setRecommendation(null)}
					onCreate={(selectedMode) => void performCreate({ mode: selectedMode })}
					onIngest={onSwitchToIngest}
					recommendation={recommendation}
					trimmedDescription={trimmedDescription}
				/>
			) : null}

			<ProjectCreateActions
				advisorDisabled={advisorDisabled}
				advisorNeedsSpec={advisorNeedsSpec}
				advisorPending={recommend.isPending}
				createDisabled={createDisabled}
				createLabel={
					createProject.isPending
						? 'Creating…'
						: lane === 'github'
							? 'Create from GitHub'
							: lane === 'template'
								? `Create ${selectedTemplate?.name ?? 'from template'}`
								: 'Create Fresh'
				}
				createPending={createProject.isPending}
				launchTarget={launchTarget}
				onAskAdvisor={() => void askAdvisor()}
				onClose={onClose}
				onLaunchTargetChange={setLaunchTarget}
				onSubmit={submit}
				showAdvisor={lane === 'fresh'}
			/>
		</div>
	);
}
