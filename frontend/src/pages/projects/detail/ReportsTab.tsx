import type { ProjectReportsResponse } from '../../../api/types.ts';

import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { formatRelativeAge } from '../../../lib/formatters.ts';

export function ReportsTab({
	isError,
	isLoading,
	reports,
}: {
	isError: boolean;
	isLoading: boolean;
	reports: ProjectReportsResponse | undefined;
}) {
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

	return (
		<div className="space-y-3">
			{items
				.slice()
				.reverse()
				.map((report) => (
					<Card key={report.id}>
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="flex flex-wrap items-center gap-2">
								<Badge tone={report.kind === 'bug' ? 'red' : 'cyan'}>
									{report.kind === 'bug' ? 'remediation' : 'feature'}
								</Badge>
								<Badge tone="neutral">{report.status}</Badge>
								<span className="font-mono text-xs text-neutral-500">
									{report.featureDirectory ?? report.featureId ?? report.id}
								</span>
							</div>
							<span className="text-xs text-neutral-500">
								{formatRelativeAge(report.createdAt)}
							</span>
						</div>
						<p className="mt-3 text-sm whitespace-pre-wrap text-neutral-800 dark:text-neutral-200">
							{report.description}
						</p>
						{report.classificationReason || report.metadata?.pathname ? (
							<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
								{report.classificationReason ? (
									<span>{report.classificationReason}</span>
								) : null}
								{report.metadata?.pathname ? (
									<span>{report.metadata.pathname}</span>
								) : null}
							</div>
						) : null}
					</Card>
				))}
		</div>
	);
}
