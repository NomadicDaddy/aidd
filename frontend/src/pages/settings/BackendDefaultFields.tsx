import type { BackendDefaultSettings, BackendName, ReasoningEffort } from '../../api/types.ts';

import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { selectClass } from '../../lib/formStyles.ts';
import { nullableNumber, nullableText, numberValue, textValue } from './settingsUtils.ts';

const modelPlaceholders: Record<BackendName, string> = {
	'claude-code': 'e.g., claude-opus-5',
	cline: 'e.g., claude-opus-5',
	codex: 'e.g., gpt-5.6-sol',
	grok: 'e.g., grok-4.5',
	// kilocode and opencode reject a bare model name — they resolve `provider/model` and fail
	// with ProviderModelNotFoundError otherwise, so their placeholders must teach that shape.
	kilocode: 'e.g., anthropic/claude-opus-5',
	lmstudio: 'e.g., openai/gpt-oss-20b',
	native: 'e.g., claude-opus-5',
	ollama: 'e.g., llama3.1',
	openai: 'e.g., gpt-5.6-sol',
	opencode: 'e.g., openai/gpt-5.6-sol',
};
const reasoningOptions: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export function BackendDefaultFields({
	backend,
	defaults,
	setBackendDefault,
	shadowedSharedModel,
	showLabels = false,
}: {
	backend: BackendName;
	defaults: BackendDefaultSettings;
	setBackendDefault: (
		backend: BackendName,
		key: keyof BackendDefaultSettings,
		value: null | number | string,
	) => void;
	shadowedSharedModel?: null | string;
	showLabels?: boolean;
}) {
	return (
		<>
			<FieldRow className="min-w-0" label="Model" labelHidden={!showLabels}>
				<Input
					aria-label={`${backend} model`}
					onChange={(event) =>
						setBackendDefault(backend, 'model', nullableText(event.target.value))
					}
					placeholder={modelPlaceholders[backend]}
					value={textValue(defaults.model)}
				/>
				{shadowedSharedModel ? (
					<p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
						Outranks the shared Default Model (“{shadowedSharedModel}”) for {backend}{' '}
						launches — clear this to use the shared default.
					</p>
				) : null}
			</FieldRow>
			<FieldRow className="min-w-0" label="Reasoning" labelHidden={!showLabels}>
				<select
					aria-label={`${backend} reasoning effort`}
					className={`${selectClass} w-full`}
					onChange={(event) =>
						setBackendDefault(backend, 'reasoningEffort', event.target.value || null)
					}
					value={defaults.reasoningEffort ?? ''}>
					<option value="">Shared default</option>
					{reasoningOptions.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
			</FieldRow>
			<FieldRow className="min-w-0" label="Idle timeout" labelHidden={!showLabels}>
				<Input
					aria-label={`${backend} idle timeout`}
					inputMode="numeric"
					onChange={(event) =>
						setBackendDefault(
							backend,
							'idleTimeoutSeconds',
							nullableNumber(event.target.value),
						)
					}
					placeholder="e.g., 300"
					value={numberValue(defaults.idleTimeoutSeconds)}
				/>
			</FieldRow>
			<FieldRow className="min-w-0" label="Idle nudge timeout" labelHidden={!showLabels}>
				<Input
					aria-label={`${backend} idle nudge timeout`}
					inputMode="numeric"
					onChange={(event) =>
						setBackendDefault(
							backend,
							'idleNudgeTimeoutSeconds',
							nullableNumber(event.target.value),
						)
					}
					placeholder="e.g., 120"
					value={numberValue(defaults.idleNudgeTimeoutSeconds)}
				/>
			</FieldRow>
		</>
	);
}
