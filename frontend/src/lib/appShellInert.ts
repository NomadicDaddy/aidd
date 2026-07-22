const APP_SHELL_ID = 'app-shell';

let lockCount = 0;
let previousInert = false;
let previousAriaHidden: null | string = null;

function getAppShell(): HTMLElement | null {
	if (typeof document === 'undefined') return null;
	return document.getElementById(APP_SHELL_ID);
}

/**
 * Disable interaction with the app shell while a modal dialog is open.
 *
 * Multiple dialogs may hold the lock concurrently: the `inert`/`aria-hidden`
 * attributes are applied when the first lock is acquired and only cleared once
 * the last lock is released, restoring whatever state the shell had beforehand.
 *
 * Returns a release function that is safe to call more than once — extra calls
 * are ignored, so duplicated effect cleanups (e.g. React StrictMode re-runs) or
 * overlapping dialog lifecycles can never strand `inert` on `#app-shell`.
 */
export function acquireAppShellInert(): () => void {
	const appShell = getAppShell();

	if (lockCount === 0 && appShell) {
		previousInert = appShell.hasAttribute('inert');
		previousAriaHidden = appShell.getAttribute('aria-hidden');
		appShell.setAttribute('inert', '');
		appShell.setAttribute('aria-hidden', 'true');
	}
	lockCount += 1;

	let released = false;
	return () => {
		if (released) return;
		released = true;
		lockCount -= 1;
		if (lockCount > 0) return;

		const shell = getAppShell();
		if (!shell) return;
		if (!previousInert) shell.removeAttribute('inert');
		if (previousAriaHidden === null) shell.removeAttribute('aria-hidden');
		else shell.setAttribute('aria-hidden', previousAriaHidden);
	};
}
