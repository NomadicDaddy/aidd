import { default as Columns3 } from 'lucide-react/dist/esm/icons/columns-3';
import { useId, useState } from 'react';

import { Button } from '../ui/button.tsx';
import { Checkbox } from '../ui/checkbox.tsx';

export interface ColumnChoice {
	key: string;
	label: string;
}

/**
 * Disclosure for the optional columns of a wide table.
 *
 * A table that shows every column it has is unreadable once it outgrows its card; a table that
 * quietly drops columns is worse. This is the seam between the two — the default view carries the
 * load-bearing columns and this names the rest, so what is hidden is discoverable rather than
 * merely absent.
 *
 * Rendered as a plain disclosure rather than a menu: the choices are independent toggles that stay
 * useful while the table behind them reflows, so closing on each selection would be wrong.
 */
export function ColumnChooser({
	onReset,
	onToggle,
	options,
	selected,
}: {
	/** Restores the default column set. Hidden when nothing is enabled. */
	onReset: () => void;
	onToggle: (key: string) => void;
	options: readonly ColumnChoice[];
	selected: ReadonlySet<string>;
}) {
	const panelId = useId();
	const [open, setOpen] = useState(false);
	const enabled = options.filter((option) => selected.has(option.key)).length;

	return (
		<div
			className="relative"
			onKeyDown={(event) => {
				if (event.key === 'Escape' && open) {
					event.stopPropagation();
					setOpen(false);
				}
			}}>
			<Button
				aria-controls={panelId}
				aria-expanded={open}
				onClick={() => setOpen((current) => !current)}
				size="compact"
				variant="secondary">
				<Columns3 aria-hidden="true" className="h-3.5 w-3.5" />
				Columns
				<span className="text-muted-foreground tabular-nums">
					{enabled}/{options.length}
				</span>
			</Button>
			{open ? (
				<div
					className="absolute top-full right-0 z-30 mt-1 w-64 rounded-md border border-border bg-card p-3 shadow-lg"
					id={panelId}>
					<fieldset>
						<legend className="mb-2 text-xs font-medium text-muted-foreground">
							Optional columns
						</legend>
						<div className="flex flex-col gap-1.5">
							{options.map((option) => (
								<label
									className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
									key={option.key}>
									<Checkbox
										checked={selected.has(option.key)}
										onChange={() => onToggle(option.key)}
									/>
									{option.label}
								</label>
							))}
						</div>
					</fieldset>
					{enabled > 0 ? (
						<Button
							className="mt-3 w-full"
							onClick={onReset}
							size="compact"
							variant="ghost">
							Reset to defaults
						</Button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
