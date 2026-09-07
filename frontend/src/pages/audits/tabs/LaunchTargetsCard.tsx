import { useState } from 'react';

import type { AuditManager } from '../../../api/types.ts';

import { DisclosureMarker } from '../../../components/shared/DisclosureMarker.tsx';
import { FilePath } from '../../../components/shared/FilePath.tsx';
import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { CardHeader } from '../../../components/ui/card.tsx';
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
 * list, so it sits in the header of the toolbar whose actions it gates.
 *
 * Expanded it is a 33-project grid running y=440 to y=810, which put the first header of the table
 * this tab exists to show at y=830 and left five audit rows on a 1200px screen. It is a disclosure
 * now, collapsed by default, and it renders inside the actions card rather than as a card of its
 * own — see the region comment below.
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
		// No card of its own. The toolbar Card owns the disclosure, filters, result count and launch
		// actions as one composition, so the catalog does not spend a second full-width card on
		// controls that act on the same rows.
		//
		// No `scroll-mt-4`, for the same reason as `AuditDefinitionEditor`: the root declares that
		// 1rem as `scroll-padding-top`, and a scroll margin here would add to it rather than replace
		// it.
		<section className="flex flex-col gap-3" id={auditLaunchTargetsId}>
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
							variant="secondary">
							<DisclosureMarker open={open} />
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
				description="Checked projects are shared by the Run and Review controls."
				title="Launch Targets"
			/>
			{open &&
				(visible.length === 0 ? (
					<p className="text-sm text-muted-foreground" id={PANEL_ID}>
						No projects match that filter.
					</p>
				) : (
					<OverflowScroller
						ariaLabel="Launch targets"
						id={PANEL_ID}
						scrollerClassName="grid max-h-80 grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2 overflow-y-auto pr-1"
						showTopCue
						surface="card">
						{visible.map((project) => (
							<label
								// `max-sm:min-h-11` on the label: the 16px checkbox inside it cannot
								// carry the floor itself, and this row already is its hit area.
								className="flex min-w-0 items-start gap-2 rounded-md p-1 text-sm hover:bg-muted/60 max-sm:min-h-11"
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
					</OverflowScroller>
				))}
		</section>
	);
}
