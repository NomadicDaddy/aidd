import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as Wand2 } from 'lucide-react/dist/esm/icons/wand-2';
import { useState } from 'react';
import { toast } from 'sonner';

import type { ProjectMilestone, ProjectMilestonePlan } from '../../../api/types.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import {
	useCreateProjectMilestone,
	useDeleteProjectMilestone,
	useProjectMilestones,
	useReassignProjectMilestones,
	useUpdateProjectMilestone,
} from '../../../hooks/useProjectMilestones.ts';
import { MilestoneFormDialog, type MilestoneFormValues } from './MilestoneFormDialog.tsx';
import { MilestonePlanDialog } from './MilestonePlanDialog.tsx';
import { MilestonesGateCallout } from './MilestonesGateCallout.tsx';
import { MilestonesTable } from './MilestonesTable.tsx';
import {
	milestonePlanNeedsReview,
	type MilestoneRequest,
	milestoneRequestVerb,
} from './milestonesUtils.ts';

export function MilestonesTab({ projectId }: { projectId: string }) {
	const milestones = useProjectMilestones(projectId);
	const createMilestone = useCreateProjectMilestone(projectId);
	const updateMilestone = useUpdateProjectMilestone(projectId);
	const deleteMilestone = useDeleteProjectMilestone(projectId);
	const reassign = useReassignProjectMilestones(projectId);
	const [form, setForm] = useState<{ milestone: null | ProjectMilestone } | null>(null);
	const [pending, setPending] = useState<{
		plan: ProjectMilestonePlan;
		request: MilestoneRequest;
	} | null>(null);

	const busy =
		createMilestone.isPending ||
		updateMilestone.isPending ||
		deleteMilestone.isPending ||
		reassign.isPending;

	function run(request: MilestoneRequest, dryRun: boolean): Promise<ProjectMilestonePlan> {
		switch (request.kind) {
			case 'create':
				return createMilestone.mutateAsync({ ...request.input, dryRun });
			case 'delete':
				return deleteMilestone.mutateAsync({
					input: { ...request.input, dryRun },
					name: request.name,
				});
			case 'reassign':
				return reassign.mutateAsync({ dryRun });
			case 'update':
				return updateMilestone.mutateAsync({
					input: { ...request.input, dryRun },
					name: request.name,
				});
		}
	}

	// Everything is previewed first. Trivial plans apply straight through so a reorder click stays a
	// click; anything that moves features, warns, or leaves a violation stops for confirmation.
	async function start(request: MilestoneRequest): Promise<void> {
		try {
			const plan = await run(request, true);
			if (milestonePlanNeedsReview(plan, request)) {
				setPending({ plan, request });
				return;
			}
			await run(request, false);
			setForm(null);
			toast.success(`Milestone ${milestoneRequestVerb(request)}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Milestone change failed');
		}
	}

	async function confirm(): Promise<void> {
		if (!pending) return;
		try {
			await run(pending.request, false);
			toast.success(`Milestone ${milestoneRequestVerb(pending.request)}`);
			setPending(null);
			setForm(null);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Milestone change failed');
		}
	}

	function submitForm(values: MilestoneFormValues): void {
		const editing = form?.milestone ?? null;
		if (editing) {
			const input: { description?: string; name?: string; position?: number } = {
				description: values.description,
			};
			if (values.name !== editing.name) input.name = values.name;
			input.position = values.position;
			void start({ input, kind: 'update', name: editing.name });
			return;
		}
		void start({
			input: {
				description: values.description,
				name: values.name,
				position: values.position,
			},
			kind: 'create',
		});
	}

	if (milestones.isLoading) return <LoadingState message="Loading milestones…" />;
	if (milestones.isError || !milestones.data) {
		return (
			<ErrorState
				error={milestones.error}
				onRetry={() => void milestones.refetch()}
				title="Could not load milestones"
			/>
		);
	}

	const view = milestones.data;
	const names = view.milestones.map((milestone) => milestone.name);
	return (
		<div className="space-y-3">
			<Card className="space-y-3">
				<div className="flex flex-wrap items-start justify-between gap-2">
					<div>
						<h2 className="text-sm font-semibold text-foreground">Milestones</h2>
						<p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
							Coding runs walk these in order and admit only the first incomplete one.
							Every change is previewed against the dependency graph before it is
							written to <span className="font-mono text-xs">roadmap.json</span>.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							disabled={busy}
							onClick={() => void start({ kind: 'reassign' })}
							title="Repair placement: push features after their dependencies, pull completed features back to the milestone matching their shipped version, and backfill missing shippedVersion from the app's current version">
							<Wand2 className="h-4 w-4" />
							Auto-place features
						</Button>
						<Button
							disabled={busy}
							onClick={() => setForm({ milestone: null })}
							variant="primary">
							<Plus className="h-4 w-4" />
							New milestone
						</Button>
					</div>
				</div>
				{view.lifecycle === 'locked' ? (
					<p className="text-xs text-amber-700 dark:text-amber-300">
						This roadmap is marked <span className="font-mono">locked</span>. Milestone
						edits still apply, but the project is not expected to take new work.
					</p>
				) : null}
			</Card>
			<MilestonesGateCallout view={view} />
			<Card className="p-0">
				{view.milestones.length === 0 ? (
					<EmptyState className="m-4">
						This roadmap has no milestones. Add one to give the coding gate an ordering
						to walk.
					</EmptyState>
				) : (
					<MilestonesTable
						activeMilestone={view.activeMilestone}
						busy={busy}
						milestones={view.milestones}
						onDelete={(milestone) =>
							void start({ input: {}, kind: 'delete', name: milestone.name })
						}
						onEdit={(milestone) => setForm({ milestone })}
						onMove={(milestone, position) =>
							void start({
								input: { position },
								kind: 'update',
								name: milestone.name,
							})
						}
					/>
				)}
			</Card>
			{form ? (
				<MilestoneFormDialog
					busy={busy}
					count={view.milestones.length}
					existingNames={names}
					key={form.milestone?.name ?? '__new__'}
					milestone={form.milestone}
					onClose={() => setForm(null)}
					onSubmit={submitForm}
					open
				/>
			) : null}
			<MilestonePlanDialog
				busy={busy}
				onClose={() => setPending(null)}
				onConfirm={() => void confirm()}
				plan={pending?.plan ?? null}
				request={pending?.request ?? null}
			/>
		</div>
	);
}
