import type { ProjectArtifactRecord } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { formatDate, formatRelativeAge } from '../../../lib/formatters.ts';
import { ArtifactInventoryRow } from './ArtifactInventoryRow.tsx';
import {
	artifactStatus,
	artifactViewerTarget,
	type ArtifactViewerTarget,
	formatBytes,
	severityTone,
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
	// One line, and the four facts that used to own a second row become the row's tooltip. The
	// inventory interleaves these rows with the maturity ones, so a 62px three-line row sat
	// directly above a 34px one-line row describing the same kind of thing.
	const metaTitle = [
		`State: ${record.exists ? 'present' : 'missing'}`,
		`Modified: ${
			record.mtime ? `${formatDate(record.mtime)} (${formatRelativeAge(record.mtime)})` : '—'
		}`,
		`Age: ${
			record.ageDays === null
				? '—'
				: `${record.ageDays} day${record.ageDays === 1 ? '' : 's'}`
		}`,
		`Size: ${record.exists ? formatBytes(record.sizeBytes) : '—'}`,
	].join('\n');
	return (
		<ArtifactInventoryRow
			badges={
				<>
					{skipped ? <Badge tone="neutral">skipped</Badge> : null}
					<Badge tone={status.tone}>{status.label}</Badge>
					<Badge tone={severityTone(record.severity)}>{record.severity}</Badge>
				</>
			}
			disabled={disabled}
			identifier={record.path}
			label={record.label}
			mtime={record.mtime}
			onOpen={onOpen}
			onToggleSkip={onToggleSkip ? () => onToggleSkip(record.label, !skipped) : undefined}
			rowTitle={metaTitle}
			skipped={skipped}
			viewerTarget={artifactViewerTarget(record)}
		/>
	);
}
