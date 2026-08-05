import { useState } from 'react';

import type { AuditManager } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { Checkbox } from '../../../components/ui/checkbox.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { auditLaunchTargetsId } from '../auditsUtils.ts';

interface LaunchTargetsCardProps {
	onToggleProject: (id: string) => void;
	projects: AuditManager['projects'];
	selectedProjectIds: string[];
}

/**
 * The projects a run or review is launched against. Every run action on this tab is gated on this
 * list, so it sits directly under the toolbar that states the gate rather than in a far-right column:
 * as a 208px scroll box it showed 5 of 33 projects, cut mid-row, with no count and no filter.
 */
export function LaunchTargetsCard({
	onToggleProject,
	projects,
	selectedProjectIds,
}: LaunchTargetsCardProps) {
	const [filter, setFilter] = useState('');
	const lower = filter.trim().toLowerCase();
	const visible = lower
		? projects.filter((project) =>
				`${project.name} ${project.path}`.toLowerCase().includes(lower),
			)
		: projects;

	return (
		<section className="scroll-mt-4" id={auditLaunchTargetsId}>
			<Card className="space-y-3">
				<CardHeader
					action={
						<Input
							aria-label="Filter launch targets"
							className="w-full sm:w-56"
							onChange={(event) => setFilter(event.target.value)}
							placeholder="Filter projects"
							value={filter}
						/>
					}
					badge={
						<Badge tone="neutral">
							{selectedProjectIds.length} of {projects.length} selected
						</Badge>
					}
					className="mb-0"
					description="Run Selected, Run All, and Review launch against every project checked here."
					title="Launch Targets"
				/>
				{visible.length === 0 ? (
					<p className="text-sm text-muted-foreground">No projects match that filter.</p>
				) : (
					<div className="grid max-h-72 gap-2 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
						{visible.map((project) => (
							<label
								className="flex min-w-0 items-start gap-2 rounded-md p-1 text-sm hover:bg-muted/60"
								key={project.id}>
								<Checkbox
									checked={selectedProjectIds.includes(project.id)}
									className="mt-0.5"
									onChange={() => onToggleProject(project.id)}
								/>
								<span className="min-w-0">
									<span className="block truncate font-medium text-foreground">
										{project.name}
									</span>
									<span
										className="block truncate text-xs text-muted-foreground"
										title={project.path}>
										{project.path}
									</span>
								</span>
							</label>
						))}
					</div>
				)}
			</Card>
		</section>
	);
}
