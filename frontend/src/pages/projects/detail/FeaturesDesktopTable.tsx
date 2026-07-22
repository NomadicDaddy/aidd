import type {
	ProjectFeature,
	ProjectFeatureStatus,
	ProjectRoadmapSummary,
} from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { FeatureActions, FeatureMilestoneControl } from './FeatureRowControls.tsx';
import { featureDirectory, featureSourceLabel } from './featuresUtils.ts';
import { statusTone, stringValue } from './shared.ts';

export function FeaturesDesktopTable({
	decisions,
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
		<div className="hidden overflow-x-auto md:block">
			<table aria-label="Project features" className="w-full table-fixed text-left text-sm">
				<colgroup>
					<col className="w-[22%]" />
					<col className="w-[11%]" />
					<col className="w-[14%]" />
					<col className="w-[8%]" />
					<col className="w-[8%]" />
					<col className="w-[15%]" />
					<col className="w-[22%]" />
				</colgroup>
				<thead className="border-b bg-neutral-50 text-xs text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-900">
					<tr>
						<th className="px-4 py-3" scope="col">
							Feature
						</th>
						<th className="px-4 py-3" scope="col">
							Status
						</th>
						<th className="px-4 py-3" scope="col">
							Milestone
						</th>
						<th className="px-4 py-3" scope="col">
							Priority
						</th>
						<th className="px-4 py-3" scope="col">
							Passes
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
								className="border-b transition-colors last:border-0 hover:bg-cyan-50/60 dark:border-neutral-800 dark:hover:bg-cyan-950/20"
								key={id}>
								<td className="px-4 py-3">
									<div className="min-w-0">
										<div className="font-medium text-neutral-950 dark:text-neutral-50">
											{title}
										</div>
										<div className="text-xs break-all text-neutral-500">
											{id}
										</div>
									</div>
								</td>
								<td className="px-4 py-3">
									<Badge tone={statusTone(status)}>{status}</Badge>
								</td>
								<td className="px-4 py-3">
									<FeatureMilestoneControl
										disabled={isMutating}
										feature={feature}
										milestoneOptions={milestoneOptions}
										onChange={(milestone) =>
											onMilestoneChange(feature, milestone)
										}
										roadmap={roadmap}
									/>
								</td>
								<td className="px-4 py-3">{String(feature.priority ?? '—')}</td>
								<td className="px-4 py-3">
									{feature.passes === true ? (
										<Badge tone="emerald">yes</Badge>
									) : (
										<Badge tone="neutral">no</Badge>
									)}
								</td>
								<td className="px-4 py-3 text-xs break-words text-neutral-600 dark:text-neutral-400">
									{source}
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
		</div>
	);
}
