import type { ReactNode } from 'react';

import { Link } from 'react-router';

import type { ProjectFeature, ProjectReportsResponse } from '../../../api/types.ts';

import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { SortableColumnHeader } from '../../../components/shared/SortableColumnHeader.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Tooltip } from '../../../components/ui/tooltip.tsx';
import { useViewportFill, viewportFillScrollerClass } from '../../../hooks/useViewportFill.ts';
import { interactiveTableRowClass, tableHeadClass } from '../../../lib/tableStyles.ts';
import { touchTargetTextClass } from '../../../lib/touchTarget.ts';
import { featureDirectory as projectFeatureDirectory } from './featuresUtils.ts';
import {
	reportOriginLabel,
	type ReportSort,
	type ReportSortKey,
	reportStatusTone,
} from './reportsUtils.ts';

type ReportRow = ProjectReportsResponse['bugs'][number];

function ReportsTableRow({
	feature,
	onSelectFeature,
	report,
}: {
	feature: ProjectFeature | undefined;
	onSelectFeature: (directory: string) => void;
	report: ReportRow;
}) {
	const identifier = report.featureDirectory ?? report.featureId ?? report.id;
	const featureDirectory = report.featureDirectory;
	return (
		<tr className={`border-b border-border last:border-0 ${interactiveTableRowClass}`}>
			<td className="px-3 py-2.5 align-top">
				<Badge tone={reportStatusTone(report.status)}>{report.status}</Badge>
				{feature?.shippedVersion ? (
					<code
						className="mt-1 block font-mono text-xs whitespace-nowrap text-muted-foreground"
						title={`Shipped version ${feature.shippedVersion}`}>
						v{feature.shippedVersion}
					</code>
				) : null}
			</td>
			<td className="px-3 py-2.5 align-top">
				<Tooltip
					content={
						report.classificationReason
							? `Classified: ${report.classificationReason}`
							: undefined
					}
					disclosure
					disclosureLabel={`Explain ${report.kind === 'bug' ? 'remediation' : 'feature'} classification`}>
					<span className={`group ${touchTargetTextClass}`}>
						<Badge
							className="transition-colors group-hover:bg-accent-muted"
							tone="neutral">
							{report.kind === 'bug' ? 'remediation' : 'feature'}
						</Badge>
					</span>
				</Tooltip>
				{report.classificationReason ? (
					<span className="sr-only">Classified: {report.classificationReason}</span>
				) : null}
			</td>
			<td className="px-3 py-2.5 align-top">
				<div className="flex min-w-0 flex-col gap-1">
					<Tooltip content={report.description}>
						<p className="line-clamp-2 font-medium text-foreground">
							{report.description}
						</p>
					</Tooltip>
					<Tooltip content={identifier}>
						{featureDirectory ? (
							<button
								className={`block max-w-full cursor-pointer truncate font-mono text-xs text-muted-foreground underline decoration-muted-foreground/70 decoration-dotted underline-offset-4 hover:text-foreground ${touchTargetTextClass}`}
								onClick={() => onSelectFeature(featureDirectory)}
								type="button">
								{identifier}
							</button>
						) : (
							<span className="block max-w-full truncate font-mono text-xs text-muted-foreground">
								{identifier}
							</span>
						)}
					</Tooltip>
				</div>
			</td>
			<td className="px-3 py-2.5 align-top text-xs whitespace-nowrap text-muted-foreground">
				<RelativeAge value={report.createdAt} />
			</td>
			<td className="px-3 py-2.5 align-top text-xs whitespace-nowrap text-muted-foreground">
				{feature?.updatedAt ? <RelativeAge value={feature.updatedAt} /> : '—'}
			</td>
			<td className="px-3 py-2.5 align-top text-xs text-muted-foreground">
				{report.metadata?.pathname ? (
					<Tooltip content={report.metadata.pathname}>
						<Link
							className={`block max-w-full cursor-pointer truncate underline decoration-muted-foreground/70 decoration-dotted underline-offset-4 hover:text-foreground ${touchTargetTextClass}`}
							to={report.metadata.pathname}>
							{reportOriginLabel(report.metadata.pathname)}
						</Link>
					</Tooltip>
				) : (
					'—'
				)}
			</td>
		</tr>
	);
}

/**
 * The wide half of the Reports tab, gated and contained the way the Audits catalog beside it is.
 *
 * As 24 separate cards — 115px each for three short lines, the right 45% of every one of them
 * empty — the shorter of this page's two catalogs was four screens long while the longer one fit in
 * a viewport. `ReportsMobileList` is the narrow half; the two must stay gated at the same `xl`.
 */
export function ReportsDesktopTable({
	features,
	footer,
	onSelectFeature,
	onSort,
	reports,
	sort,
}: {
	features: ProjectFeature[];
	footer: ReactNode;
	onSelectFeature: (directory: string) => void;
	onSort: (key: ReportSortKey) => void;
	reports: ReportRow[];
	sort: ReportSort;
}) {
	const tableRef = useViewportFill<HTMLDivElement>({ gutterPx: 76, refreshKey: reports });

	return (
		<Card className="hidden p-0 xl:block">
			<OverflowScroller
				ariaLabel="Project reports"
				rootRef={tableRef}
				scrollerClassName={viewportFillScrollerClass}>
				<table
					aria-label="Project reports"
					className="w-full min-w-[64rem] table-fixed text-left text-sm">
					<colgroup>
						<col className="w-24" />
						<col className="w-24" />
						<col />
						<col className="w-24" />
						<col className="w-28" />
						<col className="w-80" />
					</colgroup>
					<thead className={tableHeadClass}>
						<tr>
							<SortableColumnHeader
								activeDir={sort.direction}
								activeKey={sort.key}
								className="px-3 py-3"
								label="Status"
								onSort={onSort}
								sortKey="status"
							/>
							<SortableColumnHeader
								activeDir={sort.direction}
								activeKey={sort.key}
								className="px-3 py-3"
								label="Kind"
								onSort={onSort}
								sortKey="kind"
							/>
							<th className="px-3 py-3" scope="col">
								Report
							</th>
							<SortableColumnHeader
								activeDir={sort.direction}
								activeKey={sort.key}
								className="px-3 py-3"
								label="Filed"
								onSort={onSort}
								sortKey="filed"
							/>
							<th className="px-3 py-3" scope="col">
								Feature updated
							</th>
							<th className="px-3 py-3" scope="col">
								Reported from
							</th>
						</tr>
					</thead>
					<tbody>
						{reports.map((report) => (
							<ReportsTableRow
								feature={features.find(
									(feature) =>
										projectFeatureDirectory(feature) ===
										report.featureDirectory,
								)}
								key={report.id}
								onSelectFeature={onSelectFeature}
								report={report}
							/>
						))}
					</tbody>
				</table>
			</OverflowScroller>
			{footer}
		</Card>
	);
}
