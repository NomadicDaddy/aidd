import { Link } from 'react-router';

import type { ProjectReportsResponse } from '../../../api/types.ts';

import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Tooltip } from '../../../components/ui/tooltip.tsx';
import { reportOriginLabel, reportStatusTone } from './reportsUtils.ts';

type ReportRow = ProjectReportsResponse['bugs'][number];

/** The narrow half of the Reports tab; `ReportsDesktopTable` is the wide one, gated at the same `xl`. */
export function ReportsMobileList({
	onSelectFeature,
	reports,
}: {
	onSelectFeature: (directory: string) => void;
	reports: ReportRow[];
}) {
	return (
		<div className="space-y-3 xl:hidden">
			{reports.map((report) => {
				const featureDirectory = report.featureDirectory;
				return (
					<Card key={report.id}>
						{/* The age travels with the badges rather than being pushed to the far
					    edge: at 768 `justify-between` dropped it onto its own line above the
					    description, where it read as a third undifferentiated metadata line. */}
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<Badge tone={reportStatusTone(report.status)}>{report.status}</Badge>
							<Badge tone="neutral">
								{report.kind === 'bug' ? 'remediation' : 'feature'}
							</Badge>
							{featureDirectory ? (
								<button
									className="font-mono text-xs text-muted-foreground hover:text-foreground max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
									onClick={() => onSelectFeature(featureDirectory)}
									type="button">
									{featureDirectory}
								</button>
							) : (
								<span className="font-mono text-xs text-muted-foreground">
									{report.featureId ?? report.id}
								</span>
							)}
							<span className="text-xs text-muted-foreground">
								<RelativeAge value={report.createdAt} />
							</span>
						</div>
						{/* A description is a paragraph someone typed into a bug form; the longest in
					    the corpus runs 280 characters. Uncapped it took the card's full width,
					    which at 1279 is a single 150-character line. */}
						<p className="mt-3 max-w-[70ch] text-sm whitespace-pre-wrap text-foreground">
							{report.description}
						</p>
						{report.classificationReason || report.metadata?.pathname ? (
							<div className="mt-3 flex max-w-[70ch] flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
								{report.classificationReason ? (
									<span>
										<span className="font-medium">Classified:</span>{' '}
										{report.classificationReason}
									</span>
								) : null}
								{report.metadata?.pathname ? (
									<Tooltip content={report.metadata.pathname}>
										<Link
											className="hover:text-foreground max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
											to={report.metadata.pathname}>
											<span className="font-medium">Reported from:</span>{' '}
											{reportOriginLabel(report.metadata.pathname)}
										</Link>
									</Tooltip>
								) : null}
							</div>
						) : null}
					</Card>
				);
			})}
		</div>
	);
}
