import { default as Ban } from 'lucide-react/dist/esm/icons/ban';
import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';

import type { MaturityArtifact } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { formatRelativeAge } from '../../../lib/formatters.ts';
import { artifactRowButtonClass } from './artifactRowStyles.ts';
import { type ArtifactViewerTarget, maturityArtifactViewerTarget } from './artifactsUtils.ts';
import { artifactStatusLabel, artifactTone } from './maturityOverviewUtils.ts';

/**
 * Whether the human label says anything the slug does not. Two thirds of the inventory is audit
 * evidence whose label is its own slug with the `audit:` prefix stripped, so 39 consecutive rows
 * read 'audit:AI  AI'.
 */
function redundantLabel(artifact: MaturityArtifact): boolean {
	const normalize = (value: string) =>
		value
			.replace(/^audit:/, '')
			.replaceAll(/[\s_-]/gu, '')
			.toLowerCase();
	return normalize(artifact.slug) === normalize(artifact.label);
}

interface MaturityArtifactRowProps {
	artifact: MaturityArtifact;
	disabled: boolean;
	/** Set when the group heading already says every entry is required. */
	hideRequired?: boolean;
	onOpen?: ((target: ArtifactViewerTarget) => void) | undefined;
	onToggleSkip?: ((slug: string, skip: boolean) => void) | undefined;
}

export function MaturityArtifactRow({
	artifact,
	disabled,
	hideRequired = false,
	onOpen,
	onToggleSkip,
}: MaturityArtifactRowProps) {
	const skipped = artifact.status === 'skipped';
	const viewerTarget = maturityArtifactViewerTarget(artifact);
	const viewable = onOpen !== undefined && viewerTarget !== null;
	const labelBlock = (
		<div className="flex min-w-0 items-center gap-2">
			<span className="truncate font-mono text-xs text-foreground">{artifact.slug}</span>
			{viewable ? (
				<Eye aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			) : null}
			{redundantLabel(artifact) ? null : (
				<span className="truncate text-xs text-muted-foreground">{artifact.label}</span>
			)}
		</div>
	);
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
			{viewable ? (
				<button
					aria-label={`View ${artifact.label}`}
					className={artifactRowButtonClass}
					onClick={() => onOpen(viewerTarget)}
					type="button">
					{labelBlock}
				</button>
			) : (
				labelBlock
			)}
			<div className="flex shrink-0 items-center gap-1.5">
				<Badge tone={artifactTone(artifact)}>{artifactStatusLabel(artifact)}</Badge>
				{artifact.required && !hideRequired ? <Badge tone="teal">required</Badge> : null}
				{artifact.mtime ? (
					<span className="text-xs text-muted-foreground">
						{formatRelativeAge(artifact.mtime)}
					</span>
				) : null}
				{onToggleSkip ? (
					<Button
						aria-label={
							skipped ? `Restore ${artifact.label}` : `Mark ${artifact.label} as N/A`
						}
						disabled={disabled}
						onClick={() => onToggleSkip(artifact.slug, !skipped)}
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
