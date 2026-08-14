import type {
	ProjectFeature,
	ProjectFeatureStatus,
	ProjectRoadmapSummary,
} from '../../../api/types.ts';

import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import {
	FeatureActions,
	FeatureMilestoneControl,
	FeaturePriorityBadge,
} from './FeatureRowControls.tsx';
import {
	featureDirectory,
	featurePassesDisagrees,
	featureShippedVersion,
	featureSourceLabel,
} from './featuresUtils.ts';
import { statusTone, stringValue } from './shared.ts';

export function FeaturesDesktopTable({
	decisions,
	deemphasizePriority,
	isMutating,
	launchingFeature,
	milestoneOptions,
	onApprove,
	onDecisionChange,
	onDelete,
	onLaunchRun,
	onMilestoneChange,
	onSelect,
	onStatusChange,
	roadmap,
	rows,
	runActive,
}: {
	decisions: Record<string, string>;
	deemphasizePriority: boolean;
	isMutating: boolean;
	launchingFeature: null | string;
	milestoneOptions: string[];
	onApprove: (feature: ProjectFeature, decisionRequired: boolean) => void;
	onDecisionChange: (directory: string, value: string) => void;
	onDelete: (feature: ProjectFeature) => void;
	onLaunchRun: (feature: ProjectFeature) => void;
	onMilestoneChange: (feature: ProjectFeature, milestone: string) => void;
	onSelect: (feature: ProjectFeature) => void;
	onStatusChange: (feature: ProjectFeature, status: ProjectFeatureStatus) => void;
	roadmap: null | ProjectRoadmapSummary;
	rows: ProjectFeature[];
	runActive: boolean;
}) {
	return (
		<OverflowScroller ariaLabel="Project features" className="hidden @min-[80rem]:block">
			<table aria-label="Project features" className="w-full table-fixed text-left text-sm">
				{/* Actions carries up to five controls and had the same 14% as Milestone, which carries
				    one select. This cell is what sets the row height, so at 2321 — the width the defect
				    was reported at — a backlog row stood 141px tall and a waiting-approval row 181px
				    while Priority held 162px of width for a 30px badge. Below 1536 the cell was
				    narrower than its own widest single control and overflowed: 184px of `Approve with
				    decision` in 139px.

				    Two tiers, because a percentage is not a width. The floor on Shipped and Priority
				    is their own uppercase header — `PRIORITY` needs 72px and `SHIPPED` 68px, and a
				    single-word header cannot wrap — so 6% and 7% are affordable against a 2031px
				    table and not against a 990px one. Below 2xl they keep 8% and Actions takes what
				    Source can spare instead. Feature holds its 28% at both tiers: taking it to 26%
				    made the title wrap and handed the row-height job straight back to that column.

				    Status is deliberately untouched at 11%: that cell is already 19px short of a
				    `waiting_approval` badge at 1280, and paying for Actions out of it would deepen a
				    defect this change is not fixing.

				    The 2xl tier was then re-cut once more. At 2250 the table is 1960px and Actions took
				    549px of it to hold rows that, on a corpus whose features are nearly all completed,
				    render one `Details` button — while `Feature: Documentation` wrapped in a 157px
				    Source cell beside it. Feature and Source take 3% each off Actions there. Not the
				    19% the sweep proposed for Actions: a backlog row is Details + Launch run + a 156px
				    status select + delete, about 405px of controls, and 19% is 372px at 2250 — it would
				    put the widest row back on two lines at the one width where it currently fits on
				    one. 24% leaves 470px, which clears it, and the recovered 78px is the part of the
				    void that was actually free. */}
				<colgroup>
					<col className="w-[28%] 2xl:w-[29%]" />
					<col className="w-[11%]" />
					<col className="w-[8%] 2xl:w-[6%]" />
					<col className="w-[12%]" />
					<col className="w-[8%] 2xl:w-[7%]" />
					<col className="w-[8%] 2xl:w-[11%]" />
					<col className="w-[25%] 2xl:w-[24%]" />
				</colgroup>
				<thead className="border-b border-border bg-muted text-xs text-muted-foreground uppercase">
					<tr>
						<th className="px-4 py-3" scope="col">
							Feature
						</th>
						<th className="px-4 py-3" scope="col">
							Status
						</th>
						<th className="px-4 py-3" scope="col">
							Shipped
						</th>
						<th className="px-4 py-3" scope="col">
							Milestone
						</th>
						<th className="px-4 py-3" scope="col">
							Priority
						</th>
						<th className="px-4 py-3" scope="col">
							Source
						</th>
						<th className="px-4 py-3 whitespace-nowrap" scope="col">
							Actions
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((feature) => {
						const id = feature.id || stringValue(feature, 'id');
						const title = stringValue(feature, 'title') || id;
						const status = stringValue(feature, 'status') || 'unknown';
						const source = featureSourceLabel(feature);
						const directory = featureDirectory(feature);
						const decision = decisions[directory] ?? '';
						return (
							<tr
								className="group border-b border-border transition-colors last:border-0 hover:bg-muted/40"
								key={id}>
								<td className="px-4 py-3">
									<div className="min-w-0">
										<div className="font-medium text-foreground">{title}</div>
										<div
											className="truncate text-xs text-muted-foreground"
											title={id}>
											{id}
										</div>
									</div>
								</td>
								<td className="px-4 py-3">
									<div className="flex flex-wrap items-center gap-1">
										<Badge tone={statusTone(status)}>{status}</Badge>
										{featurePassesDisagrees(feature, status) ? (
											<Badge
												title="Feature status and passes flag disagree"
												tone="amber">
												not passing
											</Badge>
										) : null}
									</div>
								</td>
								<td className="px-4 py-3 font-mono text-xs text-muted-foreground">
									{featureShippedVersion(feature) ?? '—'}
								</td>
								<td className="px-4 py-3">
									<FeatureMilestoneControl
										disabled={isMutating}
										feature={feature}
										milestoneOptions={milestoneOptions}
										onChange={(milestone) =>
											onMilestoneChange(feature, milestone)
										}
										quiet
										roadmap={roadmap}
									/>
								</td>
								<td className="px-4 py-3">
									<FeaturePriorityBadge
										deemphasized={deemphasizePriority}
										priority={feature.priority}
									/>
								</td>
								<td
									className="px-4 py-3 text-xs text-muted-foreground"
									title={source}>
									{source.replaceAll('_', ' ')}
								</td>
								<td className="px-4 py-3">
									<FeatureActions
										decision={decision}
										disabled={isMutating}
										feature={feature}
										launching={launchingFeature === directory}
										onApprove={onApprove}
										onDecisionChange={(value) =>
											onDecisionChange(directory, value)
										}
										onDelete={onDelete}
										onLaunchRun={onLaunchRun}
										onSelect={onSelect}
										onStatusChange={onStatusChange}
										runActive={runActive}
										status={status}
									/>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</OverflowScroller>
	);
}
