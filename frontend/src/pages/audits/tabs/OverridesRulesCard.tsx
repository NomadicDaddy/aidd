import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { FieldRow } from '../../../components/ui/field.tsx';
import { monoTextareaClass } from '../../../lib/formStyles.ts';
import { monoEditorMeasureCardClass } from '../../../lib/typography.ts';

/** The project-scoped rules escape hatch: raw JSON layered above the global mapping. */
export function OverridesRulesCard({
	error,
	onChange,
	value,
}: {
	error: null | string;
	onChange: (value: string) => void;
	value: string;
}) {
	return (
		<Card className={`flex flex-col gap-3 ${monoEditorMeasureCardClass}`}>
			<CardHeader
				className="mb-0"
				description="Optional rules layered above the global mapping. JSON array matching the global rule schema."
				title="Project-scoped Rules"
			/>
			<FieldRow error={error} label="Project audit rules JSON" labelHidden>
				<textarea
					className={`${monoTextareaClass} min-h-[260px] font-mono text-xs`}
					onChange={(event) => onChange(event.target.value)}
					value={value}
				/>
			</FieldRow>
		</Card>
	);
}
