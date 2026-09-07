import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { default as Undo2 } from 'lucide-react/dist/esm/icons/undo-2';

import { cn } from '../../lib/cn.ts';
import { useContentRail } from '../../lib/contentRails.ts';
import { toneText } from '../../lib/tones.ts';
import { StatusDot } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';

/** Document clearance for a sticky phone commit surface. */
export const commitBarClearanceClass =
	'max-sm:[&:has([data-commit-bar])]:pb-24 max-sm:[&:has([data-commit-bar])]:[scroll-padding-bottom:7rem] max-sm:[&_button]:scroll-mb-28 max-sm:[&_input]:scroll-mb-28 max-sm:[&_select]:scroll-mb-28 max-sm:[&_textarea]:scroll-mb-28';

/**
 * The commit control, pinned to the foot of the viewport instead of to the head of the form.
 *
 * `EditorActionBar` and `SettingsToolbar` pin at the top, which works while the form is roughly a
 * screen tall and stops working when it is not. Measured at 390x844: the only Save on
 * audits-overrides sat at document y=604 with the rows it commits running to y=4507 — 3903px, about
 * 4.6 screens, between the button and the last thing it saves. The settings forms are 1648px
 * (Integrations), 2679px (Control Panel) and 5850px (the longest tab), and `SettingsToolbar` is
 * `sm:sticky`, so the one commit strip in the app that unpins is the one over the longest forms.
 *
 * The dirty count travels with the button because it is the same problem: the number telling you
 * how many changes are staged was off screen for exactly as long as the button was.
 *
 * A commit strip, not the toolbar. Pinning the full `SettingsToolbar` was considered and rejected
 * at the source: its own comment records that its wrapped tabs and actions consume 42% of a 390x844
 * viewport. This carries one row — count, Discard, Save — so it costs a strip rather than a screen.
 */
export function CommitBar({
	blockReason = null,
	className,
	dirty,
	dirtyLabel,
	discardLabel = 'Discard',
	onDiscard,
	onSave,
	pending = false,
	pendingLabel = 'Saving…',
	saveLabel,
	statusId,
}: {
	/** Why a save is refused right now, or null. The reason is on screen with the button. */
	blockReason?: null | string;
	className?: string;
	/** Whether anything is staged. False renders the resting line and disables both controls. */
	dirty: boolean;
	/**
	 * What is staged, counted. The caller owns the wording because it owns the unit: overrides
	 * stage individual effect changes, settings stage whole tabs, and "3 unsaved changes" would be
	 * a lie about one of them.
	 */
	dirtyLabel: string;
	discardLabel?: string;
	onDiscard: () => void;
	onSave: () => void;
	pending?: boolean;
	pendingLabel?: string;
	saveLabel: string;
	statusId?: string;
}) {
	const rail = useContentRail();
	if (!dirty && !pending) return null;
	return (
		// `pb-[max(…)]` rather than a flat padding: the bar sits on the home indicator otherwise,
		// and `main` gives its own bottom padding to content in flow, not to a pinned child.
		<div
			className={cn(
				'sticky bottom-2 z-20 rounded-xl border border-control-border bg-card px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg',
				className,
			)}
			data-commit-bar="true"
			data-content-rail={rail}>
			<div className="mx-auto flex w-full max-w-[64rem] flex-wrap items-center justify-between gap-2">
				<p
					aria-live="polite"
					className={cn(
						'order-2 flex min-w-0 basis-full items-center gap-1.5 text-xs sm:order-1 sm:basis-auto',
						dirty ? toneText.amber : 'text-muted-foreground',
					)}
					id={statusId}>
					{dirty ? <StatusDot tone="amber" /> : null}
					<span className="min-w-0 break-words">
						{dirty ? dirtyLabel : 'No unsaved changes'}
					</span>
				</p>
				<div className="order-1 ml-auto flex shrink-0 items-center gap-2 sm:order-2">
					<Button
						aria-describedby={
							[statusId, blockReason !== null ? 'commit-bar-block-reason' : undefined]
								.filter(Boolean)
								.join(' ') || undefined
						}
						disabled={pending || !dirty}
						onClick={onDiscard}
						size="compact"
						variant="secondary">
						<Undo2 aria-hidden="true" className="h-4 w-4" />
						{discardLabel}
					</Button>
					<Button
						aria-describedby={
							[statusId, blockReason !== null ? 'commit-bar-block-reason' : undefined]
								.filter(Boolean)
								.join(' ') || undefined
						}
						disabled={pending || !dirty || blockReason !== null}
						onClick={onSave}
						size="compact"
						variant="primary">
						{pending ? (
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						) : (
							<Save aria-hidden="true" className="h-4 w-4" />
						)}
						{pending ? pendingLabel : saveLabel}
					</Button>
				</div>
			</div>
			{/* Gated on `dirty` for the reason `EditorActionBar` documents: a clean form is not
			    asking to commit anything, and announcing a block before the user has typed is a
			    scold. Gated on nothing else, because this is the only place the reason is legible
			    once the toolbar carrying it has scrolled away. */}
			{blockReason !== null && dirty && !pending ? (
				<p
					className={cn(
						'mx-auto mt-1.5 flex w-full max-w-[64rem] items-start gap-1.5 text-xs',
						toneText.red,
					)}
					id="commit-bar-block-reason">
					<AlertTriangle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
					<span>{blockReason}</span>
				</p>
			) : null}
		</div>
	);
}
