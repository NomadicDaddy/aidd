import type { ReactNode } from 'react';

import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { default as Undo2 } from 'lucide-react/dist/esm/icons/undo-2';

import { cn } from '../../lib/cn.ts';
import { useContentRail } from '../../lib/contentRails.ts';
import { toneText } from '../../lib/tones.ts';
import { StatusDot } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';

/**
 * The commit strip every editor in the app wears, generalized from `SettingsToolbar`.
 *
 * Settings had solved this once: a sticky card holding Save and Discard, both inert until something
 * is actually unsaved, with the reason a save is refused stated in a live region rather than in a
 * `title` attribute. The three other editors each solved it differently and none of them solved it
 * well — Profile's Save was a 1067px-wide control 2647px down a 2707px page, and Recipe edit's sat
 * in a static header on a 3572px page with no dirty state, no discard, and its block reason
 * reachable only by hovering a mouse over a control that looked willing to be pressed.
 *
 * The offset is the shell nav bar's own published height rather than a magic number. Below `sm`
 * that bar is a sticky element in flow at the same `z-20`, so an unoffset bar and it occupy the
 * same strip and the later one in the DOM paints over the navigation.
 *
 * The gate is a container query, so the bar folds on its own width. These editors sit in columns of
 * different widths beside a sidebar rail whose width is a user preference, and a viewport tier
 * cannot see either.
 */
export function EditorActionBar({
	blockReason = null,
	children,
	className,
	dirty,
	/**
	 * Keep the discard control usable with nothing to discard.
	 *
	 * For an editor whose discard is also the way out of edit mode — Recipe detail's Cancel — the
	 * Settings behaviour of disabling it on a clean form would strand the user in the editor.
	 */
	discardEnabledWhenClean = false,
	discardLabel = 'Discard',
	onDiscard,
	onSave,
	pending = false,
	pendingLabel,
	saveLabel,
}: {
	/** Why a save is refused right now, or null. Rendered as a live region, never as a `title`. */
	blockReason?: null | string;
	children?: ReactNode;
	className?: string;
	dirty: boolean;
	discardEnabledWhenClean?: boolean;
	discardLabel?: string;
	onDiscard: () => void;
	onSave: () => void;
	pending?: boolean;
	pendingLabel?: string;
	saveLabel: string;
}) {
	const blocked = blockReason !== null;
	const rail = useContentRail();
	return (
		<Card
			className={cn(
				'@container sticky top-[var(--app-topbar-height,0px)] z-20 space-y-2 border-b-2 border-border bg-card/95 p-2.5 backdrop-blur',
				className,
			)}
			data-content-rail={rail}>
			{/* The bar itself is the container, and it measures 336px inside a 390px viewport on
			    settings-integrations and on the project profile tab — a 512px step is about a 612px
			    viewport, so a phone only ever sees the stacked branch. That is the branch for a
			    phone: the row it would otherwise make puts a wrapping block-reason message opposite
			    two buttons, and the message is the thing a stuck editor needs read. */}
			<div className="flex flex-col gap-2 @min-[32rem]:flex-row @min-[32rem]:items-center @min-[32rem]:justify-between">
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground max-sm:flex-nowrap max-sm:overflow-hidden">
					{/* The same amber locator Settings puts on a dirty tab. Without it the only
					    difference between a clean editor and one holding unsaved work was which of
					    two buttons happened to be greyed out. */}
					{dirty ? (
						<span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
							<StatusDot tone="amber" />
							Unsaved changes
						</span>
					) : null}
					{blocked && dirty && !pending ? (
						<span
							aria-label={blockReason}
							className={cn('min-w-0', toneText.amber, 'max-sm:truncate')}
							role="status"
							title={blockReason}>
							{blockReason}
						</span>
					) : null}
					{children}
				</div>
				<div className="flex shrink-0 items-center justify-end gap-2">
					<Button
						disabled={pending || (!dirty && !discardEnabledWhenClean)}
						onClick={onDiscard}
						size="compact"
						variant="secondary">
						<Undo2 aria-hidden="true" className="h-4 w-4" />
						{discardLabel}
					</Button>
					<Button
						disabled={pending || !dirty || blocked}
						onClick={onSave}
						size="compact"
						variant="primary">
						{pending ? (
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						) : (
							<Save aria-hidden="true" className="h-4 w-4" />
						)}
						{pending && pendingLabel !== undefined ? pendingLabel : saveLabel}
					</Button>
				</div>
			</div>
			{/* Gated on `dirty`: the line explains why a commit is being refused, and a clean editor
			    is not asking to commit one. An untouched New Recipe form is "blocked" on its own
			    empty required fields, which the fields already mark; announcing it in amber before
			    the user has typed anything is a scold, not guidance. */}
		</Card>
	);
}
