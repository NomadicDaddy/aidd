import type { ProjectReportsResponse } from '../../../api/types.ts';

import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { tableHeadClass, tableMeasureClass } from '../../../lib/tableStyles.ts';
import { reportOriginLabel, reportStatusTone } from './reportsUtils.ts';

type ReportRow = ProjectReportsResponse['bugs'][number];

function ReportsTableRow({ report }: { report: ReportRow }) {
	const identifier = report.featureDirectory ?? report.featureId ?? report.id;
	return (
		<tr className="border-b border-border last:border-0">
			<td className="px-3 py-2.5 align-top">
				<Badge tone={reportStatusTone(report.status)}>{report.status}</Badge>
			</td>
			<td
				className="px-3 py-2.5 align-top"
				title={
					report.classificationReason
						? `Classified: ${report.classificationReason}`
						: undefined
				}>
				<Badge tone="neutral">{report.kind === 'bug' ? 'remediation' : 'feature'}</Badge>
				{report.classificationReason ? (
					<span className="sr-only">Classified: {report.classificationReason}</span>
				) : null}
			</td>
			<td className="px-3 py-2.5 align-top">
				<div className="min-w-0">
					<p className="truncate font-medium text-foreground" title={report.description}>
						{report.description}
					</p>
					<p
						className="truncate font-mono text-xs text-muted-foreground"
						title={identifier}>
						{identifier}
					</p>
				</div>
			</td>
			<td className="px-3 py-2.5 align-top text-xs whitespace-nowrap text-muted-foreground">
				<RelativeAge value={report.createdAt} />
			</td>
			<td className="px-3 py-2.5 align-top text-xs text-muted-foreground">
				{report.metadata?.pathname ? (
					<span title={report.metadata.pathname}>
						{reportOriginLabel(report.metadata.pathname)}
					</span>
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
export function ReportsDesktopTable({ reports }: { reports: ReportRow[] }) {
	return (
		<Card
			className={`hidden max-h-[calc(100dvh-16rem)] overflow-auto p-0 xl:block ${tableMeasureClass}`}>
			<table
				aria-label="Project reports"
				className="w-full min-w-[52rem] table-fixed text-left text-sm">
				<colgroup>
					<col className="w-[12%]" />
					<col className="w-[14%]" />
					<col className="w-[43%]" />
					<col className="w-[13%]" />
					<col className="w-[18%]" />
				</colgroup>
				<thead className={`${tableHeadClass} sticky top-0 z-10`}>
					<tr>
						<th className="px-3 py-3" scope="col">
							Status
						</th>
						<th className="px-3 py-3" scope="col">
							Kind
						</th>
						<th className="px-3 py-3" scope="col">
							Report
						</th>
						<th className="px-3 py-3" scope="col">
							Filed
						</th>
						<th className="px-3 py-3" scope="col">
							Reported from
						</th>
					</tr>
				</thead>
				<tbody>
					{reports.map((report) => (
						<ReportsTableRow key={report.id} report={report} />
					))}
				</tbody>
			</table>
		</Card>
	);
}
