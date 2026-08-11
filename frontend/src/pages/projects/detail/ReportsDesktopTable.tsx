import type { ProjectReportsResponse } from '../../../api/types.ts';

import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { tableHeadClass, tableMeasureClass } from '../../../lib/tableStyles.ts';
import { reportOriginLabel, reportStatusTone } from './reportsUtils.ts';

type ReportRow = ProjectReportsResponse['bugs'][number];

function ReportsTableRow({ report }: { report: ReportRow }) {
	return (
		<tr className="border-b border-border last:border-0">
			<td className="px-3 py-2.5 align-top">
				<Badge tone={reportStatusTone(report.status)}>{report.status}</Badge>
			</td>
			<td className="px-3 py-2.5 align-top">
				<Badge tone="neutral">{report.kind === 'bug' ? 'remediation' : 'feature'}</Badge>
			</td>
			<td className="px-3 py-2.5 align-top font-mono text-xs text-muted-foreground">
				{report.featureDirectory ?? report.featureId ?? report.id}
			</td>
			{/* Two lines, with the whole text on `title`. A report's description is a paragraph
			    written by whoever filed it — one of them runs 280 characters — and uncapped it set
			    the height of its row, which is what made a 24-item list four screens long. */}
			<td className="px-3 py-2.5 align-top">
				<p className="line-clamp-2 whitespace-pre-wrap" title={report.description}>
					{report.description}
				</p>
				{report.classificationReason ? (
					<p className="mt-0.5 text-2xs text-muted-foreground">
						<span className="font-medium">Classified:</span>{' '}
						{report.classificationReason}
					</p>
				) : null}
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
		<Card className="hidden max-h-[calc(100dvh-16rem)] overflow-auto p-0 xl:block">
			<table
				aria-label="Project reports"
				className={`w-full min-w-[52rem] text-left text-sm ${tableMeasureClass}`}>
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
							Description
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
