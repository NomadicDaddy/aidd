import { default as CircleDashed } from 'lucide-react/dist/esm/icons/circle-dashed';
import { default as Terminal } from 'lucide-react/dist/esm/icons/terminal';

import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { usePipelineSessionReport } from '../../hooks/usePipelineSessions.ts';
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
	sessionId,
}: {
	now: number;
	onSelectRun: (runId: string) => void;
	sessionId: string;
}) {
	// Per-session report; polls every 3s while the session is active (same load profile
	// as having its report page open). Instantiated only while this session is expanded.
	const report = usePipelineSessionReport(sessionId);
	if (report.isLoading) {
		return <p className="px-4 py-3 text-xs text-neutral-500">Loading steps…</p>;
	}
	if (!report.data) {
		return <p className="px-4 py-3 text-xs text-neutral-500">Step details are unavailable.</p>;
	}
	const rows = buildStepRows(report.data);
	if (rows.length === 0) {
		return <p className="px-4 py-3 text-xs text-neutral-500">No steps recorded yet.</p>;
	}
	return (
		<ol aria-label="Pipeline steps" className="divide-y dark:divide-neutral-800">
			{rows.map((row) => {
				if (row.kind === 'pending') {
					return (
						<li
							className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs text-neutral-500"
							key={`pending-${row.sequenceNumber}`}>
							<span className="w-6 text-right font-mono">{row.sequenceNumber}.</span>
							<Badge tone="neutral">
								<CircleDashed aria-hidden="true" className="h-3 w-3" />
								pending
							</Badge>
							<Badge tone="teal">{row.step.stepType}</Badge>
							<span className="text-neutral-500 dark:text-neutral-400">
								{row.step.name}
							</span>
						</li>
					);
				}
				const step = row.result;
				const anchor = step.depth === 0 && step.phase === 'step';
				return (
					<li
						className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs"
						key={step.id}
						style={{ paddingLeft: `${16 + Math.min(step.depth, 4) * 16}px` }}>
						<span className="w-6 text-right font-mono text-neutral-500">
							{anchor ? `${step.sequenceNumber}.` : '·'}
						</span>
						<Badge tone={stepTone(step.status)}>{step.status}</Badge>
						<Badge tone="teal">{step.stepType}</Badge>
						<span className="text-neutral-700 dark:text-neutral-200">
							{step.stepName}
						</span>
						<span className="text-neutral-500">
							{formatActiveDuration(step.durationMs, step.startedAt, now)}
						</span>
						{step.errorMessage && (
							<span className="max-w-[24rem] truncate text-red-700 dark:text-red-300">
								{step.errorMessage}
							</span>
						)}
						{step.runId && (
							<Button
								aria-label={`Show step ${step.stepName} run in Live Console`}
								onClick={() => onSelectRun(step.runId ?? '')}
								size="compact"
								title="Show in Live Console"
								variant="secondary">
								<Terminal aria-hidden="true" className="h-3 w-3" />
								Console
							</Button>
						)}
					</li>
				);
			})}
		</ol>
	);
}
