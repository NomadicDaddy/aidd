import type { KeyboardEvent } from 'react';

/**
 * Roving focus for the tracked-file tree. The rows were a flat pile of generic buttons: no expanded
 * or selected state, no level, and Tab was the only way through 500 of them. `role="tree"` carries an
 * expectation of arrow-key navigation, so declaring the roles without the keys would be a worse lie
 * than the untyped buttons were.
 *
 * Focus moves over whatever is currently rendered — the DOM order of the visible rows already is the
 * flattened tree — so collapsed subtrees are skipped without the handler knowing the model.
 */
export function handleTreeKeyDown(event: KeyboardEvent<HTMLElement>): void {
	const keys = ['ArrowDown', 'ArrowUp', 'End', 'Home'];
	if (!keys.includes(event.key)) return;
	const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]')];
	if (items.length === 0) return;
	const current = items.indexOf(document.activeElement as HTMLElement);
	let next: number;
	if (event.key === 'Home') next = 0;
	else if (event.key === 'End') next = items.length - 1;
	else if (event.key === 'ArrowDown')
		next = current < 0 ? 0 : Math.min(items.length - 1, current + 1);
	else next = current <= 0 ? 0 : current - 1;
	event.preventDefault();
	items[next]?.focus();
}
