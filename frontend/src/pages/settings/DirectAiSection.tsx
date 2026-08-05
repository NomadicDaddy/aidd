import type {
	DirectAiSettings,
	DirectAiSurfaceSettings,
	ReasoningEffort,
	WebConfigSettings,
} from '../../api/types.ts';

import { Card } from '../../components/ui/card.tsx';
import { Checkbox } from '../../components/ui/checkbox.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { fieldLabelClass, selectClass } from '../../lib/formStyles.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';
import { nullableNumber, nullableText, numberValue, textValue } from './settingsUtils.ts';

const reasoningOptions: ('' | ReasoningEffort)[] = [
	'',
	'none',
	'minimal',
	'low',
	'medium',
	'high',
	'xhigh',
];

const surfaceOptions: { key: keyof DirectAiSurfaceSettings; label: string }[] = [
	{ key: 'projectAdvisor', label: 'Project advisor' },
	{ key: 'directorChat', label: 'Director chat' },
	{ key: 'directorCycle', label: 'Director cycle' },
	{ key: 'runSummaries', label: 'Run summaries' },
];

export function DirectAiSection({
	directAi,
	directorChatAllowFileEdits,
	setField,
}: {
	directAi: DirectAiSettings;
	directorChatAllowFileEdits: boolean;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	function updateDirectAi(next: Partial<DirectAiSettings>) {
		setField('directAi', { ...directAi, ...next });
	}

	function updateSurface(key: keyof DirectAiSurfaceSettings, value: boolean) {
		updateDirectAi({
			surfaces: {
				...directAi.surfaces,
				[key]: value,
			},
		});
	}

	const disabled = !directAi.enabled;
	const dimClass = disabled ? 'opacity-60 pointer-events-none' : '';
	const apiKeyValue = directAi.apiKey ?? '';
	const apiKeyPlaceholder = directAi.apiKeyConfigured
		? 'API key set (leave blank to keep)'
		: 'Paste API key';

	return (
		<Card className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			<div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
				<label className="flex items-center gap-2">
					<Checkbox
						checked={directAi.enabled}
						onChange={(event) => updateDirectAi({ enabled: event.target.checked })}
					/>
					<span className="text-sm font-medium text-foreground">Direct AI</span>
				</label>
				<span className="text-xs font-medium text-muted-foreground">
					{directAi.apiKeyConfigured ? 'API key configured' : 'No API key'}
				</span>
			</div>
			<FieldRow className={dimClass} label="Provider">
				<Input
					disabled={disabled}
					onChange={(event) =>
						updateDirectAi({ provider: nullableText(event.target.value) })
					}
					placeholder="zhipu"
					value={textValue(directAi.provider)}
				/>
			</FieldRow>
			<FieldRow className={dimClass} label="Model">
				<Input
					disabled={disabled}
					onChange={(event) =>
						updateDirectAi({ model: nullableText(event.target.value) })
					}
					placeholder="glm-5.1"
					value={textValue(directAi.model)}
				/>
			</FieldRow>
			<FieldRow className={`md:col-span-2 ${dimClass}`.trim()} label="Base URL">
				<Input
					disabled={disabled}
					onChange={(event) =>
						updateDirectAi({ baseUrl: nullableText(event.target.value) })
					}
					placeholder="https://api.z.ai/api/coding/paas/v4"
					value={textValue(directAi.baseUrl)}
				/>
			</FieldRow>
			<FieldRow className={`md:col-span-2 xl:col-span-3 ${dimClass}`.trim()} label="API Key">
				<Input
					autoComplete="off"
					disabled={disabled}
					onChange={(event) => updateDirectAi({ apiKey: event.target.value })}
					placeholder={apiKeyPlaceholder}
					type="password"
					value={apiKeyValue}
				/>
				<span className="text-xs text-muted-foreground">
					Stored as <code>providers.&lt;provider&gt;.apiKey</code>. Leave blank to keep
					the existing key.
				</span>
			</FieldRow>
			<FieldRow className={dimClass} label="Reasoning Effort">
				<select
					className={`${selectClass} w-full`}
					disabled={disabled}
					onChange={(event) =>
						updateDirectAi({
							reasoningEffort: event.target.value
								? (event.target.value as ReasoningEffort)
								: null,
						})
					}
					value={directAi.reasoningEffort ?? ''}>
					{reasoningOptions.map((option) => (
						<option key={option || 'default'} value={option}>
							{option || 'Default'}
						</option>
					))}
				</select>
			</FieldRow>
			<FieldRow className={dimClass} label="Timeout">
				<Input
					disabled={disabled}
					inputMode="numeric"
					onChange={(event) =>
						updateDirectAi({ timeoutSeconds: nullableNumber(event.target.value) })
					}
					placeholder="45"
					value={numberValue(directAi.timeoutSeconds)}
				/>
			</FieldRow>
			<div className={`grid gap-2 md:col-span-2 xl:col-span-3 ${dimClass}`.trim()}>
				<span className={fieldLabelClass}>Surfaces</span>
				<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
					{surfaceOptions.map((surface) => (
						<label
							className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
							key={surface.key}>
							<Checkbox
								checked={directAi.surfaces[surface.key]}
								disabled={disabled}
								onChange={(event) =>
									updateSurface(surface.key, event.target.checked)
								}
							/>
							<span className="text-sm font-medium text-foreground">
								{surface.label}
							</span>
						</label>
					))}
				</div>
			</div>
			<div className="grid gap-2 md:col-span-2 xl:col-span-3">
				<span className={fieldLabelClass}>Director chat agent</span>
				<label
					className={`flex items-start gap-2 rounded-md border px-3 py-2 ${toneBorder.amber} ${toneSurface.amber}`}>
					<Checkbox
						checked={directorChatAllowFileEdits}
						className="mt-0.5"
						onChange={(event) =>
							setField('directorChatAllowFileEdits', event.target.checked)
						}
					/>
					<span className={`text-sm ${toneText.amber}`}>
						<span className="font-medium">
							Allow Director chat to edit project files directly
						</span>
						<span className="mt-1 block text-xs">
							Off by default. When off, the Director only orchestrates supervised runs
							(visible on the Runs page, where you can stop or kill them). When on,
							the chat agent can write/edit files and run shell commands in your
							projects with no run-level supervision. Enable only if you understand
							the risk.
						</span>
					</span>
				</label>
			</div>
		</Card>
	);
}
