import type { MaturityArtifact } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { microLabelClass } from '../../../lib/typography.ts';
import { ArtifactInventoryRow } from './ArtifactInventoryRow.tsx';
import { type ArtifactViewerTarget, maturityArtifactViewerTarget } from './artifactsUtils.ts';
import { artifactStatusLabel, artifactTone } from './maturityOverviewUtils.ts';

interface MaturityArtifactRowProps {
	artifact: MaturityArtifact;
	disabled: boolean;
	/** Set when the group heading already says every entry is required. */
	hideRequired?: boolean;
	onOpen?: ((target: ArtifactViewerTarget) => void) | undefined;
	onToggleSkip?: ((slug: string, skip: boolean) => void) | undefined;
}

/**
 * A `MaturityArtifact` as an inventory row. The domain mapping lives here; the row's type treatment
 * lives in `ArtifactInventoryRow`, which is also what renders the project-artifact rows this list is
 * interleaved with.
 */
export function MaturityArtifactRow({
	artifact,
	disabled,
	hideRequired = false,
	onOpen,
	onToggleSkip,
}: MaturityArtifactRowProps) {
	const skipped = artifact.status === 'skipped';
	return (
		<ArtifactInventoryRow
			badges={
				<>
					<Badge tone={artifactTone(artifact)}>{artifactStatusLabel(artifact)}</Badge>
					{artifact.required && !hideRequired ? (
						<span className={`${microLabelClass} text-muted-foreground`}>Required</span>
					) : null}
				</>
			}
			disabled={disabled}
			identifier={artifact.slug}
			label={artifact.label}
			mtime={artifact.mtime}
			onOpen={onOpen}
			onToggleSkip={onToggleSkip ? () => onToggleSkip(artifact.slug, !skipped) : undefined}
			sizeBytes={null}
			skipped={skipped}
			viewerTarget={maturityArtifactViewerTarget(artifact)}
		/>
	);
}
