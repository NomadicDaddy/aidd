import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { type CSSProperties, type ReactNode, useId } from 'react';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { Button, IconButton } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { cn } from '../../lib/cn.ts';
import { fieldErrorClass } from '../../lib/formStyles.ts';
import { sectionCaptionClass } from '../../lib/typography.ts';
import { describeListEntry } from './settingsUtils.ts';

export function ListEditor({
	compactGrid = false,
	hint,
	inputClassName,
	items,
	label,
	labelHidden = false,
	minimumItems = 0,
	onChange,
	placeholder,
	validateBlank = false,
	validateItem,
}: {
	compactGrid?: boolean;
	hint?: ReactNode;
	inputClassName?: string;
	items: string[];
	label: string;
	/** Keeps `label` for the per-entry aria-labels while the card title already names the list. */
	labelHidden?: boolean;
	minimumItems?: number;
	onChange: (items: string[]) => void;
	placeholder: string;
	validateBlank?: boolean;
	validateItem?: (item: string) => null | string;
}) {
	const descriptionId = useId();
	const entryIdPrefix = useId();
	const labelId = useId();
	const compactGridStyle = compactGrid
		? ({ '--list-editor-row-count': Math.ceil(items.length / 2) } as CSSProperties)
		: undefined;
	const addButton = (
		<Button
			aria-label={`Add ${label} entry`}
			onClick={() => onChange([...items, ''])}
			size="compact"
			variant="secondary">
			<Plus aria-hidden="true" className="h-4 w-4" />
			Add
		</Button>
	);
	return (
		<div
			aria-describedby={hint ? descriptionId : undefined}
			aria-labelledby={labelId}
			className="space-y-2"
			role="group">
			<div className={cn(sectionCaptionClass, labelHidden && 'sr-only')} id={labelId}>
				{label}
			</div>
			{items.length === 0 ? (
				<EmptyState action={addButton}>No entries configured.</EmptyState>
			) : (
				<>
					<div
						className={cn(
							'grid gap-2',
							compactGrid && '@min-[45rem]:grid-cols-2',
							compactGrid &&
								'@min-[45rem]:grid-flow-col @min-[45rem]:grid-rows-[repeat(var(--list-editor-row-count),auto)]',
						)}
						style={compactGridStyle}>
						{items.map((item, index) => {
							const error =
								validateItem?.(item) ??
								(validateBlank && item.trim() === ''
									? 'Enter a folder name or remove this entry.'
									: null);
							const errorId = `${entryIdPrefix}-entry-${index}-error`;
							const removeDisabled = items.length <= minimumItems;
							return (
								<div className="min-w-0 space-y-1" key={index}>
									<div className="flex min-w-0 gap-2">
										<Input
											aria-describedby={error ? errorId : undefined}
											aria-invalid={Boolean(error) || undefined}
											aria-label={`${label} entry ${index + 1}`}
											className={inputClassName}
											// No skin here: `aria-invalid` above is what paints it, through
											// the variant every other control shares. This one reached for
											// a region-weight border and its own focus ring, so a blank
											// entry looked unlike every other invalid field in Settings.
											onChange={(event) => {
												const next = [...items];
												next[index] = event.target.value;
												onChange(next);
											}}
											placeholder={placeholder}
											value={item}
										/>
										<IconButton
											ariaLabel={`Remove ${describeListEntry(label, item, index)}`}
											disabled={removeDisabled}
											onClick={() =>
												onChange(
													items.filter(
														(_, itemIndex) => itemIndex !== index,
													),
												)
											}
											title={
												removeDisabled
													? `${label} requires at least ${minimumItems} ${minimumItems === 1 ? 'entry' : 'entries'}.`
													: undefined
											}
											variant="ghost">
											<Trash2 className="h-4 w-4" />
										</IconButton>
									</div>
									{error ? (
										<p className={fieldErrorClass} id={errorId} role="alert">
											{error}
										</p>
									) : null}
								</div>
							);
						})}
					</div>
					{addButton}
				</>
			)}
			{hint ? (
				<p className="text-xs text-muted-foreground" id={descriptionId}>
					{hint}
				</p>
			) : null}
		</div>
	);
}
