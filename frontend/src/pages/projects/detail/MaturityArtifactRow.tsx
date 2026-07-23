import { default as Ban } from 'lucide-react/dist/esm/icons/ban';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';

import type { MaturityArtifact } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { formatRelativeAge } from '../../../lib/formatters.ts';
import { artifactStatusLabel, artifactTone } from './maturityOverviewUtils.ts';

interface MaturityArtifactRowProps {
	artifact: MaturityArtifact;
	disabled: boolean;
	onToggleSkip?: ((slug: string, skip: boolean) => void) | undefined;
}

export function MaturityArtifactRow({
	artifact,
	disabled,
	onToggleSkip,
}: MaturityArtifactRowProps) {
	const skipped = artifact.status === 'skipped';
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 px-2.5 py-1.5 dark:border-neutral-800">
			<div className="flex min-w-0 items-center gap-2">
				<span className="truncate font-mono text-xs text-neutral-700 dark:text-neutral-300">
					{artifact.slug}
				</span>
				<span className="truncate text-xs text-neutral-500">{artifact.label}</span>
			</div>
			<div className="flex shrink-0 items-center gap-1.5">
				<Badge tone={artifactTone(artifact)}>{artifactStatusLabel(artifact)}</Badge>
				{artifact.required ? <Badge tone="cyan">required</Badge> : null}
				{artifact.mtime ? (
					<span className="text-xs text-neutral-500">
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
