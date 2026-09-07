import type { ReactNode } from 'react';

import type { RecipeLaunchProject } from './recipe-launch.ts';

import { FieldRow } from '../../components/ui/field.tsx';
import { selectClass } from '../../lib/formStyles.ts';

export function RecipeProjectField({
	describedBy,
	label = 'Project',
	onChange,
	projectDir,
	projects,
}: {
	describedBy?: string;
	label?: ReactNode;
	onChange: (projectDir: string) => void;
	projectDir: string;
	projects: RecipeLaunchProject[];
}) {
	return (
		<FieldRow label={label} required>
			<select
				aria-describedby={describedBy}
				className={`${selectClass} w-full`}
				onChange={(event) => onChange(event.target.value)}
				value={projectDir}>
				<option value="">Select target project</option>
				{projects.map((project) => (
					<option key={project.id} value={project.path}>
						{project.name}
					</option>
				))}
			</select>
		</FieldRow>
	);
}
