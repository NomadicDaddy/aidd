import { type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';

export interface ListBoxOption {
	/** What the row renders. Free-form, because a catalog row is more than a label. */
	content: ReactNode;
	id: string;
	/** Plain-text name for the row, used as the option's accessible name. */
	label: string;
}

export function listBoxOptionId(prefix: string, id: string): string {
	return `${prefix}-option-${id}`;
}

/**
 * Canonical single-select list primitive: `role="listbox"` with `role="option"` rows, one
 * `tabIndex 0` on the selection, and ArrowUp/ArrowDown/Home/End moving focus and selection together.
 *
 * The alternative — a plain div of `<button aria-pressed>` siblings — is what the skills rail was:
 * 76 focusables occupying positions 30 through 105 of that page's 110, so reaching the launch
 * button below the rail meant 76 Tab presses past rows a screen reader announced as unrelated
 * buttons rather than as one list with a current item.
 *
 * Selection follows focus, which is the standard single-select behaviour and is only appropriate
 * because choosing a row is cheap here — it swaps which already-loaded record the detail pane shows.
 * A list whose selection triggers a fetch wants the aria-activedescendant model instead.
 */
export function ListBox({
	ariaLabel,
	className,
	idPrefix,
	onSelect,
	optionClassName,
	options,
	selectedId,
}: {
	ariaLabel: string;
	className?: string;
	idPrefix: string;
	onSelect: (id: string) => void;
	/** Row classes, given whether the row is the current selection. */
	optionClassName: (selected: boolean) => string;
	options: ListBoxOption[];
	selectedId: null | string;
}) {
	const selectedIndex = options.findIndex((option) => option.id === selectedId);
	// With nothing selected the first row holds the tab stop, so the list is always reachable in
	// exactly one Tab and never swallows the stop entirely.
	const tabStopIndex = selectedIndex === -1 ? 0 : selectedIndex;

	function focusOption(index: number): void {
		const option = options[index];
		if (!option) return;
		onSelect(option.id);
		const node = document.getElementById(listBoxOptionId(idPrefix, option.id));
		if (!(node instanceof HTMLElement)) return;
		node.focus();
		// `block: 'nearest'` moves the rail by the least it can. A bare `focus()` scrolls every
		// scrollable ancestor, which yanks the page under someone arrowing down the list.
		node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>, index: number): void {
		let next: number | undefined;
		if (event.key === 'ArrowDown') next = Math.min(index + 1, options.length - 1);
		else if (event.key === 'ArrowUp') next = Math.max(index - 1, 0);
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = options.length - 1;
		// Unlike the tab strip, the ends do not wrap: a list of 76 is scanned, and jumping from the
		// last row back to the first reads as the rail having lost your place.
		if (next === undefined || next === index) return;
		event.preventDefault();
		focusOption(next);
	}

	return (
		<div aria-label={ariaLabel} className={className} role="listbox">
			{options.map((option, index) => {
				const selected = option.id === selectedId;
				return (
					<div
						aria-label={option.label}
						aria-selected={selected}
						className={cn(
							'cursor-default focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
							optionClassName(selected),
						)}
						id={listBoxOptionId(idPrefix, option.id)}
						key={option.id}
						onClick={() => onSelect(option.id)}
						onKeyDown={(event) => onKeyDown(event, index)}
						role="option"
						tabIndex={index === tabStopIndex ? 0 : -1}>
						{option.content}
					</div>
				);
			})}
		</div>
	);
}
