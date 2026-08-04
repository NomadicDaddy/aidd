import type { ProjectTemplateSummary } from '../../api/types/settings.ts';
import type { GithubTemplateSourceState } from './useGithubTemplateSource.ts';

import { Input } from '../../components/ui/input.tsx';
import { fieldLabelClass, selectClass } from '../../lib/formStyles.ts';

// Source-selection fields of the create lane (ProjectCreateLane.tsx), split out to keep
// that file within the modularity budget: the GitHub-repo source field (state lives in
// useGithubTemplateSource.ts) and the registered-template picker.

export function GithubRepoField({ source }: { source: GithubTemplateSourceState }) {
	return (
		<label className="space-y-1">
			<span className={fieldLabelClass}>GitHub repository</span>
			<Input
				onChange={(event) => source.onUrlChange(event.target.value)}
				placeholder="https://github.com/owner/repo or owner/repo#ref"
				value={source.templateUrl}
			/>
			{source.urlError ? (
				<p className="text-xs text-red-600 dark:text-red-400">{source.urlError}</p>
			) : (
				<p className="text-xs text-muted-foreground">
					Cloned as a template: history is stripped and a fresh git repo is initialized.
				</p>
			)}
		</label>
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
		<label className="space-y-1">
			<span className={fieldLabelClass}>Template</span>
			<select
				className={`${selectClass} w-full`}
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
		</label>
	);
}
