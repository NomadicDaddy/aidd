import { useEffect, useState } from 'react';

/**
 * Returns a copy of `value` that only updates after it has stayed unchanged for `delayMs`.
 * Used to coalesce rapid edits (e.g. live profile recalculation) into a single downstream
 * effect/request instead of firing on every keystroke or toggle.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);

	return debounced;
}
