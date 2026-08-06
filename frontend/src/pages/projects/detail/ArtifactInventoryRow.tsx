import { default as Ban } from 'lucide-react/dist/esm/icons/ban';
import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { type ReactNode } from 'react';

import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { artifactRowButtonClass } from './artifactRowStyles.ts';
import { type ArtifactViewerTarget } from './artifactsUtils.ts';

/**
 * Whether the human label says anything its identifier does not.
 *
 * Two thirds of the maturity inventory is audit evidence whose label is its own slug with the
 * `audit:` prefix stripped, so 39 consecutive rows read `audit:AI  AI`.
 */
function labelAddsNothing(identifier: string, label: string | undefined): boolean {
	if (!label) return true;
	const normalize = (value: string) =>
		value
			.replace(/^audit:/, '')
			.replaceAll(/[\s_-]/gu, '')
			.toLowerCase();
	return normalize(identifier) === normalize(label);
}

/**
 * The one row of the artifact inventory.
 *
 * The tab used to interleave two row components that inverted each other's type treatment: one led
 * with a human label in the body face and trailed a mono path, the next led with a mono slug and
 * trailed a human label — so a reader scanning a single list crossed two different columns of
 * primary text, in two faces, describing the same kind of thing.
 *
 * One type rule now decides both, and it is about what the text *is* rather than which list it came
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
	rowTitle,
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
	/** Multi-line `title` for the facts that would otherwise need a second row. */
	rowTitle?: string;
	skipped: boolean;
	viewerTarget: ArtifactViewerTarget | null;
}) {
	const viewable = onOpen !== undefined && viewerTarget !== null;
	const identifierIsName = labelAddsNothing(identifier, label);
	const nameOfRow = label ?? identifier;
	const nameBlock = (
		<div className="flex min-w-0 items-center gap-2">
			{identifierIsName ? (
				<span className="truncate font-mono text-sm text-foreground">{identifier}</span>
			) : (
				<span className="truncate text-sm font-medium text-foreground">{label}</span>
			)}
			{viewable ? (
				<Eye aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			) : null}
			{identifierIsName ? null : (
				<span className="truncate font-mono text-xs text-muted-foreground">
					{identifier}
				</span>
			)}
		</div>
	);
	return (
		<div
			className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5"
			title={rowTitle}>
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
			<div className="flex shrink-0 items-center gap-1.5">
				{badges}
				{mtime ? (
					<RelativeAge
						className="text-xs whitespace-nowrap text-muted-foreground"
						value={mtime}
					/>
				) : null}
				{onToggleSkip ? (
					<Button
						aria-label={skipped ? `Restore ${nameOfRow}` : `Mark ${nameOfRow} as N/A`}
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
	);
}
