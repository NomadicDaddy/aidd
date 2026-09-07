import type { ScheduledTaskProjectScope } from 'aidd-shared/contracts/scheduled-tasks';

import { Button } from '../../components/ui/button.tsx';
import { Checkbox } from '../../components/ui/checkbox.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { touchTargetRowClass } from '../../lib/touchTarget.ts';
import { proseMeasureClass } from '../../lib/typography.ts';

const scopes = [
	{ label: 'All projects', value: 'all' },
	{ label: 'Selected projects', value: 'explicit' },
	{ label: 'No project', value: 'none' },
] as const;

const descriptions: Record<ScheduledTaskProjectScope, string> = {
	all: 'Runs once for every project discovered when each occurrence starts.',
	explicit: 'Runs once for each project you choose below.',
	none: 'Runs exactly once with no project, from the applications root. Use this for fleet-wide work such as the development diary.',
};

interface ScheduledProjectPickerProps {
	availableProjects: { name: string; path: string }[];
	onChange: (projects: string[]) => void;
	onScopeChange: (scope: ScheduledTaskProjectScope) => void;
	projects: string[];
	scope: ScheduledTaskProjectScope;
}

export function ScheduledProjectPicker({
	availableProjects,
	onChange,
	onScopeChange,
	projects,
	scope,
}: ScheduledProjectPickerProps) {
	return (
		<div>
			<SegmentedControl
				ariaLabel="Project scope"
				onChange={onScopeChange}
				options={[...scopes]}
				value={scope}
			/>
			<p className={`mt-2 mb-2 text-xs text-muted-foreground ${proseMeasureClass}`}>
				{descriptions[scope]}
			</p>
			{/* Hidden rather than disabled outside the explicit scope: a greyed-out list of every
			    project is what made an empty selection ambiguous in the first place. */}
			{scope === 'explicit' && (
				<div
					aria-label="Project selection"
					aria-required="true"
					className="rounded-md border border-border bg-muted p-3"
					role="group">
					<div className="mb-3 flex items-center justify-between gap-3">
						<p
							aria-live="polite"
							className="text-xs text-muted-foreground"
							role="status">
							{projects.length} of {availableProjects.length} selected
						</p>
						<Button
							disabled={projects.length === 0}
							onClick={() => onChange([])}
							size="compact"
							variant="ghost">
							Reset
						</Button>
					</div>
					<div className="grid max-h-64 grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2 overflow-y-auto">
						{availableProjects.map((project) => (
							<label
								className={`flex items-center gap-2 text-sm ${touchTargetRowClass}`}
								key={project.path}>
								<Checkbox
									checked={projects.includes(project.path)}
									onChange={() =>
										onChange(
											projects.includes(project.path)
												? projects.filter((path) => path !== project.path)
												: [...projects, project.path],
										)
									}
								/>
								{project.name}
							</label>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
