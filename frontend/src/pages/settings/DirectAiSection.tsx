import type {
	DirectAiSettings,
	DirectAiSurfaceSettings,
	ReasoningEffort,
	WebConfigSettings,
} from '../../api/types.ts';

import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { selectClass } from '../../lib/formStyles.ts';
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
		<Card className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
			<div className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800">
				<label className="flex items-center gap-2">
					<input
						checked={directAi.enabled}
						onChange={(event) => updateDirectAi({ enabled: event.target.checked })}
						type="checkbox"
					/>
					<span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
						Direct AI
					</span>
				</label>
				<span className="text-xs font-medium text-neutral-500">
					{directAi.apiKeyConfigured ? 'API key configured' : 'No API key'}
				</span>
			</div>
			<label className={`space-y-1 ${dimClass}`.trim()}>
				<span className="text-xs font-medium text-neutral-500 uppercase">Provider</span>
				<Input
					disabled={disabled}
					onChange={(event) =>
						updateDirectAi({ provider: nullableText(event.target.value) })
					}
					placeholder="zhipu"
					value={textValue(directAi.provider)}
				/>
			</label>
			<label className={`space-y-1 ${dimClass}`.trim()}>
				<span className="text-xs font-medium text-neutral-500 uppercase">Model</span>
				<Input
					disabled={disabled}
					onChange={(event) =>
						updateDirectAi({ model: nullableText(event.target.value) })
					}
					placeholder="glm-5.1"
					value={textValue(directAi.model)}
				/>
			</label>
			<label className={`space-y-1 md:col-span-2 ${dimClass}`.trim()}>
				<span className="text-xs font-medium text-neutral-500 uppercase">Base URL</span>
				<Input
					disabled={disabled}
					onChange={(event) =>
						updateDirectAi({ baseUrl: nullableText(event.target.value) })
					}
					placeholder="https://api.z.ai/api/coding/paas/v4"
					value={textValue(directAi.baseUrl)}
				/>
			</label>
			<label className={`space-y-1 md:col-span-2 xl:col-span-3 ${dimClass}`.trim()}>
				<span className="text-xs font-medium text-neutral-500 uppercase">API Key</span>
				<Input
					autoComplete="off"
					disabled={disabled}
					onChange={(event) => updateDirectAi({ apiKey: event.target.value })}
					placeholder={apiKeyPlaceholder}
					type="password"
					value={apiKeyValue}
				/>
				<span className="text-xs text-neutral-500">
					Stored as <code>providers.&lt;provider&gt;.apiKey</code>. Leave blank to keep
					the existing key.
				</span>
			</label>
			<label className={`space-y-1 ${dimClass}`.trim()}>
				<span className="text-xs font-medium text-neutral-500 uppercase">
					Reasoning Effort
				</span>
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
			</label>
			<label className={`space-y-1 ${dimClass}`.trim()}>
				<span className="text-xs font-medium text-neutral-500 uppercase">Timeout</span>
				<Input
					disabled={disabled}
					inputMode="numeric"
					onChange={(event) =>
						updateDirectAi({ timeoutSeconds: nullableNumber(event.target.value) })
					}
					placeholder="45"
					value={numberValue(directAi.timeoutSeconds)}
				/>
			</label>
			<div className={`grid gap-2 md:col-span-2 xl:col-span-3 ${dimClass}`.trim()}>
				<span className="text-xs font-medium text-neutral-500 uppercase">Surfaces</span>
				<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
					{surfaceOptions.map((surface) => (
						<label
							className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800"
							key={surface.key}>
							<input
								checked={directAi.surfaces[surface.key]}
								disabled={disabled}
								onChange={(event) =>
									updateSurface(surface.key, event.target.checked)
								}
								type="checkbox"
							/>
							<span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
								{surface.label}
							</span>
						</label>
					))}
				</div>
			</div>
			<div className="grid gap-2 md:col-span-2 xl:col-span-3">
				<span className="text-xs font-medium text-neutral-500 uppercase">
					Director chat agent
				</span>
				<label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/30">
					<input
						checked={directorChatAllowFileEdits}
						className="mt-0.5"
						onChange={(event) =>
							setField('directorChatAllowFileEdits', event.target.checked)
						}
						type="checkbox"
					/>
					<span className="text-sm text-amber-900 dark:text-amber-200">
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
