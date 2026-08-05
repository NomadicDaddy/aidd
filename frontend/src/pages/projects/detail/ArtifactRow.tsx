import { default as Ban } from 'lucide-react/dist/esm/icons/ban';
import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';

import type { ProjectArtifactRecord } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { formatDate, formatRelativeAge } from '../../../lib/formatters.ts';
import { artifactRowButtonClass } from './artifactRowStyles.ts';
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

export function ArtifactRow({ disabled, onOpen, onToggleSkip, record, skipped }: ArtifactRowProps) {
	const status = artifactStatus(record);
	const viewerTarget = artifactViewerTarget(record);
	const viewable = onOpen !== undefined && viewerTarget !== null;
	// One line, and the four facts that used to own a second row become the row's tooltip. The
	// inventory interleaves these rows with MaturityArtifactRow's, so a 62px three-line row sat
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
	const labelBlock = (
		<div className="flex min-w-0 items-center gap-2">
			<span className="truncate text-sm font-medium text-foreground">{record.label}</span>
			{viewable ? (
				<Eye aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			) : null}
			<span className="truncate font-mono text-xs text-muted-foreground">{record.path}</span>
		</div>
	);
	return (
		<div
			className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5"
			title={metaTitle}>
			{viewable ? (
				<button
					aria-label={`View ${record.label}`}
					className={artifactRowButtonClass}
					onClick={() => onOpen(viewerTarget)}
					type="button">
					{labelBlock}
				</button>
			) : (
				labelBlock
			)}
			<div className="flex shrink-0 items-center gap-1.5">
				{skipped ? <Badge tone="neutral">skipped</Badge> : null}
				<Badge tone={status.tone}>{status.label}</Badge>
				<Badge tone={severityTone(record.severity)}>{record.severity}</Badge>
				{record.mtime ? (
					<span className="text-xs whitespace-nowrap text-muted-foreground">
						{formatRelativeAge(record.mtime)}
					</span>
				) : null}
				{onToggleSkip ? (
					<Button
						aria-label={
							skipped ? `Restore ${record.label}` : `Mark ${record.label} as N/A`
						}
						disabled={disabled}
						onClick={() => onToggleSkip(record.label, !skipped)}
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
