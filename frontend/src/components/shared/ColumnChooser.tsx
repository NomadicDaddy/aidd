import type { CSSProperties } from 'react';

import { default as Columns3 } from 'lucide-react/dist/esm/icons/columns-3';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '../ui/button.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { resolveColumnChooserPlacement } from './columnChooserPlacement.ts';

export interface ColumnChoice<Key extends string = string> {
	key: Key;
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
export function ColumnChooser<Key extends string>({
	isDefault,
	label = 'Optional columns',
	onReset,
	onToggle,
	options,
	resetLabel = 'Reset to defaults',
	selected,
}: {
	/** Whether the current selection already matches the consumer's default set. */
	isDefault?: boolean;
	/** Names the column group in both the trigger and disclosure. */
	label?: string;
	/** Restores the consumer's default column set. */
	onReset: () => void;
	onToggle: (key: Key) => void;
	options: readonly ColumnChoice<Key>[];
	resetLabel?: string;
	selected: ReadonlySet<Key>;
}) {
	const panelId = useId();
	const [open, setOpen] = useState(false);
	const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null);
	const panelRef = useRef<HTMLDivElement | null>(null);
	const triggerRef = useRef<HTMLDivElement | null>(null);
	const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
	const enabled = options.filter((option) => selected.has(option.key)).length;
	const atDefault = isDefault ?? enabled === 0;

	useLayoutEffect(() => {
		if (!open) return;

		const updatePlacement = () => {
			const panel = panelRef.current;
			const trigger = triggerRef.current;
			if (!panel || !trigger) return;

			const next = resolveColumnChooserPlacement(
				trigger.getBoundingClientRect(),
				panel.getBoundingClientRect(),
				{ height: window.innerHeight, width: window.innerWidth },
			);
			setPlacement((current) =>
				current?.left === next.left && current.top === next.top ? current : next,
			);
		};

		updatePlacement();
		const resizeObserver = new ResizeObserver(updatePlacement);
		if (panelRef.current) resizeObserver.observe(panelRef.current);
		if (triggerRef.current) resizeObserver.observe(triggerRef.current);
		window.addEventListener('resize', updatePlacement);
		window.addEventListener('scroll', updatePlacement, true);
		return () => {
			resizeObserver.disconnect();
			window.removeEventListener('resize', updatePlacement);
			window.removeEventListener('scroll', updatePlacement, true);
		};
	}, [open]);

	useEffect(() => {
		if (!open) return;

		const handlePointerDown = (event: PointerEvent) => {
			if (!(event.target instanceof Node)) return;
			if (
				panelRef.current?.contains(event.target) ||
				triggerRef.current?.contains(event.target)
			) {
				return;
			}
			setOpen(false);
			setPlacement(null);
		};
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			setOpen(false);
			setPlacement(null);
			triggerButtonRef.current?.focus();
		};

		document.addEventListener('pointerdown', handlePointerDown);
		window.addEventListener('keydown', handleEscape);
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown);
			window.removeEventListener('keydown', handleEscape);
		};
	}, [open]);

	const getPanelControls = () =>
		Array.from(
			panelRef.current?.querySelectorAll<HTMLElement>(
				'button:not([disabled]), input:not([disabled])',
			) ?? [],
		);
	const focusAfterTrigger = () => {
		const trigger = triggerButtonRef.current;
		const panel = panelRef.current;
		if (!trigger || !panel) return;

		const pageControls = Array.from(
			document.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
			),
		).filter((control) => !panel.contains(control) && control.getClientRects().length > 0);
		pageControls.at(pageControls.indexOf(trigger) + 1)?.focus();
	};
	const panelStyle: CSSProperties = placement
		? { left: placement.left, top: placement.top }
		: { left: 0, top: 0, visibility: 'hidden' };

	return (
		<div
			className="relative"
			onKeyDown={(event) => {
				if (event.key !== 'Tab' || !open) return;

				const panelControls = getPanelControls();
				const firstControl = panelControls.at(0);
				const lastControl = panelControls.at(-1);
				if (event.target === triggerButtonRef.current && !event.shiftKey && firstControl) {
					event.preventDefault();
					firstControl.focus();
				} else if (event.target === firstControl && event.shiftKey) {
					event.preventDefault();
					triggerButtonRef.current?.focus();
				} else if (event.target === lastControl && !event.shiftKey) {
					event.preventDefault();
					focusAfterTrigger();
				}
			}}
			ref={triggerRef}>
			<Button
				aria-controls={panelId}
				aria-expanded={open}
				onClick={() => {
					setPlacement(null);
					setOpen((current) => !current);
				}}
				ref={triggerButtonRef}
				size="compact"
				variant="secondary">
				<Columns3 aria-hidden="true" className="h-3.5 w-3.5" />
				{label}
				<span className="text-muted-foreground tabular-nums">
					{enabled}/{options.length}
				</span>
			</Button>
			{open && typeof document !== 'undefined'
				? createPortal(
						<div
							className="fixed z-50 max-h-[calc(100dvh-1rem)] w-64 overflow-y-auto rounded-md border border-control-border bg-card p-3 shadow-lg"
							id={panelId}
							ref={panelRef}
							style={panelStyle}>
							<fieldset>
								<legend className="mb-2 text-xs font-medium text-muted-foreground">
									{label}
								</legend>
								<div className="flex flex-col gap-1.5">
									{options.map((option) => (
										<label
											className="flex cursor-pointer items-center gap-2 text-sm text-foreground max-sm:min-h-11"
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
							{!atDefault ? (
								<Button
									className="mt-3 w-full"
									onClick={onReset}
									size="compact"
									variant="ghost">
									{resetLabel}
								</Button>
							) : null}
						</div>,
						document.body,
					)
				: null}
		</div>
	);
}
