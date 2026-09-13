import type { BackendDefaultSettings, BackendName, ReasoningEffort } from '../../api/types.ts';

import { NumberStepper } from '../../components/shared/NumberStepper.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { backendLabel } from '../../lib/backends.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { nullableNumber, nullableText, numberValue, textValue } from './settingsUtils.ts';

const modelPlaceholders: Record<BackendName, string> = {
	'claude-code': 'e.g., claude-fable-5-1',
	cline: 'e.g., claude-fable-5-1',
	codex: 'e.g., gpt-6-astra',
	grok: 'e.g., grok-4.6',
	// kilocode and opencode reject a bare model name — they resolve `provider/model` and fail
	// with ProviderModelNotFoundError otherwise, so their placeholders must teach that shape.
	kilocode: 'e.g., anthropic/claude-fable-5-1',
	lmstudio: 'e.g., openai/gpt-oss-20b',
	native: 'e.g., glm-5.3',
	ollama: 'e.g., llama3.1',
	openai: 'e.g., gpt-6-astra',
	opencode: 'e.g., openai/gpt-6-astra',
};
const reasoningOptions: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

/**
 * The four per-backend default controls.
 *
 * `layout="cells"` emits each control as its own `<td>` so the browser's table algorithm aligns
 * them under the matching `<th>`. One `<td colSpan={4}>` holding a private `grid-cols-4` would lay
 * the two grids out independently — every header sitting 60-80px left of the control it names.
 */
export function BackendDefaultFields({
	backend,
	defaults,
	layout = 'stacked',
	setBackendDefault,
	shadowedSharedModel,
	sharedIdleNudgeTimeoutSeconds,
	sharedIdleTimeoutSeconds,
	showLabels = false,
}: {
	backend: BackendName;
	defaults: BackendDefaultSettings;
	layout?: 'cells' | 'stacked';
	setBackendDefault: (
		backend: BackendName,
		key: keyof BackendDefaultSettings,
		value: null | number | string,
	) => void;
	shadowedSharedModel?: null | string;
	sharedIdleNudgeTimeoutSeconds?: null | number;
	sharedIdleTimeoutSeconds?: null | number;
	showLabels?: boolean;
}) {
	const Cell = layout === 'cells' ? 'td' : 'div';
	const cellClass = layout === 'cells' ? 'px-3 py-2 align-top' : 'min-w-0';
	const idleTimeoutPlaceholder = `Shared default (${sharedIdleTimeoutSeconds ?? 900})`;
	const idleNudgeTimeoutPlaceholder = `Shared default (${sharedIdleNudgeTimeoutSeconds ?? 600})`;
	const cliLabel = backendLabel(backend);
	return (
		<>
			<Cell className={cellClass}>
				<FieldRow
					className="min-w-0"
					hint={
						shadowedSharedModel ? (
							<span className={toneText.amber}>
								Outranks the shared Default Model (“{shadowedSharedModel}”) for{' '}
								{cliLabel} launches — clear this to use the shared default.
							</span>
						) : undefined
					}
					label="Model"
					labelHidden={!showLabels}>
					<Input
						aria-label={`${cliLabel} model`}
						className="font-mono"
						onChange={(event) =>
							setBackendDefault(backend, 'model', nullableText(event.target.value))
						}
						placeholder={modelPlaceholders[backend]}
						value={textValue(defaults.model)}
					/>
				</FieldRow>
			</Cell>
			<Cell className={cellClass}>
				<FieldRow className="min-w-0" label="Reasoning" labelHidden={!showLabels}>
					<select
						aria-label={`${cliLabel} reasoning effort`}
						className={`${selectClass} w-full`}
						onChange={(event) =>
							setBackendDefault(
								backend,
								'reasoningEffort',
								event.target.value || null,
							)
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
			</Cell>
			<Cell className={cellClass}>
				<FieldRow
					className="min-w-0"
					hint={
						defaults.idleTimeoutSeconds === null ? 'Shared default' : 'Local override'
					}
					label="Idle timeout (seconds)"
					labelHidden={!showLabels}>
					<NumberStepper
						label={`${cliLabel} idle timeout`}
						min={0}
						name={`${backend}-idle-timeout`}
						onChange={(value) =>
							setBackendDefault(backend, 'idleTimeoutSeconds', nullableNumber(value))
						}
						placeholder={idleTimeoutPlaceholder}
						value={numberValue(defaults.idleTimeoutSeconds)}
					/>
				</FieldRow>
			</Cell>
			<Cell className={cellClass}>
				<FieldRow
					className="min-w-0"
					hint={
						defaults.idleNudgeTimeoutSeconds === null
							? 'Shared default'
							: 'Local override'
					}
					label="Idle nudge timeout (seconds)"
					labelHidden={!showLabels}>
					<NumberStepper
						label={`${cliLabel} idle nudge timeout`}
						min={0}
						name={`${backend}-idle-nudge-timeout`}
						onChange={(value) =>
							setBackendDefault(
								backend,
								'idleNudgeTimeoutSeconds',
								nullableNumber(value),
							)
						}
						placeholder={idleNudgeTimeoutPlaceholder}
						value={numberValue(defaults.idleNudgeTimeoutSeconds)}
					/>
				</FieldRow>
			</Cell>
		</>
	);
}
