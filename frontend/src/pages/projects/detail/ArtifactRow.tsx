import { default as Ban } from 'lucide-react/dist/esm/icons/ban';
import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';

import type { ProjectArtifactRecord } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { formatDate, formatRelativeAge } from '../../../lib/formatters.ts';
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
	const labelBlock = (
		<>
			<div className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
				{record.label}
				{viewable ? (
					<Eye aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
				) : null}
			</div>
			<div className="mt-0.5 font-mono text-xs break-all text-neutral-500">{record.path}</div>
		</>
	);
	return (
		<div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				{viewable ? (
					<button
						aria-label={`View ${record.label}`}
						className="min-w-0 rounded text-left hover:underline focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none"
						onClick={() => onOpen(viewerTarget)}
						type="button">
						{labelBlock}
					</button>
				) : (
					<div className="min-w-0">{labelBlock}</div>
				)}
				<div className="flex shrink-0 flex-wrap items-center gap-1.5">
					{skipped ? <Badge tone="neutral">skipped</Badge> : null}
					<Badge tone={status.tone}>{status.label}</Badge>
					<Badge tone={severityTone(record.severity)}>{record.severity}</Badge>
					{onToggleSkip ? (
						<Button
							aria-label={
								skipped ? `Restore ${record.label}` : `Mark ${record.label} as N/A`
							}
							disabled={disabled}
							onClick={() => onToggleSkip(record.label, !skipped)}
							title={skipped ? 'Restore artifact' : 'Mark as N/A'}
							variant="ghost">
							{skipped ? (
								<>
									<RotateCcw className="h-3.5 w-3.5" />
									Restore
								</>
							) : (
								<>
									<Ban className="h-3.5 w-3.5" />
									N/A
								</>
							)}
						</Button>
					) : null}
				</div>
			</div>
			<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
				<span>
					<span className="font-medium text-neutral-500">State:</span>{' '}
					{record.exists ? 'present' : 'missing'}
				</span>
				<span>
					<span className="font-medium text-neutral-500">Modified:</span>{' '}
					{record.mtime
						? `${formatDate(record.mtime)} (${formatRelativeAge(record.mtime)})`
						: '—'}
				</span>
				<span>
					<span className="font-medium text-neutral-500">Age:</span>{' '}
					{record.ageDays === null
						? '—'
						: `${record.ageDays} day${record.ageDays === 1 ? '' : 's'}`}
				</span>
				<span>
					<span className="font-medium text-neutral-500">Size:</span>{' '}
					{record.exists ? formatBytes(record.sizeBytes) : '—'}
				</span>
			</div>
		</div>
	);
}
