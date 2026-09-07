/* eslint-disable react-hooks/set-state-in-effect */
import { default as Bug } from 'lucide-react/dist/esm/icons/bug';
import { default as MessageSquarePlus } from 'lucide-react/dist/esm/icons/message-square-plus';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectReportKind } from '../../api/types.ts';

import { useProjectNames, useSubmitProjectReport } from '../../hooks/useProjects.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { selectClass, textareaClass } from '../../lib/formStyles.ts';
import { compactFieldMeasureClass } from '../../lib/typography.ts';
import { Button } from '../ui/button.tsx';
import { Dialog, DialogBody, DialogFooter, DialogPanel } from '../ui/dialog.tsx';
import { FieldRow } from '../ui/field.tsx';
import { SegmentedControl } from '../ui/segmented-control.tsx';
import { chooseReportProjectId } from './project-report-target.ts';
import { ProjectReportDialogHeader } from './ProjectReportDialogHeader.tsx';

/**
 * The report form itself, split out of {@link ProjectReportButton} so it can be code-split.
 *
 * The trigger lives in the sidebar and is on screen from first paint; this form is not, and it
 * carries the project list query, the dialog primitives, and the field primitives with it. Kept in
 * the same chunk they were 8.6 KB of gzip every visitor downloaded to render a dialog most of them
 * never open. The button owns `open` and mounts this lazily on the first open; the draft state
 * below therefore survives a close, which is what `draftRestored` reports.
 */
export function ProjectReportDialog({
	defaultProjectId,
	onClose,
	open,
}: {
	defaultProjectId?: string | undefined;
	onClose: () => void;
	open: boolean;
}) {
	const projects = useProjectNames();
	const submitReport = useSubmitProjectReport();
	const [description, setDescription] = useState('');
	const descriptionRef = useRef<HTMLTextAreaElement>(null);
	const [descriptionTouched, setDescriptionTouched] = useState(false);
	const [draftRestored, setDraftRestored] = useState(false);
	const [kind, setKind] = useState<ProjectReportKind>('bug');
	const projectOptions = projects.data?.projects ?? [];
	const [projectTouched, setProjectTouched] = useState(false);
	const [selectedProjectId, setSelectedProjectId] = useState('');
	const canSubmit = description.trim().length > 0 && selectedProjectId !== '';
	const descriptionError =
		descriptionTouched && !description.trim()
			? 'Describe the issue or request before submitting'
			: null;
	const projectError =
		projectTouched && !selectedProjectId ? 'Select a project before submitting' : null;

	useEffect(() => {
		if (!open) return;
		const availableProjects = projects.data?.projects ?? [];
		setSelectedProjectId((current) => {
			if (availableProjects.some((project) => project.id === current)) return current;
			return defaultProjectId &&
				availableProjects.some((project) => project.id === defaultProjectId)
				? defaultProjectId
				: chooseReportProjectId(availableProjects);
		});
	}, [defaultProjectId, open, projects.data?.projects]);

	const reset = () => {
		setDescription('');
		setDescriptionTouched(false);
		setDraftRestored(false);
		setKind('bug');
		setProjectTouched(false);
	};

	const close = () => {
		setDraftRestored(description.trim().length > 0 || kind !== 'bug' || projectTouched);
		onClose();
	};
	const discard = () => {
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'reports.discard',
			source: 'ProjectReportDialog',
		});
		close();
	};

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setDescriptionTouched(true);
		setProjectTouched(true);
		const projectId = selectedProjectId;
		if (!projectId) {
			toast.error('Select a project before filing a report');
			return;
		}

		const trimmedDescription = description.trim();
		if (!trimmedDescription) {
			toast.error('Describe the issue or request before submitting');
			return;
		}

		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'reports.submit',
			source: 'ProjectReportDialog',
			summary: {
				descriptionLength: trimmedDescription.length,
				kind,
				projectId,
				route: window.location.pathname,
			},
			target: '/api/v1/projects/:id/reports',
		});
		submitReport.mutate(
			{
				projectId,
				report: {
					description: trimmedDescription,
					kind,
					metadata: {
						pathname: window.location.pathname,
						url: window.location.href,
						userAgent: window.navigator.userAgent,
						viewport: {
							height: window.innerHeight,
							width: window.innerWidth,
						},
					},
				},
			},
			{
				onError: (error) => {
					toast.error(
						error instanceof Error ? error.message : 'Report submission failed',
					);
				},
				onSuccess: (report) => {
					const createdLabel = report.kind === 'bug' ? 'Remediation feature' : 'Feature';
					toast.success(`${createdLabel} created`, {
						description: report.featureDirectory ?? report.featureId ?? report.id,
					});
					reset();
					onClose();
				},
			},
		);
	};

	return (
		<Dialog
			aria-describedby="project-report-description-text"
			aria-labelledby="project-report-title"
			initialFocusRef={descriptionRef}
			onClose={close}
			open={open}
			role="dialog">
			<DialogPanel className="flex w-full max-w-lg flex-col overflow-hidden">
				<form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
					<ProjectReportDialogHeader onClose={discard} />
					<DialogBody className="grid gap-4 px-5 py-4">
						<FieldRow className={compactFieldMeasureClass} group label="Report type">
							<SegmentedControl<ProjectReportKind>
								ariaLabel="Report type"
								onChange={setKind}
								options={[
									{
										label: (
											<>
												<Bug className="h-4 w-4" />
												Bug
											</>
										),
										value: 'bug',
									},
									{
										label: (
											<>
												<MessageSquarePlus className="h-4 w-4" />
												Feature
											</>
										),
										value: 'feature',
									},
								]}
								size="default"
								value={kind}
							/>
						</FieldRow>
						<FieldRow error={projectError} label="Project" required>
							<select
								className={`${selectClass} w-full`}
								disabled={projectOptions.length === 0}
								onChange={(event) => {
									setProjectTouched(true);
									traceDataMovement({
										category: 'event',
										layer: 'ui',
										operation: 'reports.project.select',
										source: 'ProjectReportDialog',
										summary: { projectId: event.target.value },
									});
									setSelectedProjectId(event.target.value);
								}}
								value={selectedProjectId}>
								<option disabled value="">
									Select project
								</option>
								{projectOptions.map((project) => (
									<option key={project.id} value={project.id}>
										{project.name}
									</option>
								))}
							</select>
						</FieldRow>
						<FieldRow
							error={descriptionError}
							hint={
								draftRestored ? 'Restored from your last unsent report.' : undefined
							}
							label="Description"
							required>
							<textarea
								className={`${textareaClass} min-h-36`}
								id="project-report-description"
								onBlur={() => setDescriptionTouched(true)}
								onChange={(event) => setDescription(event.target.value)}
								placeholder="What happened, or what should aidd add?"
								ref={descriptionRef}
								value={description}
							/>
						</FieldRow>
					</DialogBody>
					<DialogFooter className="border-t border-border p-5">
						<Button
							className="w-full sm:w-auto"
							onClick={discard}
							type="button"
							variant="secondary">
							Cancel
						</Button>
						<Button
							className="w-full sm:w-auto"
							disabled={submitReport.isPending || !canSubmit}
							type="submit"
							variant="primary">
							{submitReport.isPending ? 'Submitting…' : 'Submit report'}
						</Button>
					</DialogFooter>
				</form>
			</DialogPanel>
		</Dialog>
	);
}
