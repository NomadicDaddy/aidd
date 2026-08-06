import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { useState } from 'react';

import type { AuditManager } from '../../../api/types.ts';

import { FilePath } from '../../../components/shared/FilePath.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { Checkbox } from '../../../components/ui/checkbox.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { auditLaunchTargetsId } from '../auditsUtils.ts';

interface LaunchTargetsCardProps {
	onOpenChange: (open: boolean) => void;
	onToggleProject: (id: string) => void;
	open: boolean;
	projects: AuditManager['projects'];
	selectedProjectIds: string[];
}

const PANEL_ID = 'audit-launch-targets-panel';

/**
 * The projects a run or review is launched against. Every run action on this tab is gated on this
 * list, so it sits directly under the toolbar that states the gate.
 *
 * Expanded it is a 33-project grid running y=440 to y=810, which put the first header of the table
 * this tab exists to show at y=830 and left five audit rows on a 1200px screen. It is a disclosure
 * now, collapsed by default: the header still states the gate and the count, and the toolbar's
 * "Choose launch targets" button — which already read as a disclosure trigger — opens it.
 */
export function LaunchTargetsCard({
	onOpenChange,
	onToggleProject,
	open,
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
			<Card className={open ? 'space-y-3' : ''}>
				<CardHeader
					action={
						<div className="flex flex-wrap items-center justify-end gap-2">
							{open && (
								<Input
									aria-label="Filter launch targets"
									className="w-full sm:w-56"
									onChange={(event) => setFilter(event.target.value)}
									placeholder="Filter projects"
									value={filter}
								/>
							)}
							<Button
								aria-controls={PANEL_ID}
								aria-expanded={open}
								onClick={() => onOpenChange(!open)}
								size="compact"
								variant="secondary">
								{open ? (
									<ChevronDown className="h-3.5 w-3.5" />
								) : (
									<ChevronRight className="h-3.5 w-3.5" />
								)}
								{open ? 'Hide targets' : 'Choose targets'}
							</Button>
						</div>
					}
					badge={
						<Badge tone={selectedProjectIds.length > 0 ? 'emerald' : 'neutral'}>
							{selectedProjectIds.length} of {projects.length} selected
						</Badge>
					}
					className="mb-0"
					description="Run Selected, Run All, and Review launch against every project checked here."
					title="Launch Targets"
				/>
				{open &&
					(visible.length === 0 ? (
						<p className="text-sm text-muted-foreground" id={PANEL_ID}>
							No projects match that filter.
						</p>
					) : (
						<div
							className="grid max-h-72 gap-2 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3"
							id={PANEL_ID}>
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
										<FilePath
											className="block truncate text-xs text-muted-foreground"
											path={project.path}
										/>
									</span>
								</label>
							))}
						</div>
					))}
			</Card>
		</section>
	);
}
