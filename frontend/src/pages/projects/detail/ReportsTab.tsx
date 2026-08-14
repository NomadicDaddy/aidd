import { useState } from 'react';

import type { ProjectReportsResponse } from '../../../api/types.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { SegmentedControl } from '../../../components/ui/segmented-control.tsx';
import { ReportsDesktopTable } from './ReportsDesktopTable.tsx';
import { ReportsMobileList } from './ReportsMobileList.tsx';

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
		return (
			<div className="space-y-3">
				<h2 className="sr-only">Reports</h2>
				<LoadingState message="Loading reports…" />
			</div>
		);
	}

	if (isError) {
		return (
			<div className="space-y-3">
				<h2 className="sr-only">Reports</h2>
				<ErrorState message="Could not load project reports." />
			</div>
		);
	}

	const items = reports?.bugs ?? [];
	if (items.length === 0) {
		return (
			<div className="space-y-3">
				<h2 className="sr-only">Reports</h2>
				<EmptyState>No reports filed for this project.</EmptyState>
			</div>
		);
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
			<h2 className="sr-only">Reports</h2>
			{/* Carded, like the header on the Audits tab beside it. The tab used to open straight
			    into an unlabelled stack of cards; the header that fixed that was then the one
			    control group on the whole surface floating on the bare page background. */}
			<Card>
				<CardHeader
					action={
						<SegmentedControl<ReportKindFilter>
							ariaLabel="Filter reports by kind"
							onChange={setKind}
							options={[
								{ label: `All (${ordered.length})`, value: 'all' },
								{
									label: `Remediation (${counts.remediation})`,
									value: 'remediation',
								},
								{ label: `Feature (${counts.feature})`, value: 'feature' },
							]}
							value={kind}
						/>
					}
					className="mb-0"
					headingLevel={3}
					title="Project reports"
				/>
			</Card>
			{visible.length === 0 ? (
				<EmptyState>No reports match the selected kind.</EmptyState>
			) : (
				<>
					<ReportsDesktopTable reports={visible} />
					<ReportsMobileList reports={visible} />
				</>
			)}
		</div>
	);
}
