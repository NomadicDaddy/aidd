import { FRONTEND_ROUTE_PATHS } from 'aidd-shared/contracts/frontend-routes';
import { Link } from 'react-router';

import type { BackendInputName, ReasoningEffort, WebConfigSettings } from '../../api/types.ts';

import { launchTargetDefaultDisplay } from '../../components/shared/launchTargetControlModel.ts';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldCheckbox, FieldRow, FormGrid } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useLaunchDefaults } from '../../hooks/useLaunchDefaults.ts';
import { backendOptions } from '../../lib/backends.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { EffectiveModelHint } from './EffectiveModelHint.tsx';
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
	const baseDefaults = useLaunchDefaults(undefined, 'interview');
	const codeDefaults = useLaunchDefaults(undefined, 'coding');
	const auditDefaults = useLaunchDefaults(undefined, 'audit');
	const baseDisplay = launchTargetDefaultDisplay({
		backend: baseDefaults.data?.effective.backend,
		isLoading: baseDefaults.isLoading,
		model: baseDefaults.data?.effective.model,
		modelSource: baseDefaults.data?.effective.modelSource,
		provider: baseDefaults.data?.effective.provider,
	});
	const codeDisplay = launchTargetDefaultDisplay({
		backend: codeDefaults.data?.effective.backend,
		isLoading: codeDefaults.isLoading,
		model: codeDefaults.data?.effective.model,
		modelSource: codeDefaults.data?.effective.modelSource,
		provider: codeDefaults.data?.effective.provider,
	});
	const auditDisplay = launchTargetDefaultDisplay({
		backend: auditDefaults.data?.effective.backend,
		isLoading: auditDefaults.isLoading,
		model: auditDefaults.data?.effective.model,
		modelSource: auditDefaults.data?.effective.modelSource,
		provider: auditDefaults.data?.effective.provider,
	});
	return (
		<Card
			aria-labelledby="settings-model-routing-heading"
			className="flex flex-col gap-3"
			role="region">
			<CardHeader
				action={
					<Link
						className={buttonClassName('secondary', undefined, 'compact')}
						to={FRONTEND_ROUTE_PATHS.settingsExecutionIdentityBadges}>
						Execution badge reference
					</Link>
				}
				actionLayout="stacked"
				className="mb-0"
				description="Set the default CLI, models, reasoning, and audit availability for new runs."
				id="settings-model-routing-heading"
				title="Model Routing"
			/>
			<FormGrid className="@min-[45rem]:grid-cols-2 @min-[61rem]:grid-cols-3">
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
				<FieldRow
					hint={
						form.model && shadowedBy ? (
							<span className={toneText.amber}>
								Shadowed for {form.cli} launches: the CLI Matrix (Run Engine tab)
								sets “{shadowedBy}” for {form.cli}, and CLI-specific models outrank
								this shared default. Clear that row to use this value.
							</span>
						) : !form.model ? (
							<span className={shadowedBy ? toneText.amber : undefined}>
								<EffectiveModelHint
									model={baseDisplay.modelLabel}
									text={baseDisplay.modelProvenance}
								/>
							</span>
						) : undefined
					}
					label="Default Model">
					<Input
						className="font-mono"
						onChange={(event) => setField('model', nullableText(event.target.value))}
						placeholder={baseDisplay.modelPlaceholder}
						value={textValue(form.model)}
					/>
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
				<FieldRow
					hint={
						!form.codeModel ? (
							<span className="max-sm:hidden">
								<EffectiveModelHint
									model={codeDisplay.modelLabel}
									text={codeDisplay.modelProvenance}
								/>
							</span>
						) : undefined
					}
					label="Code Model">
					<Input
						className="font-mono"
						onChange={(event) =>
							setField('codeModel', nullableText(event.target.value))
						}
						placeholder={codeDisplay.modelPlaceholder}
						value={textValue(form.codeModel)}
					/>
				</FieldRow>
				<FieldRow
					hint={
						!form.auditModel ? (
							<span className="max-sm:hidden">
								<EffectiveModelHint
									model={auditDisplay.modelLabel}
									text={auditDisplay.modelProvenance}
								/>
							</span>
						) : undefined
					}
					label="Audit Model">
					<Input
						className="font-mono"
						onChange={(event) =>
							setField('auditModel', nullableText(event.target.value))
						}
						placeholder={auditDisplay.modelPlaceholder}
						value={textValue(form.auditModel)}
					/>
				</FieldRow>
				<FieldCheckbox
					checked={form.auditsEnabled}
					label="Audits enabled"
					onChange={(event) => setField('auditsEnabled', event.target.checked)}
				/>
			</FormGrid>
		</Card>
	);
}
