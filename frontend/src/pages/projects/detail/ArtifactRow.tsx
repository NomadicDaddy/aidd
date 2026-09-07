import type { ProjectArtifactRecord } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { microLabelClass } from '../../../lib/typography.ts';
import { ArtifactInventoryRow } from './ArtifactInventoryRow.tsx';
import {
	artifactStatus,
	artifactViewerTarget,
	type ArtifactViewerTarget,
} from './artifactsUtils.ts';

interface ArtifactRowProps {
	disabled: boolean;
	onOpen?: ((target: ArtifactViewerTarget) => void) | undefined;
	onToggleSkip?: ((slug: string, skip: boolean) => void) | undefined;
	record: ProjectArtifactRecord;
	skipped: boolean;
}

/**
 * A `ProjectArtifactRecord` as an inventory row: this file decides what a project artifact's
 * identifier, label and badges are, and `ArtifactInventoryRow` decides how a row looks. The two
 * inventories on this tab render into the same list, so the second decision cannot be made twice.
 */
export function ArtifactRow({ disabled, onOpen, onToggleSkip, record, skipped }: ArtifactRowProps) {
	const status = artifactStatus(record);
	return (
		<ArtifactInventoryRow
			badges={
				<>
					{skipped ? (
						<Badge tone="neutral">Not applicable</Badge>
					) : (
						<Badge tone={status.tone}>{status.label}</Badge>
					)}
					<span className={`${microLabelClass} text-muted-foreground`}>
						{record.severity}
					</span>
				</>
			}
			disabled={disabled}
			identifier={record.path}
			label={record.label}
			mtime={record.mtime}
			onOpen={onOpen}
			onToggleSkip={onToggleSkip ? () => onToggleSkip(record.label, !skipped) : undefined}
			sizeBytes={record.exists ? record.sizeBytes : null}
			skipped={skipped}
			viewerTarget={artifactViewerTarget(record)}
		/>
	);
}
