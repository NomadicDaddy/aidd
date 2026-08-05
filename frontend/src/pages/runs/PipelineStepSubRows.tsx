import { default as CircleDashed } from 'lucide-react/dist/esm/icons/circle-dashed';
import { default as Terminal } from 'lucide-react/dist/esm/icons/terminal';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { usePipelineSessionReport } from '../../hooks/usePipelineSessions.ts';
import { cn } from '../../lib/cn.ts';
import { formatActiveDuration } from '../../lib/formatters.ts';
import { stepTone } from '../pipelineSessions/StepOutput.tsx';
import { buildStepRows } from '../pipelineSessions/StepRows.tsx';

// Compact step list rendered inside an expanded pipeline row of the unified feed.
// Deliberately lighter than the report page's ExecutedStepRow: no per-step consoles
// (a WebSocket console per step inside a table is a performance hazard) — a step with
// a run instead selects that run in the page's shared Live Console. The report link
// on the session row remains the full-detail surface.
export function PipelineStepSubRows({
	now,
	onSelectRun,
	selectedRunId,
	sessionId,
}: {
	now: number;
	onSelectRun: (runId: string) => void;
	selectedRunId: string | undefined;
	sessionId: string;
}) {
	// Per-session report; polls every 3s while the session is active (same load profile
	// as having its report page open). Instantiated only while this session is expanded.
	const report = usePipelineSessionReport(sessionId);
	if (report.isLoading) {
		return <p className="px-4 py-3 text-xs text-muted-foreground">Loading steps…</p>;
	}
	if (!report.data) {
		return (
			<p className="px-4 py-3 text-xs text-muted-foreground">Step details are unavailable.</p>
		);
	}
	const rows = buildStepRows(report.data);
	if (rows.length === 0) {
		return <p className="px-4 py-3 text-xs text-muted-foreground">No steps recorded yet.</p>;
	}
	return (
		<ol aria-label="Pipeline steps" className="divide-y divide-border">
			{rows.map((row) => {
				if (row.kind === 'pending') {
					return (
						<li
							className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs text-muted-foreground xl:grid xl:grid-cols-[22fr_11fr_9fr_20fr_17fr_9fr_12fr] xl:gap-0 xl:px-0 xl:py-0"
							key={`pending-${row.sequenceNumber}`}>
							<div className="flex min-w-0 basis-full items-center gap-2 xl:px-4 xl:py-2">
								<span className="w-6 text-right font-mono">
									{row.sequenceNumber}.
								</span>
								<span className="truncate text-muted-foreground">
									{row.step.name}
								</span>
							</div>
							<span aria-hidden="true" className="hidden xl:block" />
							<div className="xl:px-3 xl:py-2">
								<Badge tone="teal">{row.step.stepType}</Badge>
							</div>
							<span className="hidden xl:block xl:px-3 xl:py-2">—</span>
							<div className="xl:px-3 xl:py-2">
								<Badge tone="neutral">
									<CircleDashed aria-hidden="true" className="h-3 w-3" />
									Pending
								</Badge>
							</div>
							<span className="hidden xl:block xl:px-3 xl:py-2">—</span>
							<span className="hidden xl:block xl:px-3 xl:py-2">—</span>
						</li>
					);
				}
				const step = row.result;
				const anchor = step.depth === 0 && step.phase === 'step';
				const selected = step.runId !== null && step.runId === selectedRunId;
				return (
					<li
						aria-current={selected ? 'true' : undefined}
						className={cn(
							'flex flex-wrap items-center gap-2 px-4 py-2 text-xs xl:grid xl:grid-cols-[22fr_11fr_9fr_20fr_17fr_9fr_12fr] xl:gap-0 xl:px-0 xl:py-0',
							selected &&
								'bg-teal-100/80 shadow-[inset_4px_0_0_var(--accent)] dark:bg-teal-900/40',
						)}
						key={step.id}>
						<div
							className="flex min-w-0 basis-full items-center gap-2 py-2 pr-3"
							style={{ paddingLeft: `${16 + Math.min(step.depth, 4) * 16}px` }}>
							<span className="w-6 shrink-0 text-right font-mono text-muted-foreground">
								{anchor ? `${step.sequenceNumber}.` : '·'}
							</span>
							<span className="truncate text-foreground">{step.stepName}</span>
						</div>
						<span aria-hidden="true" className="hidden xl:block" />
						<div className="xl:px-3 xl:py-2">
							<Badge tone="teal">{step.stepType}</Badge>
						</div>
						<div className="xl:px-3 xl:py-2">
							{step.executionIdentity ? (
								<ExecutionIdentityBadges {...step.executionIdentity} />
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</div>
						<div className="min-w-0 xl:px-3 xl:py-2">
							<Badge tone={stepTone(step.status)}>{step.status}</Badge>
							{step.errorMessage && (
								<p className="mt-1 truncate text-red-700 dark:text-red-300">
									{step.errorMessage}
								</p>
							)}
						</div>
						<span className="whitespace-nowrap text-muted-foreground xl:px-3 xl:py-2">
							{formatActiveDuration(step.durationMs, step.startedAt, now)}
						</span>
						<div className="xl:px-3 xl:py-2">
							{step.runId ? (
								<Button
									aria-label={`Show step ${step.stepName} run in Live Console`}
									aria-pressed={selected}
									onClick={() => onSelectRun(step.runId ?? '')}
									size="compact"
									title="Show in Live Console"
									variant={selected ? 'primary' : 'secondary'}>
									<Terminal aria-hidden="true" className="h-3 w-3" />
									Console
								</Button>
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</div>
					</li>
				);
			})}
		</ol>
	);
}
