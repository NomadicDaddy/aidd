import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';

import { Button, IconButton } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { cn } from '../../lib/cn.ts';
import { fieldLabelClass } from '../../lib/formStyles.ts';
import { describeListEntry } from './settingsUtils.ts';

export function ListEditor({
	compactGrid = false,
	items,
	label,
	onChange,
	placeholder,
	validateBlank = false,
}: {
	compactGrid?: boolean;
	items: string[];
	label: string;
	onChange: (items: string[]) => void;
	placeholder: string;
	validateBlank?: boolean;
}) {
	return (
		<div className="space-y-2">
			<div className={fieldLabelClass}>{label}</div>
			<div className={cn('grid gap-2', compactGrid && 'sm:grid-cols-2')}>
				{items.map((item, index) => {
					const isBlank = validateBlank && item.trim() === '';
					const errorId = `${label}-entry-${index}-error`;
					return (
						<div className="space-y-1" key={index}>
							<div className="flex gap-2">
								<Input
									aria-describedby={isBlank ? errorId : undefined}
									aria-invalid={isBlank || undefined}
									aria-label={`${label} entry ${index + 1}`}
									className={
										isBlank
											? 'border-red-400 focus-visible:ring-red-400 dark:border-red-500'
											: undefined
									}
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
									disabled={items.length <= 1}
									onClick={() =>
										onChange(
											items.filter((_, itemIndex) => itemIndex !== index)
										)
									}
									variant="ghost">
									<Trash2 className="h-4 w-4" />
								</IconButton>
							</div>
							{isBlank ? (
								<p
									className="text-xs text-red-600 dark:text-red-400"
									id={errorId}
									role="alert">
									Enter a folder name or remove this entry.
								</p>
							) : null}
						</div>
					);
				})}
			</div>
			<Button
				aria-label={`Add ${label} entry`}
				onClick={() => onChange([...items, ''])}
				size="compact"
				variant="secondary">
				<Plus aria-hidden="true" className="h-4 w-4" />
				Add
			</Button>
		</div>
	);
}
