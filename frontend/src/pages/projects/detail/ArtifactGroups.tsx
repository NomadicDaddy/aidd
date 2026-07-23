import type { MaturityDetail, ProjectArtifactRecord } from '../../../api/types.ts';

import { ArtifactRow } from './ArtifactRow.tsx';
import { buildArtifactInventory } from './artifactsUtils.ts';
import { MaturityArtifactRow } from './MaturityArtifactRow.tsx';

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
	const inventory = buildArtifactInventory(records, maturity);
	return (
		<div className="space-y-4">
			{inventory.groups.map((group) => (
				<div key={group.id}>
					<h4 className="mb-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
						{group.label} ({group.entries.length})
					</h4>
					<div className="flex flex-col gap-2">
						{group.entries.map(({ artifact, record }) =>
							record ? (
								<ArtifactRow
									disabled={disabled}
									key={artifact.slug}
									onOpen={onOpen}
									onToggleSkip={onToggleSkip}
									record={record}
									skipped={skipSet.has(artifact.slug)}
								/>
							) : (
								<MaturityArtifactRow
									artifact={artifact}
									disabled={disabled}
									key={artifact.slug}
									onToggleSkip={onToggleSkip}
								/>
							)
						)}
					</div>
				</div>
			))}
			{inventory.ungrouped.length > 0 ? (
				<div>
					<h4 className="mb-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
						Other artifacts ({inventory.ungrouped.length})
					</h4>
					<div className="flex flex-col gap-2">
						{inventory.ungrouped.map((record) => (
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
