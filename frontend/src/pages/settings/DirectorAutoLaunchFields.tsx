import type { WebConfigSettings } from '../../api/types.ts';

import { CardHeader } from '../../components/ui/card.tsx';
import { FieldCheckbox, FieldRow, FormGrid } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { selectClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { compactFieldMeasureClass } from '../../lib/typography.ts';
import { ListEditor } from './ListEditor.tsx';

type RiskCeiling = WebConfigSettings['directorAutoLaunchRiskCeiling'];

type SetSettingsField = <K extends keyof WebConfigSettings>(
	key: K,
	value: WebConfigSettings[K],
) => void;

// Named by what they admit rather than by the level itself. A ceiling is read as "how far down the
// list am I letting this go", and "HIGH" on its own reads as the opposite of what selecting it does.
const riskOptions: { label: string; value: RiskCeiling }[] = [
	{ label: 'Low risk only', value: 'LOW' },
	{ label: 'Low and medium risk', value: 'MEDIUM' },
	{ label: 'Any risk level', value: 'HIGH' },
];

function asRiskCeiling(value: string): RiskCeiling {
	return value === 'HIGH' || value === 'MEDIUM' ? value : 'LOW';
}

// A bound that is not a positive whole number is not a looser bound, it is no bound at all, so it
// is called out at the field instead of being quietly clamped on save.
function invalidCount(value: number): boolean {
	return !Number.isFinite(value) || value < 1;
}

// The same complaint the count fields make, for the same reason: a blank row is not a wider
// allow-list, it is a name no recipe will ever match, so it is called out at the field rather than
// dropped quietly on save.
function blankRecipe(item: string): null | string {
	return item.trim() === '' ? 'Enter a recipe name or remove this entry.' : null;
}

function countField(
	setField: SetSettingsField,
	key: 'directorAutoLaunchMaxPerCycle' | 'directorAutoLaunchMaxRank',
): (event: { target: { value: string } }) => void {
	return (event) => {
		const parsed = Number(event.target.value);
		setField(key, Number.isFinite(parsed) ? parsed : 0);
	};
}

/**
 * The controls for the one Director trigger that starts work with nobody watching.
 *
 * Its own file rather than a fourth block inside the cycles card, because the four fields are one
 * decision and the sentence that has to accompany them is longer than every other description on
 * the page. The copy says plainly what switching it on permits: the bounds beside it are the whole
 * of what holds it back, and an operator who is going to leave the machine alone deserves to read
 * that in one place instead of inferring it from four field labels.
 */
export function DirectorAutoLaunchFields({
	form,
	setField,
}: {
	form: WebConfigSettings;
	setField: SetSettingsField;
}) {
	const enabled = form.directorAutoLaunchEnabled;
	const maxPerCycleInvalid = invalidCount(form.directorAutoLaunchMaxPerCycle);
	const maxRankInvalid = invalidCount(form.directorAutoLaunchMaxRank);

	return (
		<div className="mt-6 border-t border-border pt-4">
			<CardHeader
				className="mb-0"
				description="Off by default. With it on, a scheduled Director cycle starts the work it just proposed as soon as the cycle finishes: nobody clicks Launch, and nothing waits for someone to be at the machine. The bounds below are the whole of what holds it back."
				headingLevel={3}
				level="subsection"
				title="Suggestion Auto-Launch"
			/>
			<FieldCheckbox
				checked={enabled}
				className="mt-4"
				description="Only cycles the schedule started can launch anything; a cycle you run yourself from the Director page never does. A suggestion is skipped when it names a recipe that is not on the list below, and so is any project already busy — a run in flight, or a pipeline session between its steps — or one that carries more uncommitted changes than the dirty-tree threshold allows, or has a working tree that could not be read at all."
				label="Let a scheduled Director cycle launch its own suggestions"
				onChange={(event) => setField('directorAutoLaunchEnabled', event.target.checked)}
				tone="amber"
			/>
			<FormGrid className="mt-4 gap-4 @min-[32rem]:grid-cols-2">
				<FieldRow
					hint={
						maxPerCycleInvalid ? (
							<span className={toneText.amber}>Enter a positive number of runs.</span>
						) : (
							'How many runs or sessions one cycle may start. The rest stay on the Suggestions list.'
						)
					}
					label="Max per cycle">
					<Input
						disabled={!enabled}
						inputMode="numeric"
						onChange={countField(setField, 'directorAutoLaunchMaxPerCycle')}
						placeholder="1"
						value={String(form.directorAutoLaunchMaxPerCycle)}
					/>
				</FieldRow>
				<FieldRow
					hint={
						maxRankInvalid ? (
							<span className={toneText.amber}>Enter a positive rank.</span>
						) : (
							'Only suggestions ranked this high or better are eligible. 1 is the top.'
						)
					}
					label="Rank cutoff">
					<Input
						disabled={!enabled}
						inputMode="numeric"
						onChange={countField(setField, 'directorAutoLaunchMaxRank')}
						placeholder="1"
						value={String(form.directorAutoLaunchMaxRank)}
					/>
				</FieldRow>
				<FieldRow
					hint="Anything the Director rated above this is left for a person to start."
					label="Risk ceiling">
					<select
						className={selectClass}
						disabled={!enabled}
						onChange={(event) =>
							setField(
								'directorAutoLaunchRiskCeiling',
								asRiskCeiling(event.target.value),
							)
						}
						value={form.directorAutoLaunchRiskCeiling}>
						{riskOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</FieldRow>
			</FormGrid>
			<fieldset className="mt-4" disabled={!enabled}>
				<ListEditor
					compactGrid
					hint="Recipe names the Director may start on its own. A suggestion naming any other recipe is left for a person, which is also what makes a recipe name the model invented harmless. Empty keeps auto-launch to plain runs."
					inputClassName={compactFieldMeasureClass}
					items={form.directorAutoLaunchAllowedRecipes}
					label="Recipes it may start"
					onChange={(items) => setField('directorAutoLaunchAllowedRecipes', items)}
					placeholder="Recipe name"
					validateItem={blankRecipe}
				/>
			</fieldset>
		</div>
	);
}
