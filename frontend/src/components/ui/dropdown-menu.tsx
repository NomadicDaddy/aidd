/* eslint-disable react-hooks/refs */
import type { ReactElement, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '../../lib/cn.ts';

interface DropdownMenuItemProps {
	className?: string;
	'data-tone'?: 'danger' | 'neutral';
	disabled?: boolean;
	icon?: ReactNode;
	label: ReactNode;
	onSelect: () => void;
}

interface DropdownMenuProps {
	align?: 'end' | 'start';
	className?: string;
	items: DropdownMenuItemProps[];
	trigger: (props: {
		'aria-expanded': boolean;
		'aria-haspopup': 'menu';
		id: string;
		onClick: () => void;
		onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
		ref: (node: HTMLElement | null) => void;
	}) => ReactElement;
}

const toneClass = {
	danger: 'text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 dark:focus:bg-red-950/40',
	neutral:
		'text-neutral-700 hover:bg-neutral-50 focus:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:focus:bg-neutral-900',
};

export function DropdownMenu({ align = 'end', className, items, trigger }: DropdownMenuProps) {
	const triggerId = useId();
	const menuId = useId();
	const triggerRef = useRef<HTMLElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);

	function close(restoreFocus = true): void {
		setOpen(false);
		if (restoreFocus) triggerRef.current?.focus();
	}

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (
				target &&
				!menuRef.current?.contains(target) &&
				!triggerRef.current?.contains(target)
			) {
				setOpen(false);
			}
		};
		document.addEventListener('pointerdown', onPointerDown);
		return () => document.removeEventListener('pointerdown', onPointerDown);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const target = itemRefs.current[activeIndex];
		target?.focus();
	}, [open, activeIndex]);

	const focusableItems = items
		.map((item, index) => ({ index, item }))
		.filter(({ item }) => !item.disabled);
	const firstEnabledIndex = focusableItems[0]?.index ?? 0;
	const lastEnabledIndex = focusableItems[focusableItems.length - 1]?.index ?? 0;

	function moveActive(direction: -1 | 1): void {
		if (focusableItems.length === 0) return;
		const ordered = direction === 1 ? focusableItems : [...focusableItems].reverse();
		const currentPos = ordered.findIndex(({ index }) => index === activeIndex);
		const nextPos = currentPos === -1 ? 0 : (currentPos + 1) % ordered.length;
		const next = ordered[nextPos];
		if (next) setActiveIndex(next.index);
	}

	function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
		if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			setActiveIndex(firstEnabledIndex);
			setOpen(true);
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			setActiveIndex(lastEnabledIndex);
			setOpen(true);
		}
	}

	function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			moveActive(1);
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			moveActive(-1);
			return;
		}
		if (event.key === 'Home') {
			event.preventDefault();
			setActiveIndex(firstEnabledIndex);
			return;
		}
		if (event.key === 'End') {
			event.preventDefault();
			setActiveIndex(lastEnabledIndex);
			return;
		}
		if (event.key === 'Tab') {
			close(false);
		}
	}

	return (
		<div className={cn('relative inline-flex', className)}>
			{trigger({
				'aria-expanded': open,
				'aria-haspopup': 'menu',
				id: triggerId,
				onClick: () => {
					setActiveIndex(firstEnabledIndex);
					setOpen((value) => !value);
				},
				onKeyDown: onTriggerKeyDown,
				ref: (node) => {
					triggerRef.current = node;
				},
			})}
			{open && (
				<div
					aria-labelledby={triggerId}
					className={cn(
						'absolute top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-neutral-200 bg-white py-1 shadow-lg outline-none dark:border-neutral-800 dark:bg-neutral-950',
						align === 'end' ? 'right-0' : 'left-0',
					)}
					id={menuId}
					onKeyDown={onMenuKeyDown}
					ref={menuRef}
					role="menu">
					{items.map((item, index) => {
						const tone = item['data-tone'] ?? 'neutral';
						const isDisabled = item.disabled === true;
						return (
							<button
								className={cn(
									'flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none max-sm:min-h-11',
									'focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-inset',
									toneClass[tone],
									isDisabled && 'cursor-not-allowed opacity-60',
									item.className,
								)}
								disabled={isDisabled}
								key={index}
								onClick={() => {
									if (isDisabled) return;
									close();
									item.onSelect();
								}}
								ref={(node) => {
									itemRefs.current[index] = node;
								}}
								role="menuitem"
								tabIndex={-1}
								type="button">
								{item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
								<span className="flex-1">{item.label}</span>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
