import { useState } from 'react';

import type { ProjectReportsResponse } from '../../../api/types.ts';

import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { SegmentedControl } from '../../../components/ui/segmented-control.tsx';
import { formatRelativeAge } from '../../../lib/formatters.ts';
import { reportOriginLabel, reportStatusTone } from './reportsUtils.ts';

type ReportKindFilter = 'all' | 'feature' | 'remediation';

export function ReportsTab({
	isError,
	isLoading,
	reports,
}: {
	isError: boolean;
	isLoading: boolean;
	reports: ProjectReportsResponse | undefined;
}) {
	const [kind, setKind] = useState<ReportKindFilter>('all');
	if (isLoading) {
		return <LoadingState message="Loading reports…" />;
	}

	if (isError) {
		return <ErrorState message="Could not load project reports." />;
	}

	const items = reports?.bugs ?? [];
	if (items.length === 0) {
		return <Card>No reports filed for this project.</Card>;
	}
	const ordered = items.slice().reverse();
	const visible = ordered.filter((report) => {
		if (kind === 'all') return true;
		return (report.kind === 'bug' ? 'remediation' : 'feature') === kind;
	});
	const counts = {
		feature: ordered.filter((report) => report.kind !== 'bug').length,
		remediation: ordered.filter((report) => report.kind === 'bug').length,
	};

	return (
		<div className="space-y-3">
			{/* The tab used to open straight into an unlabelled stack of 21 cards — the one surface
			    on this page that never said what the reader was looking at or how much of it there
			    was. This is the section header every sibling tab already uses. */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-sm font-semibold text-foreground">Project reports</h2>
				<SegmentedControl<ReportKindFilter>
					ariaLabel="Filter reports by kind"
					onChange={setKind}
					options={[
						{ label: `All (${ordered.length})`, value: 'all' },
						{ label: `Remediation (${counts.remediation})`, value: 'remediation' },
						{ label: `Feature (${counts.feature})`, value: 'feature' },
					]}
					value={kind}
				/>
			</div>
			{visible.length === 0 ? (
				<Card>No reports match the selected kind.</Card>
			) : (
				visible.map((report) => (
					<Card key={report.id}>
						{/* The age travels with the badges rather than being pushed to the far
						    edge: at 768 `justify-between` dropped it onto its own line above the
						    description, where it read as a third undifferentiated metadata line. */}
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<Badge tone={reportStatusTone(report.status)}>{report.status}</Badge>
							<Badge tone="neutral">
								{report.kind === 'bug' ? 'remediation' : 'feature'}
							</Badge>
							<span className="font-mono text-xs text-muted-foreground">
								{report.featureDirectory ?? report.featureId ?? report.id}
							</span>
							<span className="text-xs text-muted-foreground">
								{formatRelativeAge(report.createdAt)}
							</span>
						</div>
						<p className="mt-3 text-sm whitespace-pre-wrap text-foreground">
							{report.description}
						</p>
						{report.classificationReason || report.metadata?.pathname ? (
							<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
								{report.classificationReason ? (
									<span>
										<span className="font-medium">Classified:</span>{' '}
										{report.classificationReason}
									</span>
								) : null}
								{report.metadata?.pathname ? (
									<span title={report.metadata.pathname}>
										<span className="font-medium">Reported from:</span>{' '}
										{reportOriginLabel(report.metadata.pathname)}
									</span>
								) : null}
							</div>
						) : null}
					</Card>
				))
			)}
		</div>
	);
}
