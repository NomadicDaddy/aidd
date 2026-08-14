import { useEffect } from 'react';
import { type Blocker, useBlocker } from 'react-router';

interface UnsavedGuardLocation {
	pathname: string;
	search: string;
}

export function shouldBlockUnsavedNavigation(
	dirty: boolean,
	currentLocation: UnsavedGuardLocation,
	nextLocation: UnsavedGuardLocation,
): boolean {
	return (
		dirty &&
		(currentLocation.pathname !== nextLocation.pathname ||
			currentLocation.search !== nextLocation.search)
	);
}

// Blocks intra-app route changes (via react-router blocker) and shows the browser's native
// beforeunload prompt for tab close / full reload while `dirty` is true. The returned Blocker
// stays in 'unblocked' state while clean; the caller renders a ConfirmDialog gating
// blocker.proceed() / blocker.reset() once state === 'blocked'.
export function useUnsavedGuard(dirty: boolean): Blocker {
	const blocker = useBlocker(({ currentLocation, nextLocation }) =>
		shouldBlockUnsavedNavigation(dirty, currentLocation, nextLocation),
	);

	useEffect(() => {
		if (!dirty) return;
		const handler = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	}, [dirty]);

	return blocker;
}
