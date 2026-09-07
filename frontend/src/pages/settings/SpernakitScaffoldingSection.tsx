import type { WebConfigSettings } from '../../api/types.ts';

import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldCheckbox, FieldRow, FormGrid } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { nullableText, textValue } from './settingsUtils.ts';

export function SpernakitScaffoldingSection({
	form,
	setField,
}: {
	form: WebConfigSettings;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	return (
		<Card className="flex flex-col gap-3">
			<CardHeader
				className="mb-0"
				description="Choose the Spernakit source used by project creation and whether its checkout appears in the project catalog."
				level="section"
				title="Spernakit Scaffolding"
			/>
			<FormGrid className="@min-[45rem]:grid-cols-2">
				<FieldRow
					className="@min-[45rem]:col-span-2"
					hint="Optional path to a local Spernakit checkout's init script. When set, Spernakit apps are created from that checkout; leave empty to clone the template on demand."
					label="Spernakit Init Script">
					<Input
						className="font-mono"
						onChange={(event) =>
							setField('spernakitInitScript', nullableText(event.target.value))
						}
						placeholder="/path/to/spernakit_init.ps1"
						value={textValue(form.spernakitInitScript)}
					/>
				</FieldRow>
				<FieldRow
					hint="Owner/repo cloned when no init script is configured. Defaults to NomadicDaddy/spernakit."
					label="Spernakit Template Repo">
					<Input
						onChange={(event) =>
							setField('spernakitTemplateRepo', nullableText(event.target.value))
						}
						placeholder="NomadicDaddy/spernakit"
						value={textValue(form.spernakitTemplateRepo)}
					/>
				</FieldRow>
				<FieldRow
					hint="Optional git tag or branch to clone. Changing it rebuilds the cached clone."
					label="Spernakit Template Ref">
					<Input
						className="font-mono"
						onChange={(event) =>
							setField('spernakitTemplateRef', nullableText(event.target.value))
						}
						placeholder="git tag/branch (default branch if empty)"
						value={textValue(form.spernakitTemplateRef)}
					/>
				</FieldRow>
				<FieldCheckbox
					checked={form.showSpernakitProject}
					className="@min-[45rem]:col-span-2"
					description="The Spernakit template checkout is hidden from the projects page by default; enable this if you plan to work on Spernakit itself."
					label="Show Spernakit in projects list"
					onChange={(event) => setField('showSpernakitProject', event.target.checked)}
				/>
			</FormGrid>
		</Card>
	);
}
