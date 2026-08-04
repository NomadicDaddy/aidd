import { default as Save } from 'lucide-react/dist/esm/icons/save';

import type { AuditManager } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { fieldLabelClass } from '../../../lib/formStyles.ts';

interface CatalogSidePanelProps {
	auditPath: string | undefined;
	content: string;
	dirty: boolean;
	onContentChange: (value: string) => void;
	onSave: () => void;
	onToggleProject: (id: string) => void;
	projects: AuditManager['projects'];
	savePending: boolean;
	selectedAudit: null | string;
	selectedProjectIds: string[];
}

export function CatalogSidePanel({
	auditPath,
	content,
	dirty,
	onContentChange,
	onSave,
	onToggleProject,
	projects,
	savePending,
	selectedAudit,
	selectedProjectIds,
}: CatalogSidePanelProps) {
	return (
		<div className="space-y-4">
			<Card className="space-y-3">
				<div className="space-y-1">
					<div className={fieldLabelClass}>Launch Targets</div>
					<p className="text-xs text-muted-foreground">
						Select one or more projects to enable Run Selected, Run All, and Review.
					</p>
				</div>
				<div className="max-h-52 space-y-2 overflow-auto pr-1">
					{projects.map((project) => (
						<label className="flex items-start gap-2 text-sm" key={project.id}>
							<input
								checked={selectedProjectIds.includes(project.id)}
								onChange={() => onToggleProject(project.id)}
								type="checkbox"
							/>
							<span>
								<span className="block font-medium text-foreground">
									{project.name}
								</span>
								<span className="block text-xs break-all text-muted-foreground">
									{project.path}
								</span>
							</span>
						</label>
					))}
				</div>
			</Card>

			<Card className="space-y-3">
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="font-medium text-foreground">
							{selectedAudit ?? 'Select an audit'}
						</div>
						<div className="text-xs break-all text-muted-foreground">{auditPath}</div>
					</div>
					<Button
						disabled={!dirty || savePending || !selectedAudit}
						onClick={onSave}
						variant="primary">
						<Save className="h-4 w-4" />
						{savePending ? 'Saving…' : 'Save'}
					</Button>
				</div>
				<textarea
					aria-label="Audit definition markdown"
					className="min-h-[420px] w-full resize-y rounded-md border border-border bg-card p-3 font-mono text-xs text-foreground outline-none focus-visible:border-border focus-visible:ring-2 focus-visible:ring-ring"
					onChange={(event) => onContentChange(event.target.value)}
					value={content}
				/>
			</Card>
		</div>
	);
}
