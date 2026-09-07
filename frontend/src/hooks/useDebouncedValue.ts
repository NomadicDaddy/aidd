import { useEffect, useEffectEvent, useState } from 'react';

/**
 * Returns a copy of `value` that only updates after it has stayed unchanged for `delayMs`.
 * Used to coalesce rapid edits (e.g. live profile recalculation) into a single downstream
 * effect/request instead of firing on every keystroke or toggle.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250, stabilityKey: unknown = value): T {
	const [debounced, setDebounced] = useState(value);
	const commitLatestValue = useEffectEvent(() => setDebounced(value));

	useEffect(() => {
		const timer = setTimeout(commitLatestValue, delayMs);
		return () => clearTimeout(timer);
	}, [delayMs, stabilityKey]);

	return debounced;
}
