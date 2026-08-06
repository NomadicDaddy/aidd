import type { Dispatch, SetStateAction } from 'react';

import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';

import type { RecipeParameterDefinition } from '../../../api/types.ts';

import { Button, IconButton } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import { dangerRowActionClass } from '../../../lib/tones.ts';

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
		<Card className="space-y-3">
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
				{/* One header row for the whole list instead of a placeholder in every input:
				    placeholders vanish the moment a row is filled, so a populated table had
				    three unlabelled columns. Hidden below `lg`, where the rows stack and each
				    input carries its own `aria-label` for both the reader and the screen. */}
				{parameters.length > 0 && (
					<div className="hidden gap-3 lg:grid lg:grid-cols-[1fr_2fr_1fr_auto]">
						<span className={fieldLabelClass}>Name</span>
						<span className={fieldLabelClass}>Description</span>
						<span className={fieldLabelClass}>Default</span>
						{/* Spacer over the remove button column. */}
						<span className="w-9" />
					</div>
				)}
				{parameters.map((parameter, index) => (
					// `lg` rather than `md`: four columns inside a card at 768px gave the name
					// field about eight characters of usable width.
					<div className="grid gap-3 lg:grid-cols-[1fr_2fr_1fr_auto]" key={index}>
						<Input
							aria-label={`Parameter ${index + 1} name`}
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
						<Input
							aria-label={`Parameter ${index + 1} description`}
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
						<Input
							aria-label={`Parameter ${index + 1} default value`}
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
