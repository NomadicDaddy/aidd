import type { ReactNode } from 'react';

import { Card } from '../../../components/ui/card.tsx';
import { FieldRow } from '../../../components/ui/field.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { formGridMeasureClass, textareaClass } from '../../../lib/formStyles.ts';
import { useRecipeEditor } from './recipeEditorContext.ts';

/**
 * The recipe's own fields: what it is called, what it is called by the machine, and what it does.
 * Lifted out of `RecipeEditMode` for the same reason `RecipeParametersCard` was — that file owns
 * four cards and sits against the 300-line ceiling.
 *
 * The card is only the grid. The variant that composes it passes the fields it has and says how
 * many columns they make, so the layout follows what the editor is rather than which callbacks
 * happened to be passed.
 */
export function RecipeMetadataCard({ children, columns }: { children: ReactNode; columns: 2 | 3 }) {
	return (
		// Weighted tracks, not equal ones. Three `1fr` columns gave a slug field, a name and a
		// description 635px each at 2250px, which is several times what an id will ever hold and
		// still the tightest of the three for the one field that takes a sentence. The `minmax(0,…)`
		// floors keep the first two from being squeezed below their content.
		//
		// Measured against the page's container, not the viewport: `lg:` is a 1024px viewport, which
		// is a 736px content column with the rail expanded, and the three tracks went side by side
		// there whether or not there was room. `45rem` is the content-width step where two of these
		// still read; `61rem` is where three do.
		<Card
			className={`grid gap-3 ${formGridMeasureClass} ${columns === 3 ? '@min-[61rem]:grid-cols-[minmax(0,16rem)_minmax(0,20rem)_1fr]' : '@min-[45rem]:grid-cols-[minmax(0,20rem)_1fr]'}`}>
			{children}
		</Card>
	);
}

/**
 * Only a new recipe has an id to type. Both it and the name block Save, and neither said so until
 * Save was pressed. The id additionally showed a red message beside a control still rendering the
 * ordinary grey border, which read as a note about the field rather than a fault in it.
 */
export function RecipeIdField({
	error,
	hint,
	onChange,
	value,
}: {
	error: null | string;
	hint: ReactNode;
	onChange: (value: string) => void;
	value: string;
}) {
	return (
		<FieldRow error={error} hint={hint} label="Id" required>
			{/* The one field on this form whose value is a slug rather than prose — it is what the
			    grid, the telemetry rows and the URL all render in mono, so it is typed in mono too. */}
			<Input
				className="font-mono"
				onChange={(event) => onChange(event.target.value)}
				placeholder="my-recipe"
				value={value}
			/>
		</FieldRow>
	);
}

export function RecipeNameField() {
	const { actions, state } = useRecipeEditor();
	return (
		<FieldRow label="Name" required>
			<Input onChange={(event) => actions.setName(event.target.value)} value={state.name} />
		</FieldRow>
	);
}

/** A system recipe's name is reserved: shown, never edited, and so never required of the operator. */
export function LockedRecipeNameField() {
	const { state } = useRecipeEditor();
	return (
		<FieldRow hint="System recipe names are reserved and cannot be changed." label="Name">
			<Input disabled readOnly value={state.name} />
		</FieldRow>
	);
}

export function RecipeDescriptionField() {
	const { actions, state } = useRecipeEditor();
	return (
		<FieldRow label="Description">
			{/* A textarea, not an `Input`. This is the one field on the form that holds a sentence,
			    and a single-line input showed about forty characters of it with the rest scrolled
			    off to the right — the same description the overview renders as two wrapped lines.
			    `textareaClass` is the shared control, so the border, the focus ring and the invalid
			    state match the inputs beside it. */}
			<textarea
				className={textareaClass}
				onChange={(event) => actions.setDescription(event.target.value)}
				value={state.description}
			/>
		</FieldRow>
	);
}
