/* eslint-disable react-hooks/set-state-in-effect */
import { default as Bug } from 'lucide-react/dist/esm/icons/bug';
import { default as MessageSquarePlus } from 'lucide-react/dist/esm/icons/message-square-plus';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectReportKind } from '../../api/types.ts';

import { useProjectNames, useSubmitProjectReport } from '../../hooks/useProjects.ts';
import { cn } from '../../lib/cn.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { selectClass, textareaClass } from '../../lib/formStyles.ts';
import { Button, IconButton } from '../ui/button.tsx';
import { Dialog, DialogPanel } from '../ui/dialog.tsx';
import { SegmentedControl } from '../ui/segmented-control.tsx';
import { chooseReportProjectId } from './project-report-target.ts';

export function ProjectReportButton({ collapsed }: { collapsed: boolean }) {
	const projects = useProjectNames();
	const submitReport = useSubmitProjectReport();
	const [open, setOpen] = useState(false);
	const [description, setDescription] = useState('');
	const [kind, setKind] = useState<ProjectReportKind>('bug');
	const projectOptions = useMemo(() => projects.data?.projects ?? [], [projects.data?.projects]);
	const [selectedProjectId, setSelectedProjectId] = useState('');
	const canSubmit = description.trim().length > 0 && selectedProjectId !== '';

	useEffect(() => {
		if (!open) return;
		setSelectedProjectId(chooseReportProjectId(projectOptions));
	}, [open, projectOptions]);

	const reset = () => {
		setDescription('');
		setKind('bug');
	};

	const close = () => {
		setOpen(false);
		reset();
	};

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
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
			source: 'ProjectReportButton',
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
					close();
				},
			},
		);
	};

	return (
		<>
			<Button
				aria-label="Report a bug or request a feature"
				// See `DirectiveLaunchButton`: 40x44 before this, the rail's other half of the same
				// pair.
				className={cn(
					'px-0',
					collapsed ? 'w-11 sm:w-10' : 'w-11 sm:w-full sm:justify-start sm:px-3',
				)}
				onClick={() => setOpen(true)}
				onClickCapture={() =>
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'reports.open',
						source: 'ProjectReportButton',
					})
				}
				type="button"
				variant="ghost">
				<Bug className="h-4 w-4" />
				{!collapsed && <span className="hidden text-sm font-medium sm:inline">Report</span>}
			</Button>
			<Dialog
				aria-describedby="project-report-description-text"
				aria-labelledby="project-report-title"
				initialFocus="first"
				onClose={close}
				open={open}
				role="dialog">
				<DialogPanel className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto p-5">
					<form onSubmit={submit}>
						<div className="flex items-start justify-between gap-3">
							<div>
								<h2
									className="text-base font-semibold text-foreground"
									id="project-report-title">
									File a report
								</h2>
								<p
									className="mt-1 text-sm text-neutral-600 dark:text-neutral-400"
									id="project-report-description-text">
									Reports create backlog feature files in the selected project.
								</p>
							</div>
							<IconButton
								ariaLabel="Close report form"
								onClick={() => {
									traceDataMovement({
										category: 'event',
										layer: 'ui',
										operation: 'reports.discard',
										source: 'ProjectReportButton',
									});
									close();
								}}
								variant="ghost">
								<X className="h-4 w-4" />
							</IconButton>
						</div>
						<div className="mt-4 grid gap-4">
							<SegmentedControl<ProjectReportKind>
								ariaLabel="Report type"
								className="w-full"
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
							<label className="grid gap-1.5 text-sm font-medium text-neutral-800 dark:text-neutral-200">
								Project
								<select
									className={`${selectClass} h-10`}
									disabled={projectOptions.length === 0}
									onChange={(event) => {
										traceDataMovement({
											category: 'event',
											layer: 'ui',
											operation: 'reports.project.select',
											source: 'ProjectReportButton',
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
							</label>
							<label className="grid gap-1.5 text-sm font-medium text-neutral-800 dark:text-neutral-200">
								Description
								<textarea
									className={`${textareaClass} min-h-36`}
									id="project-report-description"
									onChange={(event) => setDescription(event.target.value)}
									placeholder="What happened, or what should aidd add?"
									required
									value={description}
								/>
							</label>
						</div>
						<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
							<Button
								className="w-full sm:w-auto"
								onClick={() => {
									traceDataMovement({
										category: 'event',
										layer: 'ui',
										operation: 'reports.discard',
										source: 'ProjectReportButton',
									});
									close();
								}}
								type="button"
								variant="ghost">
								Cancel
							</Button>
							<Button
								className="w-full sm:w-auto"
								disabled={submitReport.isPending || !canSubmit}
								type="submit"
								variant="primary">
								{submitReport.isPending ? 'Submitting…' : 'Submit report'}
							</Button>
						</div>
					</form>
				</DialogPanel>
			</Dialog>
		</>
	);
}
