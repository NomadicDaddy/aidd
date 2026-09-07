import { default as Lock } from 'lucide-react/dist/esm/icons/lock';

import { Badge } from '../../components/ui/badge.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { useProjectNames } from '../../hooks/useProjects.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import { useScheduledDraft } from './scheduledDraftContext.ts';
import { ScheduledFormSection } from './ScheduledFormSection.tsx';
import { ScheduledProjectPicker } from './ScheduledProjectPicker.tsx';
import { ScheduledSafetyFields } from './ScheduledSafetyFields.tsx';

export function ScheduledFixedScopeSection() {
	return (
		<ScheduledFormSection title="Projects">
			<div className="max-w-[58rem] space-y-2">
				<FieldRow label="Project scope">
					<div
						className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-muted px-3 sm:h-9 sm:min-h-0"
						role="group">
						<Lock
							aria-hidden="true"
							className="size-4 shrink-0 text-muted-foreground"
						/>
						<span className="min-w-0 flex-1 truncate text-sm text-foreground">
							Fleet-wide Director cycle
						</span>
						<Badge className="bg-card" tone="neutral">
							Fixed
						</Badge>
					</div>
				</FieldRow>
				<p className={`text-xs text-muted-foreground ${proseMeasureClass}`}>
					No project can be selected. The cycle analyzes the whole fleet and takes its CLI
					and model from the Director profile.
				</p>
			</div>
		</ScheduledFormSection>
	);
}

export function ScheduledScopeAndSafetySections() {
	const { draft, patch } = useScheduledDraft();
	const projectQuery = useProjectNames();
	const projectDir =
		draft.projectScope === 'explicit' && draft.projects.length === 1
			? draft.projects[0]
			: undefined;
	return (
		<div className="space-y-4">
			<ScheduledFormSection required={draft.projectScope === 'explicit'} title="Projects">
				<ScheduledProjectPicker
					availableProjects={projectQuery.data?.projects ?? []}
					onChange={(projects) => patch({ projects })}
					onScopeChange={(projectScope) => patch({ projectScope })}
					projects={draft.projects}
					scope={draft.projectScope}
				/>
			</ScheduledFormSection>
			<ScheduledFormSection title="Safety">
				<ScheduledSafetyFields
					noProject={draft.projectScope === 'none'}
					{...(projectDir ? { projectDir } : {})}
				/>
			</ScheduledFormSection>
		</div>
	);
}
