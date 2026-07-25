import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { useId, useState } from 'react';

import type { ProviderSettings, ReasoningEffort, WebConfigSettings } from '../../api/types.ts';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { cn } from '../../lib/cn.ts';
import { fieldLabelClass, selectClass } from '../../lib/formStyles.ts';
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

	const apiKeyValue = provider.apiKey ?? '';
	const apiKeyPlaceholder = provider.apiKeyConfigured
		? 'API key set (leave blank to keep)'
		: 'Paste API key';

	return (
		<Card className="overflow-hidden p-0">
			<button
				aria-controls={panelId}
				aria-expanded={open}
				className="grid w-full gap-2 px-3 py-2.5 text-left transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none sm:grid-cols-[minmax(8rem,0.7fr)_minmax(0,1fr)_auto] sm:items-center dark:hover:bg-neutral-900"
				onClick={() => setOpen((current) => !current)}
				type="button">
				<span className="flex min-w-0 items-center gap-2">
					<ChevronDown
						aria-hidden="true"
						className={cn(
							'h-4 w-4 shrink-0 transition-transform',
							open && 'rotate-180',
						)}
					/>
					<span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
						{name}
					</span>
				</span>
				<span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-neutral-500">
					<ExecutionIdentityBadges
						model={provider.model}
						provider={name}
						reasoningEffort={provider.reasoningEffort}
						withTooltip={false}
					/>
					<span className="min-w-0 truncate">{provider.baseUrl ?? 'No base URL'}</span>
				</span>
				<Badge tone={provider.apiKeyConfigured ? 'emerald' : 'neutral'}>
					{provider.apiKeyConfigured ? 'Key configured' : 'No key'}
				</Badge>
			</button>
			{open ? (
				<div
					className="grid gap-3 border-t border-neutral-200 p-3 md:grid-cols-2 xl:grid-cols-3 dark:border-neutral-800"
					id={panelId}>
					<label className="space-y-1">
						<span className={fieldLabelClass}>Base URL</span>
						<Input
							onChange={(event) =>
								update({ baseUrl: nullableText(event.target.value) })
							}
							placeholder="https://api.example.com/v1"
							value={textValue(provider.baseUrl)}
						/>
					</label>
					<label className="space-y-1">
						<span className={fieldLabelClass}>Model</span>
						<Input
							onChange={(event) =>
								update({ model: nullableText(event.target.value) })
							}
							placeholder="model-name"
							value={textValue(provider.model)}
						/>
					</label>
					<label className="space-y-1">
						<span className={fieldLabelClass}>Reasoning Effort</span>
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
					</label>
					<label className="space-y-1 md:col-span-2 xl:col-span-3">
						<span className={fieldLabelClass}>API Key</span>
						<Input
							autoComplete="off"
							name={`${name}-api-key`}
							onChange={(event) => update({ apiKey: event.target.value })}
							placeholder={apiKeyPlaceholder}
							type="password"
							value={apiKeyValue}
						/>
						<span className="text-xs text-neutral-500">
							Leave blank to keep the existing key. Set to empty and save to clear.
						</span>
					</label>
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

	return (
		<section aria-labelledby="provider-settings-heading" className="space-y-3">
			<Card className="grid gap-3 p-3 lg:grid-cols-[minmax(12rem,0.65fr)_minmax(0,1.35fr)] lg:items-center">
				<div>
					<h2
						className="text-sm font-semibold text-foreground"
						id="provider-settings-heading">
						Providers
					</h2>
					<p className="mt-0.5 text-xs text-neutral-500">
						Expand a provider to edit its endpoint, model, reasoning, or write-only key.
					</p>
				</div>
				<label className="space-y-1">
					<span className={fieldLabelClass}>Default Provider</span>
					<Input
						onChange={(event) =>
							setField('defaultProvider', nullableText(event.target.value))
						}
						placeholder="zhipu"
						value={textValue(form.defaultProvider)}
					/>
				</label>
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
					<p className="text-sm text-neutral-500">
						No providers configured. Add providers to your{' '}
						<code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">
							config.json
						</code>{' '}
						to edit them here.
					</p>
				</Card>
			)}
		</section>
	);
}
