import { useState } from 'react';

/**
 * True from the first moment `open` becomes true, and true from then on.
 *
 * The shell's overlay surfaces are lazily loaded (see components/layout/deferredSurfaces.tsx), so
 * something has to decide when they first render — rendering is what fetches their chunk. Mounting
 * on first open, rather than for the duration of every open, is deliberate: `Dialog` keeps
 * rendering while it animates out, so unmounting the moment `open` flips false would delete the
 * panel mid-close, and every subsequent open would re-run mount effects for no benefit. The
 * terminal pane has always worked this way (`everOpened` in stores/terminalStore.ts); this hook is
 * the same policy for the surfaces whose open flag lives in the shell.
 */
export function useDeferredMount(open: boolean): boolean {
	const [mounted, setMounted] = useState(open);
	// Adjusting state during render — React's documented alternative to a mirroring effect. The
	// re-render happens before the browser paints, so the surface mounts in the same commit that
	// opened it rather than a frame later.
	if (open && !mounted) setMounted(true);
	return mounted;
}
