import type { BackendInputName, ReasoningEffort, WebConfigSettings } from '../../api/types.ts';

import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { backendOptions } from '../../lib/backends.ts';
import { selectClass } from '../../lib/formStyles.ts';
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
		<Card className="space-y-3 p-3">
			<div>
				<h2 className="text-sm font-semibold text-foreground">Model Routing</h2>
				<p className="mt-0.5 text-xs text-muted-foreground">
					Set the default backend, models, reasoning, and project initialization path.
				</p>
			</div>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				<label className="space-y-1">
					<span className="text-xs font-medium text-muted-foreground uppercase">
						Default CLI
					</span>
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
				</label>
				<label className="space-y-1">
					<span className="text-xs font-medium text-muted-foreground uppercase">
						Default Model
					</span>
					<Input
						onChange={(event) => setField('model', nullableText(event.target.value))}
						value={textValue(form.model)}
					/>
					{shadowedBy ? (
						<p className="text-xs text-amber-600 dark:text-amber-500">
							Shadowed for {form.cli} launches: the Backend Matrix (Run Engine tab)
							sets “{shadowedBy}” for {form.cli}, and backend models outrank this
							shared default. Clear that row to use this value.
						</p>
					) : null}
				</label>
				<label className="space-y-1">
					<span className="text-xs font-medium text-muted-foreground uppercase">
						Reasoning Effort
					</span>
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
				</label>
				<label className="space-y-1">
					<span className="text-xs font-medium text-muted-foreground uppercase">
						Init Model
					</span>
					<Input
						onChange={(event) =>
							setField('initModel', nullableText(event.target.value))
						}
						value={textValue(form.initModel)}
					/>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-medium text-muted-foreground uppercase">
						Code Model
					</span>
					<Input
						onChange={(event) =>
							setField('codeModel', nullableText(event.target.value))
						}
						value={textValue(form.codeModel)}
					/>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-medium text-muted-foreground uppercase">
						Audit Model
					</span>
					<Input
						onChange={(event) =>
							setField('auditModel', nullableText(event.target.value))
						}
						value={textValue(form.auditModel)}
					/>
				</label>
				<label className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
					<input
						checked={form.auditsEnabled}
						onChange={(event) => setField('auditsEnabled', event.target.checked)}
						type="checkbox"
					/>
					<span className="text-sm font-medium text-foreground">Audits enabled</span>
				</label>
				<label className="space-y-1 md:col-span-2 xl:col-span-3">
					<span className="text-xs font-medium text-muted-foreground uppercase">
						Spernakit Init Script
					</span>
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
				</label>
				<label className="space-y-1 md:col-span-2 xl:col-span-3">
					<span className="text-xs font-medium text-muted-foreground uppercase">
						Spernakit Template Repo
					</span>
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
				</label>
				<label className="space-y-1 md:col-span-2 xl:col-span-3">
					<span className="text-xs font-medium text-muted-foreground uppercase">
						Spernakit Template Ref
					</span>
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
				</label>
				<label className="space-y-1 md:col-span-2 xl:col-span-3">
					<span className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
						<input
							checked={form.showSpernakitProject}
							onChange={(event) =>
								setField('showSpernakitProject', event.target.checked)
							}
							type="checkbox"
						/>
						<span className="text-sm font-medium text-foreground">
							Show Spernakit in projects list
						</span>
					</span>
					<p className="text-xs text-muted-foreground">
						The Spernakit template checkout is hidden from the projects page by default;
						enable this if you plan to work on Spernakit itself.
					</p>
				</label>
			</div>
		</Card>
	);
}
