import type { ReactNode } from 'react';

import { Card } from '../../../components/ui/card.tsx';
import { FieldRow } from '../../../components/ui/field.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { formGridMeasureClass, textareaClass } from '../../../lib/formStyles.ts';

/**
 * The recipe's own three fields: what it is called, what it is called by the machine, and what it
 * does. Lifted out of `RecipeEditMode` for the same reason `RecipeParametersCard` was — that file
 * owns four cards and sits against the 300-line ceiling — and, like that one, it takes its slice of
 * the form state and nothing else.
 *
 * `setId` doubles as the create/edit signal: only the create page can name a recipe, so its presence
 * is what says there are three fields here rather than two.
 */
export function RecipeMetadataCard({
	description,
	id,
	idError,
	idHint,
	name,
	nameReadOnly,
	setDescription,
	setId,
	setName,
}: {
	description: string;
	id: string;
	// Spelled with the explicit `| undefined` because `exactOptionalPropertyTypes` is on and both of
	// these are forwarded straight through from an optional prop one level up.
	idError?: null | string | undefined;
	idHint?: ReactNode;
	name: string;
	nameReadOnly: boolean;
	setDescription: (value: string) => void;
	setId?: ((value: string) => void) | undefined;
	setName: (value: string) => void;
}) {
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
			className={`grid gap-3 ${formGridMeasureClass} ${setId ? '@min-[61rem]:grid-cols-[minmax(0,16rem)_minmax(0,20rem)_1fr]' : '@min-[45rem]:grid-cols-[minmax(0,20rem)_1fr]'}`}>
			{/* Both of these block Save, and neither said so until Save was pressed. The id
			    additionally showed a red message beside a control still rendering the ordinary grey
			    border, which read as a note about the field rather than a fault in it. */}
			{setId && (
				<FieldRow error={idError} hint={idHint} label="Id" required>
					{/* The one field on this form whose value is a slug rather than prose — it is
					    what the grid, the telemetry rows and the URL all render in mono, so it is
					    typed in mono too. */}
					<Input
						className="font-mono"
						onChange={(event) => setId(event.target.value)}
						placeholder="my-recipe"
						value={id}
					/>
				</FieldRow>
			)}
			<FieldRow
				hint={
					nameReadOnly
						? 'System recipe names are reserved and cannot be changed.'
						: undefined
				}
				label="Name"
				required={!nameReadOnly}>
				<Input
					disabled={nameReadOnly}
					onChange={(event) => setName(event.target.value)}
					value={name}
				/>
			</FieldRow>
			<FieldRow label="Description">
				{/* A textarea, not an `Input`. This is the one field on the form that holds a
				    sentence, and a single-line input showed about forty characters of it with the
				    rest scrolled off to the right — the same description the overview renders as two
				    wrapped lines. `textareaClass` is the shared control, so the border, the focus
				    ring and the invalid state match the inputs beside it. */}
				<textarea
					className={textareaClass}
					onChange={(event) => setDescription(event.target.value)}
					value={description}
				/>
			</FieldRow>
		</Card>
	);
}
