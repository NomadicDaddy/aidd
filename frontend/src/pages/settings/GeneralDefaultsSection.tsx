import type { BackendInputName, ReasoningEffort, WebConfigSettings } from '../../api/types.ts';

import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldCheckbox, FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { backendOptions } from '../../lib/backends.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { nullableText, shadowingBackendModel, textValue } from './settingsUtils.ts';

const reasoningOptions: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export function GeneralDefaultsSection({
	form,
	setField,
}: {
	form: WebConfigSettings;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	const shadowedBy = shadowingBackendModel(form);
	return (
		<Card className="space-y-3">
			<CardHeader
				className="mb-0"
				description="Set the default backend, models, reasoning, and project initialization path."
				title="Model Routing"
			/>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				<FieldRow label="Default CLI">
					<select
						className={`${selectClass} w-full`}
						onChange={(event) =>
							setField('cli', event.target.value as BackendInputName)
						}
						value={form.cli}>
						{backendOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</FieldRow>
				<FieldRow label="Default Model">
					<Input
						onChange={(event) => setField('model', nullableText(event.target.value))}
						value={textValue(form.model)}
					/>
					{shadowedBy ? (
						<p className={`text-xs ${toneText.amber}`}>
							Shadowed for {form.cli} launches: the Backend Matrix (Run Engine tab)
							sets “{shadowedBy}” for {form.cli}, and backend models outrank this
							shared default. Clear that row to use this value.
						</p>
					) : null}
				</FieldRow>
				<FieldRow label="Reasoning Effort">
					<select
						className={`${selectClass} w-full`}
						onChange={(event) =>
							setField('reasoningEffort', event.target.value as ReasoningEffort)
						}
						value={form.reasoningEffort}>
						{reasoningOptions.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
				</FieldRow>
				<FieldRow label="Init Model">
					<Input
						onChange={(event) =>
							setField('initModel', nullableText(event.target.value))
						}
						value={textValue(form.initModel)}
					/>
				</FieldRow>
				<FieldRow label="Code Model">
					<Input
						onChange={(event) =>
							setField('codeModel', nullableText(event.target.value))
						}
						value={textValue(form.codeModel)}
					/>
				</FieldRow>
				<FieldRow label="Audit Model">
					<Input
						onChange={(event) =>
							setField('auditModel', nullableText(event.target.value))
						}
						value={textValue(form.auditModel)}
					/>
				</FieldRow>
				<FieldCheckbox
					checked={form.auditsEnabled}
					label="Audits enabled"
					onChange={(event) => setField('auditsEnabled', event.target.checked)}
				/>
				<FieldRow className="md:col-span-2 xl:col-span-3" label="Spernakit Init Script">
					<Input
						onChange={(event) =>
							setField('spernakitInitScript', nullableText(event.target.value))
						}
						placeholder="/path/to/spernakit_init.ps1"
						value={textValue(form.spernakitInitScript)}
					/>
					<p className="text-xs text-muted-foreground">
						Optional path to a local Spernakit checkout's init script. When set,
						Spernakit apps are created from that checkout; leave empty to clone the
						template on demand.
					</p>
				</FieldRow>
				<FieldRow className="md:col-span-2 xl:col-span-3" label="Spernakit Template Repo">
					<Input
						onChange={(event) =>
							setField('spernakitTemplateRepo', nullableText(event.target.value))
						}
						placeholder="NomadicDaddy/spernakit"
						value={textValue(form.spernakitTemplateRepo)}
					/>
					<p className="text-xs text-muted-foreground">
						owner/repo cloned when creating a Spernakit app without a configured init
						script. Defaults to NomadicDaddy/spernakit.
					</p>
				</FieldRow>
				<FieldRow className="md:col-span-2 xl:col-span-3" label="Spernakit Template Ref">
					<Input
						onChange={(event) =>
							setField('spernakitTemplateRef', nullableText(event.target.value))
						}
						placeholder="git tag/branch (default branch if empty)"
						value={textValue(form.spernakitTemplateRef)}
					/>
					<p className="text-xs text-muted-foreground">
						Optional git tag or branch to clone. Changing it rebuilds the cached clone.
					</p>
				</FieldRow>
				{/* The sentence used to sit outside the bordered box, as a sibling paragraph, so
				    the box read as an unexplained switch and its explanation looked like the
				    intro to whatever followed. It is inside the box, where the other eight are. */}
				<FieldCheckbox
					checked={form.showSpernakitProject}
					className="md:col-span-2 xl:col-span-3"
					description="The Spernakit template checkout is hidden from the projects page by default; enable this if you plan to work on Spernakit itself."
					label="Show Spernakit in projects list"
					onChange={(event) => setField('showSpernakitProject', event.target.checked)}
				/>
			</div>
		</Card>
	);
}
