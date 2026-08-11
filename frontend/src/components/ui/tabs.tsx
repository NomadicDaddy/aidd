import { type ComponentType, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { OverflowScroller } from '../shared/OverflowScroller.tsx';
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
	/**
	 * `compact` shrinks the triggers, drops their icons, and pins the strip to one row: it scrolls
	 * horizontally from `lg` up and collapses to a labelled dropdown below it. Reach for it once a
	 * strip carries enough tabs to wrap: sixteen default-size triggers took two rows at 1440 and six
	 * at 768, where the strip alone was a fifth of the viewport before any panel content began — and
	 * a wrapping strip has no stable shape, since the row a tab lands on shifts with the selection.
	 */
	density?: 'compact' | 'default';
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
	density = 'default',
	idPrefix,
	onChange,
	tabs,
}: TabListProps<T>) {
	const compact = density === 'compact';
	function focusTab(id: T) {
		onChange(id);
		const node = document.getElementById(tabButtonId(idPrefix, id));
		if (!(node instanceof HTMLElement)) return;
		node.focus();
		// `focus()` scrolls an off-screen trigger into view, but it scrolls every scrollable
		// ancestor to do it, which yanks the page under a keyboard user arrowing along the strip.
		// `inline: 'nearest'` moves the strip by the least it can and leaves the page where it is.
		node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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

	const tablist = (
		<div
			aria-label={ariaLabel}
			className={compact ? 'flex gap-2' : 'flex flex-wrap gap-2'}
			role="tablist">
			{tabs.map((tab) => {
				const selected = activeTab === tab.id;
				const Icon = tab.icon;
				return (
					<Button
						aria-controls={tabPanelId(idPrefix, tab.id)}
						aria-selected={selected}
						className={compact ? 'shrink-0' : undefined}
						id={tabButtonId(idPrefix, tab.id)}
						key={tab.id}
						onClick={() => onChange(tab.id)}
						onKeyDown={onTabKeyDown}
						role="tab"
						size={compact ? 'compact' : 'default'}
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

	return (
		<>
			{/* Below lg the strip becomes the same labelled dropdown the sidebar's project navigation
			    uses. Both are rendered: the triggers stay in the DOM so every panel's
			    `aria-labelledby` keeps resolving, and CSS decides which one is on screen. */}
			{compact ? (
				<label className="block lg:hidden">
					<span className="sr-only">{ariaLabel}</span>
					<select
						className={cn(selectClass, 'w-full')}
						onChange={(event) => onChange(event.target.value as T)}
						value={activeTab}>
						{tabs.map((tab) => (
							<option key={tab.id} value={tab.id}>
								{tab.label}
							</option>
						))}
					</select>
				</label>
			) : null}
			{/* Only the compact strip scrolls, so only it is wrapped: the default strip wraps to
			    more rows instead and a scroller around it would emit a landmark for a region that
			    never scrolls. Unwrapped, Project Detail measured scrollWidth 1804 in a 1312
			    scrollport at 1600x1200 — Reports, Audits, Profile and Management sat off-screen
			    with no fade, no arrow and no scrollbar, half the page's navigation invisible.
			    The tablist stays the tablist; the scroller only wraps it. */}
			{compact ? (
				// `surface="background"`: a tab strip sits on the page, not inside a Card. Faded
				// `from-card` the band was lighter than the ground beneath it, so the one consumer
				// that most needs "there is more this way" was showing "the container ends here".
				<OverflowScroller
					ariaLabel={ariaLabel}
					className="hidden lg:block"
					scrollerClassName="pb-1"
					surface="background">
					{tablist}
				</OverflowScroller>
			) : (
				tablist
			)}
		</>
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
