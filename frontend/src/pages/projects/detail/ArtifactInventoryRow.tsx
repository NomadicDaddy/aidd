import { default as Ban } from 'lucide-react/dist/esm/icons/ban';
import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { type ReactNode } from 'react';

import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { artifactRowButtonClass } from './artifactRowStyles.ts';
import { type ArtifactViewerTarget, formatBytes, labelAddsNothing } from './artifactsUtils.ts';

/**
 * The one row of the artifact inventory.
 *
 * The tab interleaves two kinds of row, and they must not invert each other's type treatment: if
 * one led with a human label in the body face and trailed a mono path while the next led with a
 * mono slug and trailed a human label, a reader scanning a single list would cross two different
 * columns of primary text, in two faces, describing the same kind of thing.
 *
 * One type rule decides both, and it is about what the text *is* rather than which list it came
 * from: mono is a machine identifier (a slug, a path), the body face is human writing, `foreground`
 * is the name of the row and `muted-foreground` is everything qualifying it. The name is the human
 * label when the label says anything the identifier does not, and the identifier itself when it does
 * not — which is why a row can lead with either face and still be following one rule.
 */
export function ArtifactInventoryRow({
	badges,
	disabled,
	identifier,
	label,
	mtime,
	onOpen,
	onToggleSkip,
	sizeBytes,
	skipped,
	viewerTarget,
}: {
	/** Status badges, in the order this inventory ranks them. */
	badges: ReactNode;
	disabled: boolean;
	/** The machine name: a slug or a repo-relative path. Always mono. */
	identifier: string;
	/** The human name, when there is one worth showing beside the identifier. */
	label?: string;
	mtime?: null | string;
	onOpen?: ((target: ArtifactViewerTarget) => void) | undefined;
	onToggleSkip?: (() => void) | undefined;
	sizeBytes?: null | number;
	skipped: boolean;
	viewerTarget: ArtifactViewerTarget | null;
}) {
	const viewable = onOpen !== undefined && viewerTarget !== null;
	const nameOfRow = label ?? identifier;
	const nameBlock = (
		// The name and its identifier are two lines on a phone and one line from `sm` up. Sharing a
		// line was a measured content loss at 390px: `project-structure.md` had 115px for 136px of
		// text and `.aidd/project-structure.md` 158px for 187px, so both halves of the row's own
		// name were cut at once and neither said which artifact this was.
		<div className="flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
			<span className="flex max-w-full min-w-0 shrink-0 items-center gap-2">
				<span className="truncate text-sm font-medium text-foreground">{nameOfRow}</span>
				{viewable ? (
					<Eye
						aria-hidden="true"
						className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
					/>
				) : null}
			</span>
			{labelAddsNothing(identifier, label) ? null : (
				<span className="max-w-full min-w-0 truncate font-mono text-xs text-muted-foreground">
					{identifier}
				</span>
			)}
		</div>
	);
	return (
		// Below `sm` the metadata group gets its own line rather than competing with the name. From
		// `sm` up the row becomes a two-column grid and every metadata group reserves the same tracks.
		//
		// The parent composition owns the measure. Keeping the cap here instead made the surrounding
		// card, metric strip, and headings continue for another half-screen after every row ended.
		<div
			className={
				viewable
					? 'flex cursor-pointer flex-col gap-2 rounded-md border border-border px-2.5 py-1.5 transition-colors hover:bg-muted/60 sm:grid sm:grid-cols-[minmax(0,44rem)_minmax(23rem,28rem)] sm:items-center sm:justify-start'
					: 'flex flex-col gap-2 rounded-md border border-border px-2.5 py-1.5 sm:grid sm:grid-cols-[minmax(0,44rem)_minmax(23rem,28rem)] sm:items-center sm:justify-start'
			}
			onClick={(event) => {
				if (!viewable || (event.target as HTMLElement).closest('button')) return;
				onOpen(viewerTarget);
			}}>
			{viewable ? (
				<button
					aria-label={`View ${nameOfRow}`}
					className={artifactRowButtonClass}
					onClick={() => onOpen(viewerTarget)}
					type="button">
					{nameBlock}
				</button>
			) : (
				nameBlock
			)}
			{/* Every desktop row reserves the same badge track. The age and action use their
			    intrinsic widths so the identity absorbs the remaining space instead of losing a
			    fixed 12rem to metadata that is usually much shorter. */}
			<div className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5 sm:w-auto sm:grid-cols-[minmax(8rem,11rem)_4.5rem_6rem_minmax(5.5rem,auto)]">
				<div className="flex items-center gap-1.5">{badges}</div>
				<span className="text-right font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
					{sizeBytes === null || sizeBytes === undefined ? '—' : formatBytes(sizeBytes)}
				</span>
				<div className="flex justify-start sm:justify-end">
					{mtime ? (
						<RelativeAge
							className="text-xs whitespace-nowrap text-muted-foreground"
							value={mtime}
						/>
					) : (
						<span className="text-xs text-muted-foreground">—</span>
					)}
				</div>
				<div className="col-span-3 flex justify-end sm:col-span-1">
					{onToggleSkip ? (
						<Button
							aria-label={
								skipped ? `Restore ${nameOfRow}` : `Mark ${nameOfRow} as N/A`
							}
							disabled={disabled}
							onClick={onToggleSkip}
							size="compact"
							title={skipped ? 'Restore artifact' : 'Mark artifact as not applicable'}
							variant={skipped ? 'ghost' : 'secondary'}>
							{skipped ? (
								<>
									<RotateCcw className="h-3.5 w-3.5" />
									Restore
								</>
							) : (
								<>
									<Ban className="h-3.5 w-3.5" />
									Mark N/A
								</>
							)}
						</Button>
					) : null}
				</div>
			</div>
		</div>
	);
}
