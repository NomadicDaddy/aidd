import { default as Ban } from 'lucide-react/dist/esm/icons/ban';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';

import type { MaturityAuditEntry } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { formatRelativeAge } from '../../../lib/formatters.ts';
import {
	auditFreshnessTitle,
	auditFreshnessTone,
	auditRunTone,
	describeAuditAgeDays,
} from './maturityOverviewUtils.ts';

interface MaturityAuditRowProps {
	disabled: boolean;
	entry: MaturityAuditEntry;
	onRun: (auditName: string) => void;
	onToggleSkip: (slug: string, skip: boolean) => void;
}

export function MaturityAuditRow({ disabled, entry, onRun, onToggleSkip }: MaturityAuditRowProps) {
	const skipSlug = `audit:${entry.auditName}`;
	const skipped = entry.skipped;
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
			<div className="flex min-w-0 items-center gap-2">
				<span className="truncate font-mono text-xs text-foreground">
					{entry.auditName}
				</span>
			</div>
			<div className="flex shrink-0 items-center gap-1.5">
				{skipped ? (
					<Badge tone="neutral">skipped</Badge>
				) : (
					<>
						<span title={auditFreshnessTitle(entry)}>
							<Badge tone={auditFreshnessTone(entry.freshness)}>
								{entry.freshness}
							</Badge>
						</span>
						{describeAuditAgeDays(entry.ageDays) ? (
							<span className="text-xs text-muted-foreground">
								{describeAuditAgeDays(entry.ageDays)}
							</span>
						) : null}
						<Badge tone={auditRunTone(entry.lastRunStatus)}>
							{entry.lastRunStatus ?? 'never run'}
						</Badge>
						{entry.lastReportAt ? (
							<span className="text-xs text-muted-foreground">
								{formatRelativeAge(entry.lastReportAt)}
							</span>
						) : null}
					</>
				)}
				{skipped ? null : (
					<Button
						disabled={disabled}
						onClick={() => onRun(entry.auditName)}
						size="compact"
						title={`Run ${entry.auditName} audit`}
						variant="ghost">
						<Play className="h-3.5 w-3.5" />
						Run
					</Button>
				)}
				<Button
					disabled={disabled}
					onClick={() => onToggleSkip(skipSlug, !skipped)}
					size="compact"
					title={skipped ? 'Restore audit' : 'Mark audit as not applicable'}
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
			</div>
		</div>
	);
}
