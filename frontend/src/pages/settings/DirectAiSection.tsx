import type {
	DirectAiSettings,
	DirectAiSurfaceSettings,
	ReasoningEffort,
	WebConfigSettings,
} from '../../api/types.ts';

import { CredentialBadge } from '../../components/shared/CredentialBadge.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldCheckbox, FieldRow, FormGrid } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { providerLabel, providerOptions } from '../../lib/backends.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { directAiBaseUrlValidationError } from './settingsBaseUrlValidation.ts';
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
	defaultProvider,
	directAi,
	directorChatAllowFileEdits,
	providerNames,
	providers,
	setField,
}: {
	defaultProvider: null | string;
	directAi: DirectAiSettings;
	directorChatAllowFileEdits: boolean;
	providerNames: readonly string[];
	providers: WebConfigSettings['providers'];
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
	const configuredProviderOptions = providerOptions(providerNames);
	const selectedProviderName = directAi.provider ?? defaultProvider;
	const selectedProvider = selectedProviderName ? providers[selectedProviderName] : undefined;
	const providerName = providerLabel(selectedProviderName) || 'selected provider';
	const providerModel = selectedProvider?.model ?? undefined;
	const providerBaseUrl = selectedProvider?.baseUrl ?? undefined;
	const providerCredentialConfigured =
		selectedProvider?.apiKeyConfigured ?? directAi.apiKeyConfigured;
	const baseUrlError = directAiBaseUrlValidationError(directAi.baseUrl);

	return (
		<section aria-labelledby="direct-ai-heading">
			<Card className="flex flex-col gap-3">
				<CardHeader
					className="mb-0"
					description="Configure provider-backed AI for project advice, Director cycles and chat, and run summaries."
					id="direct-ai-heading"
					title="Direct AI"
				/>
				<FormGrid className="@min-[45rem]:grid-cols-2 @min-[61rem]:grid-cols-3">
					<FieldCheckbox
						checked={directAi.enabled}
						className="self-start"
						label="Enable Direct AI"
						meta={<CredentialBadge configured={directAi.apiKeyConfigured} />}
						onChange={(event) => updateDirectAi({ enabled: event.target.checked })}
					/>
					<FieldRow className={dimClass} label="Provider">
						<select
							className={`${selectClass} w-full`}
							disabled={disabled}
							onChange={(event) =>
								updateDirectAi({ provider: nullableText(event.target.value) })
							}
							value={textValue(directAi.provider)}>
							<option value="">Use Default Provider</option>
							{configuredProviderOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</FieldRow>
					<FieldRow
						className={dimClass}
						hint={
							!directAi.model && providerModel
								? `Inherited from ${providerName}. Enter a value to override it.`
								: undefined
						}
						label="Model">
						<Input
							className="font-mono"
							disabled={disabled}
							onChange={(event) =>
								updateDirectAi({ model: nullableText(event.target.value) })
							}
							placeholder={providerModel ?? 'Provider default'}
							value={textValue(directAi.model)}
						/>
					</FieldRow>
					<FieldRow
						className={dimClass}
						error={baseUrlError}
						hint={
							!directAi.baseUrl && providerBaseUrl
								? `Inherited from ${providerName}. Enter a value to override it.`
								: undefined
						}
						label="Base URL">
						<Input
							className="font-mono"
							disabled={disabled}
							inputMode="url"
							onChange={(event) =>
								updateDirectAi({ baseUrl: nullableText(event.target.value) })
							}
							placeholder={providerBaseUrl ?? 'Provider default'}
							type="url"
							value={textValue(directAi.baseUrl)}
						/>
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
								updateDirectAi({
									timeoutSeconds: nullableNumber(event.target.value),
								})
							}
							placeholder="45"
							value={numberValue(directAi.timeoutSeconds)}
						/>
					</FieldRow>
					<FieldRow
						className={`@min-[45rem]:col-span-2 @min-[61rem]:col-span-3 ${dimClass}`.trim()}
						group
						hint={`Manage this write-only credential under Providers > ${providerName}.`}
						label="Provider Credential">
						<div className="flex min-h-9 items-center">
							<CredentialBadge configured={providerCredentialConfigured} />
						</div>
					</FieldRow>
					<div
						aria-labelledby="direct-ai-surfaces-heading"
						className={`grid gap-2 @min-[45rem]:col-span-2 @min-[61rem]:col-span-3 ${dimClass}`.trim()}
						role="group">
						<CardHeader
							className="mb-0"
							headingLevel={3}
							id="direct-ai-surfaces-heading"
							level="subsection"
							title="Surfaces"
						/>
						<div className="grid gap-2 @min-[32rem]:grid-cols-2 @min-[45rem]:grid-cols-4">
							{surfaceOptions.map((surface) => (
								<FieldCheckbox
									checked={directAi.surfaces[surface.key]}
									disabled={disabled}
									key={surface.key}
									label={surface.label}
									onChange={(event) =>
										updateSurface(surface.key, event.target.checked)
									}
								/>
							))}
						</div>
					</div>
				</FormGrid>
				<div className="grid gap-2 border-t border-border pt-3">
					<CardHeader
						className="mb-0"
						description="Control the Director chat agent's direct access to project files and shell commands."
						headingLevel={3}
						level="subsection"
						title="Director Chat Permissions"
					/>
					<FieldCheckbox
						checked={directorChatAllowFileEdits}
						className="self-start"
						description="Off by default. When off, the Director only orchestrates supervised runs (visible on the Runs page, where you can stop or kill them). When on, the chat agent can write/edit files and run shell commands in your projects with no run-level supervision. Enable only if you understand the risk."
						label="Allow Director chat to edit project files directly"
						onChange={(event) =>
							setField('directorChatAllowFileEdits', event.target.checked)
						}
						tone="amber"
					/>
				</div>
			</Card>
		</section>
	);
}
