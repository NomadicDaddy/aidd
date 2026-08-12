import type { MaturityDetail, ProjectArtifactRecord } from '../../../api/types.ts';

import { cn } from '../../../lib/cn.ts';
import { microLabelClass } from '../../../lib/typography.ts';
import { ArtifactRow } from './ArtifactRow.tsx';
import { type ArtifactViewerTarget, buildArtifactInventory } from './artifactsUtils.ts';
import { MaturityArtifactRow } from './MaturityArtifactRow.tsx';

/** Above this many entries a group scrolls inside itself rather than pushing the tab down. */
const LONG_GROUP = 12;

/**
 * A group heading, one declared step under the section caption that heads the inventory.
 *
 * It used to be a local copy of that caption's own utilities, so `ARTIFACT INVENTORY (56)` and
 * `SPECIFIED (3)` directly beneath it computed identically — 12px, weight 600, the same grey — and
 * the h3/h4 nesting that exists in the accessibility tree was invisible on screen. The colour is not
 * part of `microLabelClass` on purpose: a field label elsewhere carries its own tone.
 */
const groupHeadingClass = `mb-1.5 text-muted-foreground ${microLabelClass}`;

interface ArtifactGroupsProps {
	disabled: boolean;
	maturity: MaturityDetail | null;
	onOpen?: ((target: ArtifactViewerTarget) => void) | undefined;
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
			{inventory.groups.map((group) => {
				// An invariant true of every row belongs in the heading, not repeated 39 times: the
				// AUDITED group is two viewport-heights of identical teal 'required' badges.
				const allRequired = group.entries.every(({ artifact }) => artifact.required);
				return (
					<div key={group.id}>
						<h4 className={groupHeadingClass}>
							{group.label} ({group.entries.length})
							{allRequired ? ' · all required' : ''}
						</h4>
						<div
							className={cn(
								'flex flex-col gap-2',
								group.entries.length > LONG_GROUP &&
									'max-h-[28rem] overflow-y-auto pr-1',
							)}>
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
										hideRequired={allRequired}
										key={artifact.slug}
										onOpen={onOpen}
										onToggleSkip={onToggleSkip}
									/>
								),
							)}
						</div>
					</div>
				);
			})}
			{inventory.ungrouped.length > 0 ? (
				<div>
					<h4 className={groupHeadingClass}>
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
