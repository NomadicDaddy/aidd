import type { MaturityDetail, ProjectArtifactRecord } from '../../../api/types.ts';

import { ArtifactRow } from './ArtifactRow.tsx';
import { groupRecordsByStage } from './artifactsUtils.ts';

interface ArtifactGroupsProps {
	disabled: boolean;
	maturity: MaturityDetail | null;
	onOpen?: ((record: ProjectArtifactRecord) => void) | undefined;
	onToggleSkip?: ((slug: string, skip: boolean) => void) | undefined;
	records: ProjectArtifactRecord[];
	skipSet: Set<string>;
}

export function ArtifactGroups({
	disabled,
	maturity,
	onOpen,
	onToggleSkip,
	records,
	skipSet,
}: ArtifactGroupsProps) {
	if (!maturity) {
		return (
			<div className="flex flex-col gap-2">
				{records.map((record) => (
					<ArtifactRow
						disabled={disabled}
						key={record.label}
						onOpen={onOpen}
						record={record}
						skipped={skipSet.has(record.label)}
					/>
				))}
			</div>
		);
	}
	const { groups, order, ungrouped } = groupRecordsByStage(records, maturity);
	const stageBlocks: { label: string; records: ProjectArtifactRecord[] }[] = order
		.map((label) => ({ label, records: groups.get(label) ?? [] }))
		.filter((block) => block.records.length > 0);
	return (
		<div className="space-y-4">
			{stageBlocks.map((block) => (
				<div key={block.label}>
					<h4 className="mb-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
						{block.label}
					</h4>
					<div className="flex flex-col gap-2">
						{block.records.map((record) => (
							<ArtifactRow
								disabled={disabled}
								key={record.label}
								onOpen={onOpen}
								onToggleSkip={onToggleSkip}
								record={record}
								skipped={skipSet.has(record.label)}
							/>
						))}
					</div>
				</div>
			))}
			{ungrouped.length > 0 ? (
				<div>
					<h4 className="mb-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
						Other artifacts
					</h4>
					<div className="flex flex-col gap-2">
						{ungrouped.map((record) => (
							<ArtifactRow
								disabled={disabled}
								key={record.label}
								onOpen={onOpen}
								record={record}
								skipped={skipSet.has(record.label)}
							/>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}
