import type { Dispatch, SetStateAction } from 'react';

import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';

import type { RecipeParameterDefinition } from '../../../api/types.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { Button, IconButton } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { FieldRow } from '../../../components/ui/field.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { fieldLabelClass, formGridMeasureClass } from '../../../lib/formStyles.ts';
import { dangerRowActionClass } from '../../../lib/tones.ts';

const parameterGridTracks = `${formGridMeasureClass} @min-[61rem]:grid-cols-[minmax(0,20rem)_minmax(0,36rem)_minmax(0,20rem)_auto]`;

/**
 * The recipe's parameter table. Lifted out of RecipeEditMode, which owns four cards and reached the
 * 300-line ceiling; this one is self-contained, taking the list and the setter and nothing else.
 */
export function RecipeParametersCard({
	parameters,
	setParameters,
}: {
	parameters: RecipeParameterDefinition[];
	setParameters: Dispatch<SetStateAction<RecipeParameterDefinition[]>>;
}) {
	return (
		// The card is the container the rows below are measured against, not the viewport. `lg:` is a
		// 1024px viewport, which is a 736px content column with the rail expanded and a 704px card
		// interior — the four tracks went side by side there whether or not there was room for them.
		<Card className="@container flex flex-col gap-3">
			<CardHeader
				action={
					<Button
						onClick={() =>
							setParameters((current) => [...current, { description: '', name: '' }])
						}>
						<Plus className="h-4 w-4" />
						Add
					</Button>
				}
				className="mb-0"
				title="Parameters"
			/>
			<div className="grid gap-3">
				{parameters.length === 0 ? (
					<EmptyState>
						No parameters yet. Add one to make this recipe reusable.
					</EmptyState>
				) : null}
				{/* One header row for the whole list instead of a placeholder in every input:
				    placeholders vanish the moment a row is filled, so a populated table had
				    three unlabelled columns. Hidden below the 4-up step, where the rows stack and
				    each input carries its own `aria-label` for both the reader and the screen. */}
				{parameters.length > 0 && (
					<div className={`hidden gap-3 @min-[61rem]:grid ${parameterGridTracks}`}>
						<span className={fieldLabelClass}>Name</span>
						<span className={fieldLabelClass}>Description</span>
						<span className={fieldLabelClass}>Default</span>
						{/* Spacer over the remove button column. */}
						<span className="w-9" />
					</div>
				)}
				{parameters.map((parameter, index) => (
					// `61rem` of card interior before the row goes 4-up: below that the 1fr name
					// track is under 200px, which is where a parameter name starts scrolling
					// inside its own field. Stacked rows read fine and each input is labelled.
					<div className={`grid gap-3 ${parameterGridTracks}`} key={index}>
						<FieldRow label={`Parameter ${index + 1} name`} labelHidden>
							<Input
								onChange={(event) =>
									setParameters((current) =>
										current.map((entry, entryIndex) =>
											entryIndex === index
												? { ...entry, name: event.target.value }
												: entry,
										),
									)
								}
								placeholder="name"
								value={parameter.name}
							/>
						</FieldRow>
						<FieldRow label={`Parameter ${index + 1} description`} labelHidden>
							<Input
								onChange={(event) =>
									setParameters((current) =>
										current.map((entry, entryIndex) =>
											entryIndex === index
												? { ...entry, description: event.target.value }
												: entry,
										),
									)
								}
								placeholder="description"
								value={parameter.description ?? ''}
							/>
						</FieldRow>
						<FieldRow label={`Parameter ${index + 1} default value`} labelHidden>
							<Input
								onChange={(event) =>
									setParameters((current) =>
										current.map((entry, entryIndex) =>
											entryIndex === index
												? { ...entry, defaultValue: event.target.value }
												: entry,
										),
									)
								}
								placeholder="default"
								value={parameter.defaultValue ?? ''}
							/>
						</FieldRow>
						{/* Same treatment as the step delete, and now literally the same class:
						    removing one row of a list is not the destructive climax of the
						    form, so it stays quiet until hover. */}
						<IconButton
							ariaLabel={`Remove parameter ${index + 1}`}
							className={dangerRowActionClass}
							onClick={() =>
								setParameters((current) =>
									current.filter((_, entryIndex) => entryIndex !== index),
								)
							}
							variant="ghost">
							<Trash2 className="h-4 w-4" />
						</IconButton>
					</div>
				))}
			</div>
		</Card>
	);
}
