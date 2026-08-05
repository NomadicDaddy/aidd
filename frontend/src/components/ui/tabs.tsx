import { type ComponentType, type KeyboardEvent, type ReactNode } from 'react';

import { Button } from './button.tsx';

interface TabDefinition<T extends string> {
	/** Trailing status node, rendered after the label — an unsaved-changes dot, a count, a warning. */
	badge?: ReactNode;
	icon?: ComponentType<{ className?: string }>;
	id: T;
	label: string;
}

export function tabButtonId(prefix: string, id: string): string {
	return `${prefix}-tab-${id}`;
}

export function tabPanelId(prefix: string, id: string): string {
	return `${prefix}-panel-${id}`;
}

interface TabListProps<T extends string> {
	activeTab: T;
	ariaLabel: string;
	idPrefix: string;
	onChange: (id: T) => void;
	tabs: readonly TabDefinition<T>[];
}

/**
 * Canonical tablist primitive. Emits `role="tablist"` with roving `tabIndex`
 * and ArrowLeft/ArrowRight/Home/End navigation that moves focus across the
 * triggers; each trigger carries `role="tab"`, `aria-selected`, and
 * `aria-controls` pointing at its panel.
 */
export function TabList<T extends string>({
	activeTab,
	ariaLabel,
	idPrefix,
	onChange,
	tabs,
}: TabListProps<T>) {
	function focusTab(id: T) {
		onChange(id);
		const node = document.getElementById(tabButtonId(idPrefix, id));
		if (node instanceof HTMLElement) node.focus();
	}

	function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
		if (currentIndex === -1) return;
		const tabAt = (index: number): T | undefined =>
			tabs[((index % tabs.length) + tabs.length) % tabs.length]?.id;
		let nextId: T | undefined;
		if (event.key === 'ArrowRight') nextId = tabAt(currentIndex + 1);
		else if (event.key === 'ArrowLeft') nextId = tabAt(currentIndex - 1);
		else if (event.key === 'Home') nextId = tabs[0]?.id;
		else if (event.key === 'End') nextId = tabs[tabs.length - 1]?.id;
		if (nextId === undefined) return;
		event.preventDefault();
		focusTab(nextId);
	}

	return (
		<div aria-label={ariaLabel} className="flex flex-wrap gap-2" role="tablist">
			{tabs.map((tab) => {
				const selected = activeTab === tab.id;
				const Icon = tab.icon;
				return (
					<Button
						aria-controls={tabPanelId(idPrefix, tab.id)}
						aria-selected={selected}
						id={tabButtonId(idPrefix, tab.id)}
						key={tab.id}
						onClick={() => onChange(tab.id)}
						onKeyDown={onTabKeyDown}
						role="tab"
						tabIndex={selected ? 0 : -1}
						variant={selected ? 'primary' : 'secondary'}>
						{Icon ? <Icon className="h-4 w-4" /> : null}
						{tab.label}
						{tab.badge}
					</Button>
				);
			})}
		</div>
	);
}

interface TabPanelProps<T extends string> {
	activeTab: T;
	children: ReactNode;
	id: T;
	idPrefix: string;
}

/**
 * Canonical tabpanel primitive. Emits `role="tabpanel"` with `aria-labelledby`
 * pointing back at its trigger; inactive panels stay unmounted.
 */
export function TabPanel<T extends string>({
	activeTab,
	children,
	id,
	idPrefix,
}: TabPanelProps<T>) {
	if (activeTab !== id) return null;
	return (
		<div
			aria-labelledby={tabButtonId(idPrefix, id)}
			id={tabPanelId(idPrefix, id)}
			role="tabpanel">
			{children}
		</div>
	);
}
