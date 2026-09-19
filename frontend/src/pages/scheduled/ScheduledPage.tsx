import type { ScheduledTaskState } from 'aidd-shared/contracts/scheduled-tasks';

import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { Button } from '../../components/ui/button.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useScheduledTasks } from '../../hooks/useScheduledTasks.ts';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard.ts';
import { cn } from '../../lib/cn.ts';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import { proseMeasureCardClass } from '../../lib/typography.ts';
import { useScheduledDraft } from './scheduledDraftContext.ts';
import { ScheduledDraftProvider } from './ScheduledDraftProvider.tsx';
import { ScheduledTaskCard } from './ScheduledTaskCard.tsx';
import { countScheduledTasks } from './scheduledTaskCounts.ts';
import { ScheduledTaskForm } from './ScheduledTaskForm.tsx';

const PAGE_RAIL = pageRailByContentType.catalog;

const filters = [
	{ label: 'Active', value: 'active' },
	{ label: 'Paused', value: 'paused' },
	{ label: 'Completed', value: 'completed' },
	{ label: 'Archived', value: 'archived' },
] as const;

function ScheduledTasks() {
	useDocumentTitle('Scheduled');
	const scheduled = useScheduledTasks();
	// The form's draft and its dirty state belong to the route, so this shell reads the same value
	// the form edits rather than being told about it after the fact.
	const form = useScheduledDraft();
	const [filter, setFilter] = useState<ScheduledTaskState>('active');
	const [discardOpen, setDiscardOpen] = useState(false);
	const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
	const [resultsRevealed, setResultsRevealed] = useState(false);
	const allTasks = scheduled.tasks.data ?? [];
	const taskCounts = countScheduledTasks(allTasks);
	const tasks = allTasks.filter((task) => task.state === filter);
	const blocker = useUnsavedGuard(form.open && form.dirty);

	function discardForm(): void {
		form.close();
		setDiscardOpen(false);
	}

	function requestClose(): void {
		if (form.dirty) setDiscardOpen(true);
		else discardForm();
	}

	function editTask(id: string): void {
		const task = allTasks.find((item) => item.id === id);
		if (task) form.openEdit(task);
	}

	function action(id: string, value: 'archive' | 'pause' | 'resume' | 'run'): void {
		scheduled.action.mutate(
			{ action: value, id },
			{
				onError: (error) =>
					toast.error(error instanceof Error ? error.message : 'Action failed'),
				onSuccess: () =>
					toast.success(value === 'run' ? 'Occurrence started' : 'Task updated'),
			},
		);
	}

	function toggleOccurrences(id: string): void {
		setExpandedIds((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	return (
		<PageRail className="page-reveal space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				actions={
					<Button
						onClick={() => {
							if (form.open) {
								requestClose();
								return;
							}
							form.openNew();
						}}
						variant={form.open ? 'secondary' : 'primary'}>
						{form.open ? (
							<X aria-hidden="true" className="h-4 w-4" />
						) : (
							<Plus aria-hidden="true" className="h-4 w-4" />
						)}
						{form.open ? 'Close form' : 'New task'}
					</Button>
				}
				description="Durable recipe, skill, audit, and directive tasks with reviewable occurrence history."
				helpSlug="scheduled-tasks"
				title="Scheduled"
			/>
			{form.open && (
				<div className="scheduled-content-reveal" data-scheduled-form-motion="">
					<div className="scheduled-content-reveal-inner">
						{/* The draft resets in the provider; this key restarts the form's own
						    schedule-preview requests when the operator switches tasks. */}
						<ScheduledTaskForm
							key={form.editingId ?? 'new'}
							onCancel={requestClose}
							onSaved={() => {
								discardForm();
							}}
						/>
					</div>
				</div>
			)}
			<SegmentedControl
				ariaLabel="Filter scheduled tasks"
				onChange={setFilter}
				options={filters.map((option) => {
					const count = taskCounts[option.value];
					return {
						ariaLabel: option.label,
						count,
						countAriaHidden: true,
						label: option.label,
						value: option.value,
					};
				})}
				value={filter}
			/>
			<p aria-live="polite" className="sr-only" role="status">
				{tasks.length === 0
					? `No ${filter} scheduled tasks to show`
					: `${tasks.length} ${filter} scheduled ${tasks.length === 1 ? 'task' : 'tasks'}`}
			</p>
			<div
				className={cn(
					resultsRevealed && '!animate-none',
					tasks.length > 0 &&
						'grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4',
				)}
				data-scheduled-results=""
				onAnimationEnd={(event) => {
					if (
						event.currentTarget === event.target &&
						event.animationName === 'page-reveal-in'
					) {
						setResultsRevealed(true);
					}
				}}>
				{scheduled.tasks.isLoading ? (
					<SkeletonLines label="Loading scheduled tasks…" />
				) : tasks.length === 0 ? (
					// Reachable only once the query has resolved. It used to render over an undefined
					// result, asserting there were no tasks of this state before any had been fetched.
					<EmptyState className={proseMeasureCardClass}>
						Scheduled tasks appear here when they are {filter}.
					</EmptyState>
				) : (
					tasks.map((task) => (
						<ScheduledTaskCard
							action={action}
							expanded={expandedIds.has(task.id)}
							key={task.id}
							onEdit={editTask}
							onToggleOccurrences={toggleOccurrences}
							task={task}
						/>
					))
				)}
			</div>
			<ConfirmDialog
				confirmLabel="Discard changes"
				description={
					discardOpen
						? 'You have unsaved scheduled task changes. Closing the form will discard them.'
						: 'You have unsaved scheduled task changes. Leaving this page will discard them.'
				}
				destructive
				onClose={() => {
					setDiscardOpen(false);
					blocker.reset?.();
				}}
				onConfirm={() => {
					if (discardOpen) discardForm();
					else blocker.proceed?.();
				}}
				open={discardOpen || blocker.state === 'blocked'}
				title="Discard unsaved changes?"
			/>
		</PageRail>
	);
}

export function ScheduledPage() {
	return (
		<ScheduledDraftProvider>
			<ScheduledTasks />
		</ScheduledDraftProvider>
	);
}
