import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';

import { cn } from '../../lib/cn.ts';
import { useSidebarStore } from '../../stores/sidebarStore.ts';
import { clampTerminalHeight, useTerminalStore } from '../../stores/terminalStore.ts';

// The body pulls in @xterm/xterm (~300KB); lazy so users who never open the pane never load it.
const TerminalPaneBody = lazy(() =>
	import('./TerminalPaneBody.tsx').then((module) => ({ default: module.TerminalPaneBody }))
);

/** Drag strip along the pane's top edge: pointer-capture vertical resize of the docked pane. */
function ResizeHandle() {
	const setHeightPx = useTerminalStore((state) => state.setHeightPx);
	const frame = useRef<null | number>(null);

	const onPointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			event.preventDefault();
			const handle = event.currentTarget;
			handle.setPointerCapture(event.pointerId);
			const previousUserSelect = document.body.style.userSelect;
			document.body.style.userSelect = 'none';
			const onMove = (move: PointerEvent) => {
				frame.current ??= requestAnimationFrame(() => {
					frame.current = null;
					setHeightPx(clampTerminalHeight(window.innerHeight - move.clientY));
				});
			};
			const onUp = () => {
				handle.removeEventListener('pointermove', onMove);
				handle.removeEventListener('pointerup', onUp);
				handle.removeEventListener('pointercancel', onUp);
				if (frame.current !== null) cancelAnimationFrame(frame.current);
				frame.current = null;
				document.body.style.userSelect = previousUserSelect;
			};
			handle.addEventListener('pointermove', onMove);
			handle.addEventListener('pointerup', onUp);
			handle.addEventListener('pointercancel', onUp);
		},
		[setHeightPx]
	);

	return (
		<div
			aria-label="Resize terminal"
			className="group absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize touch-none"
			onPointerDown={onPointerDown}
			role="separator">
			<div className="mx-auto mt-1 h-0.5 w-full bg-transparent transition-colors group-hover:bg-cyan-400/70" />
		</div>
	);
}

/**
 * Bottom-docked terminal pane (VS Code style). Mounted once in AppLayout so it survives route
 * navigation; after the first open it stays mounted and merely hides, keeping the xterm instance,
 * its scrollback, and the socket alive. Deliberately not a Dialog — the rest of the app must stay
 * interactive while the terminal is up.
 */
export function TerminalPane() {
	const everOpened = useTerminalStore((state) => state.everOpened);
	const open = useTerminalStore((state) => state.open);
	const heightPx = useTerminalStore((state) => state.heightPx);
	const maximized = useTerminalStore((state) => state.maximized);
	const collapsed = useSidebarStore((state) => state.collapsed);

	// Re-clamp a persisted height against the current viewport (e.g. window shrank since last visit).
	const setHeightPx = useTerminalStore((state) => state.setHeightPx);
	useEffect(() => {
		if (everOpened) setHeightPx(useTerminalStore.getState().heightPx);
	}, [everOpened, setHeightPx]);

	if (!everOpened) return null;

	return (
		<section
			aria-label="Terminal"
			className={cn(
				'fixed right-0 bottom-0 z-30 flex flex-col border-t border-neutral-200 bg-white shadow-[0_-8px_24px_-12px_rgba(2,6,23,0.35)] dark:border-cyan-950/50 dark:bg-slate-950',
				'left-0 transition-[left] duration-200',
				collapsed ? 'sm:left-16' : 'sm:left-60',
				!open && 'hidden'
			)}
			style={{ height: maximized ? 'calc(100vh - 2.5rem)' : `${heightPx}px` }}>
			{!maximized && <ResizeHandle />}
			<Suspense
				fallback={
					<div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
						Loading terminal…
					</div>
				}>
				<TerminalPaneBody />
			</Suspense>
		</section>
	);
}
