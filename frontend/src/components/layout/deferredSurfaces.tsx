/**
 * The app shell's overlay surfaces, fetched on demand instead of on first paint.
 *
 * None of these is visible when the app loads — two dialogs, the command palette, the directive
 * launcher, the shortcuts cheatsheet, the docked terminal — yet importing them eagerly from
 * AppLayout put all of their code, and everything they in turn pull in (project queries, the chat
 * transcript, the launch form, the terminal shell), in the entry chunk the browser must download
 * and parse before it can render anything at all. Each is a `lazy()` boundary here and is rendered
 * only once its surface has been opened, so those bytes arrive with the first open.
 *
 * `lazy()` only understands a default export, so each adapter re-shapes the module's named export;
 * the components themselves stay named for every other consumer.
 */
import { lazy, type ReactNode, Suspense } from 'react';

export const AuthTokenDialog = lazy(() =>
	import('../shared/AuthTokenDialog.tsx').then((module) => ({ default: module.AuthTokenDialog })),
);

export const CommandPalette = lazy(() =>
	import('../shared/CommandPalette.tsx').then((module) => ({ default: module.CommandPalette })),
);

export const DirectiveLaunchModal = lazy(() =>
	import('../shared/DirectiveLaunchModal.tsx').then((module) => ({
		default: module.DirectiveLaunchModal,
	})),
);

export const DirectorChatModal = lazy(() =>
	import('../shared/DirectorChatModal.tsx').then((module) => ({
		default: module.DirectorChatModal,
	})),
);

export const ShortcutsOverlay = lazy(() =>
	import('../shared/ShortcutsOverlay.tsx').then((module) => ({
		default: module.ShortcutsOverlay,
	})),
);

export const TerminalPane = lazy(() =>
	import('../terminal/TerminalPane.tsx').then((module) => ({ default: module.TerminalPane })),
);

/**
 * Renders one deferred surface once it has been opened. While `mounted` is false nothing below
 * this is rendered and so no chunk is requested — the JSX handed in as `children` is an element
 * description, not a render. The fallback is deliberately empty: these surfaces are summoned by an
 * explicit gesture and a spinner in the corner of the screen would be noise.
 */
export function DeferredSurface({ children, mounted }: { children: ReactNode; mounted: boolean }) {
	if (!mounted) return null;
	return <Suspense fallback={null}>{children}</Suspense>;
}
