import type { BackendDefaultSettings, BackendName, ReasoningEffort } from '../../api/types.ts';

import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { selectClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
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

/**
 * The four per-backend default controls.
 *
 * `layout="cells"` emits each control as its own `<td>` so the browser's table algorithm aligns
 * them under the matching `<th>`. They used to share one `<td colSpan={4}>` holding a private
 * `grid-cols-4`, and the two grids laid out independently — every header sat 60-80px left of the
 * control it named.
 */
export function BackendDefaultFields({
	backend,
	defaults,
	layout = 'stacked',
	setBackendDefault,
	shadowedSharedModel,
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
	showLabels?: boolean;
}) {
	const Cell = layout === 'cells' ? 'td' : 'div';
	const cellClass = layout === 'cells' ? 'px-3 py-2 align-top' : 'min-w-0';
	return (
		<>
			<Cell className={cellClass}>
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
						<p className={`mt-1 text-xs ${toneText.amber} ${proseMeasureClass}`}>
							Outranks the shared Default Model (“{shadowedSharedModel}”) for{' '}
							{backend} launches — clear this to use the shared default.
						</p>
					) : null}
				</FieldRow>
			</Cell>
			<Cell className={cellClass}>
				<FieldRow className="min-w-0" label="Reasoning" labelHidden={!showLabels}>
					<select
						aria-label={`${backend} reasoning effort`}
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
			</Cell>
			<Cell className={cellClass}>
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
			</Cell>
		</>
	);
}
