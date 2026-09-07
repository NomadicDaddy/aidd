/**
 * Toasts raised from the app shell.
 *
 * sonner is ~52 KB of module code, and it is the toaster as well as the `toast()` function — one
 * static import anywhere in the entry chunk puts all of it on the critical path of every first
 * paint. Every other caller in this app lives in a lazily loaded route or dialog, where sonner
 * rides along in that chunk and costs first paint nothing; the shell's handful of callers are the
 * exception, so they reach it through a dynamic import instead.
 *
 * Nothing is lost by the toast arriving a tick later: sonner replays still-active toasts to the
 * <Toaster/> when it subscribes, so even a toast raised before the toaster itself has finished
 * loading is displayed rather than dropped.
 *
 * Route, page, and dialog code should keep importing `toast` from 'sonner' directly.
 */
export function shellToast(
	kind: 'error' | 'info' | 'success' | 'warning',
	title: string,
	options?: { description?: string },
): void {
	void import('sonner').then(({ toast }) => {
		toast[kind](title, options);
	});
}
