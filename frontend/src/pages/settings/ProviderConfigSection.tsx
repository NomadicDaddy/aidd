import { useId, useState } from 'react';

import type { ProviderSettings, ReasoningEffort, WebConfigSettings } from '../../api/types.ts';

import { CredentialBadge } from '../../components/shared/CredentialBadge.tsx';
import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldRow, FormGrid } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { SecretInput } from '../../components/ui/secret-input.tsx';
import { providerLabel, providerOptions } from '../../lib/backends.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { compactFieldMeasureClass } from '../../lib/typography.ts';
import { providerBaseUrlValidationError } from './settingsBaseUrlValidation.ts';
import { nullableText, textValue } from './settingsUtils.ts';

const reasoningOptions: ('' | ReasoningEffort)[] = [
	'',
	'none',
	'minimal',
	'low',
	'medium',
	'high',
	'xhigh',
];

function updateProvider(
	form: WebConfigSettings,
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void,
	name: string,
	partial: Partial<ProviderSettings>,
) {
	const existing = form.providers[name] ?? {
		apiKeyConfigured: false,
		baseUrl: null,
		model: null,
		reasoningEffort: null,
	};
	const providers = { ...form.providers };
	providers[name] = {
		apiKeyConfigured: partial.apiKeyConfigured ?? existing.apiKeyConfigured,
		baseUrl: partial.baseUrl !== undefined ? partial.baseUrl : existing.baseUrl,
		model: partial.model !== undefined ? partial.model : existing.model,
		reasoningEffort:
			partial.reasoningEffort !== undefined
				? partial.reasoningEffort
				: existing.reasoningEffort,
	};
	if (partial.apiKey !== undefined) {
		providers[name].apiKey = partial.apiKey;
	} else if (existing.apiKey !== undefined) {
		providers[name].apiKey = existing.apiKey;
	}
	setField('providers', providers);
}

function ProviderCard({
	defaultOpen,
	form,
	name,
	provider,
	setField,
}: {
	defaultOpen: boolean;
	form: WebConfigSettings;
	name: string;
	provider: ProviderSettings;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const panelId = useId();

	function update(partial: Partial<ProviderSettings>) {
		updateProvider(form, setField, name, partial);
	}
	function setApiKey(value: string | undefined) {
		const next = { ...provider };
		if (value === undefined) delete next.apiKey;
		else next.apiKey = value;
		setField('providers', { ...form.providers, [name]: next });
	}

	const apiKeyValue = provider.apiKey ?? '';
	const clearingKey = provider.apiKey === '' && provider.apiKeyConfigured;
	const apiKeyPlaceholder = clearingKey
		? 'Saved key marked for removal'
		: provider.apiKeyConfigured
			? 'API key set (leave blank to keep)'
			: 'Paste API key';
	const baseUrlError = providerBaseUrlValidationError(provider.baseUrl, name);

	return (
		<Card className="overflow-hidden p-0">
			{/* `ring-inset`, and the `--ring` token rather than a raw palette teal.
			    The row is 1960x44 inside a 1962x46 card that clips its overflow, so an
			    outward-drawn 2px ring had one pixel of card to be drawn into on each edge and
			    was cut on all four — a focused row was pixel-identical to its neighbours at 3x
			    zoom, on the only path to every provider's key. Inset draws it over the row's
			    own padding, which nothing clips. */}
			<button
				aria-controls={panelId}
				aria-expanded={open}
				className="grid w-full grid-cols-[minmax(0,1fr)] justify-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:outline-none focus-visible:ring-inset max-sm:min-h-11 @min-[32rem]:grid-cols-[minmax(8rem,14rem)_minmax(0,44rem)_max-content] @min-[32rem]:items-center"
				onClick={() => setOpen((current) => !current)}
				type="button">
				<span className="flex min-w-0 items-center gap-2">
					<DisclosureMarker open={open} />
					<span className="min-w-0">
						<span className="block truncate text-sm font-semibold text-foreground">
							{providerLabel(name)}
						</span>
						<span className="block truncate font-mono text-xs text-muted-foreground">
							{name}
						</span>
					</span>
				</span>
				<span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
					<ExecutionIdentityBadges
						model={provider.model}
						provider={name}
						reasoningEffort={provider.reasoningEffort}
						withTooltip={false}
					/>
					{/* Mono only when it is actually a URL — the fallback is prose and would read as a
				    machine string in the same face as the model chip beside it. */}
					<span
						className={`min-w-0 truncate max-sm:basis-full ${provider.baseUrl === null ? '' : 'font-mono'}`}>
						{provider.baseUrl ?? 'No base URL'}
					</span>
				</span>
				<span className="inline-flex justify-self-start @min-[32rem]:justify-self-end">
					{name === form.defaultProvider ? <Badge tone="neutral">Default</Badge> : null}
					<CredentialBadge configured={provider.apiKeyConfigured} />
				</span>
			</button>
			{open ? (
				<div className="border-t border-border p-3" id={panelId}>
					<FormGrid className="@min-[45rem]:grid-cols-2 @min-[61rem]:grid-cols-3">
						<FieldRow error={baseUrlError} label="Base URL">
							<Input
								className="font-mono"
								inputMode="url"
								onChange={(event) =>
									update({ baseUrl: nullableText(event.target.value) })
								}
								placeholder="https://api.example.com/v1"
								type="url"
								value={textValue(provider.baseUrl)}
							/>
						</FieldRow>
						<FieldRow label="Model">
							<Input
								className="font-mono"
								onChange={(event) =>
									update({ model: nullableText(event.target.value) })
								}
								placeholder="model-name"
								value={textValue(provider.model)}
							/>
						</FieldRow>
						<FieldRow label="Reasoning Effort">
							<select
								className={`${selectClass} w-full`}
								onChange={(event) =>
									update({
										reasoningEffort: event.target.value
											? (event.target.value as ReasoningEffort)
											: null,
									})
								}
								value={provider.reasoningEffort ?? ''}>
								{reasoningOptions.map((option) => (
									<option key={option || 'default'} value={option}>
										{option || 'Default'}
									</option>
								))}
							</select>
						</FieldRow>
						<FieldRow
							className="@min-[45rem]:col-span-2 @min-[61rem]:col-span-3"
							hint={
								<span role="status">
									{clearingKey
										? 'Saved key will be cleared when you save.'
										: provider.apiKey
											? 'New key will be used when you save.'
											: provider.apiKeyConfigured
												? 'Keeping the saved key. Enter a replacement or choose Clear saved key.'
												: 'Enter a key to configure this provider.'}
								</span>
							}
							label="API Key">
							<SecretInput
								autoComplete="off"
								name={`${name}-api-key`}
								onChange={(event) => setApiKey(event.target.value || undefined)}
								placeholder={apiKeyPlaceholder}
								secretName={`${name} API key`}
								value={apiKeyValue}
							/>
							<div className="flex flex-wrap gap-2">
								{provider.apiKeyConfigured && !clearingKey ? (
									<Button
										onClick={() => setApiKey('')}
										size="compact"
										variant="secondary">
										Clear saved key
									</Button>
								) : null}
								{provider.apiKey !== undefined ? (
									<Button
										onClick={() => setApiKey(undefined)}
										size="compact"
										variant="ghost">
										Undo key change
									</Button>
								) : null}
							</div>
						</FieldRow>
					</FormGrid>
				</div>
			) : null}
		</Card>
	);
}

export function ProviderConfigSection({
	form,
	setField,
}: {
	form: WebConfigSettings;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	const providerNames = Object.keys(form.providers);
	const configuredProviderOptions = providerOptions(providerNames);

	return (
		<FormGrid>
			<section aria-labelledby="provider-settings-heading" className="space-y-3">
				<Card className="flex flex-col gap-3">
					<CardHeader
						className="mb-0"
						description="Expand a provider to edit its endpoint, model, reasoning, or write-only key."
						id="provider-settings-heading"
						title="Providers"
					/>
					<FormGrid>
						<FieldRow className={compactFieldMeasureClass} label="Default Provider">
							<select
								className={`${selectClass} w-full`}
								onChange={(event) =>
									setField('defaultProvider', nullableText(event.target.value))
								}
								value={textValue(form.defaultProvider)}>
								<option value="">Use environment or built-in default</option>
								{configuredProviderOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</FieldRow>
					</FormGrid>
				</Card>
				{providerNames.length > 0 ? (
					<div className="space-y-2">
						{providerNames.map((name) => (
							<ProviderCard
								defaultOpen={name === form.defaultProvider}
								form={form}
								key={name}
								name={name}
								provider={form.providers[name]!}
								setField={setField}
							/>
						))}
					</div>
				) : (
					<Card className="px-4 py-6 text-center">
						<p className="text-sm text-muted-foreground">
							No providers configured. Add providers to your{' '}
							<code className="rounded bg-muted px-1.5 py-0.5 text-xs">
								config.json
							</code>{' '}
							to edit them here.
						</p>
					</Card>
				)}
			</section>
		</FormGrid>
	);
}
