import type { ProjectTemplateSummary } from '../../api/types/settings.ts';
import type { GithubTemplateSourceState } from './useGithubTemplateSource.ts';

import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { selectClass } from '../../lib/formStyles.ts';

// Source-selection fields of the create lane (ProjectCreateLane.tsx), split out to keep
// that file within the modularity budget: the GitHub-repo source field (state lives in
// useGithubTemplateSource.ts) and the registered-template picker.

export function GithubRepoField({ source }: { source: GithubTemplateSourceState }) {
	return (
		<FieldRow error={source.urlError} label="GitHub repository" required>
			<Input
				onChange={(event) => source.onUrlChange(event.target.value)}
				placeholder="https://github.com/owner/repo or owner/repo#ref"
				value={source.templateUrl}
			/>
			{/* The hint stays a sibling and the message is the field's: they were an either/or
			    before, so learning what the field does cost you the explanation of what it does. */}
			{source.urlError ? null : (
				<p className="text-xs text-muted-foreground">
					Cloned as a template: history is stripped and a fresh git repo is initialized.
				</p>
			)}
		</FieldRow>
	);
}

export function ProjectTemplatePicker({
	onChange,
	selectedTemplate,
	templateName,
	templates,
}: {
	onChange: (name: string) => void;
	selectedTemplate: null | ProjectTemplateSummary;
	templateName: string;
	templates: ProjectTemplateSummary[];
}) {
	return (
		<FieldRow label="Template">
			<select
				className={selectClass}
				onChange={(event) => onChange(event.target.value)}
				value={templateName}>
				{templates.length === 0 ? <option value="">No templates configured</option> : null}
				{templates.map((template) => (
					<option key={template.name} value={template.name}>
						{template.name}
					</option>
				))}
			</select>
			{selectedTemplate ? (
				<p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
			) : null}
		</FieldRow>
	);
}
