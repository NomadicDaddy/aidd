import type { WorkingTreeFile } from '../../../../api/types.ts';

import { EmptyState } from '../../../../components/shared/EmptyState.tsx';
import { Badge } from '../../../../components/ui/badge.tsx';
import { Card } from '../../../../components/ui/card.tsx';
import { Checkbox } from '../../../../components/ui/checkbox.tsx';
import { describeWorkingTreeFile } from './workingTreeStatus.ts';

// Narrow-content counterpart to WorkingTreeTable — the table starts at `xl:`.
export function WorkingTreeList({
	disabled,
	files,
	onToggleFile,
	selected,
}: {
	disabled: boolean;
	files: WorkingTreeFile[];
	onToggleFile: (path: string) => void;
	selected: ReadonlySet<string>;
}) {
	if (files.length === 0) {
		return (
			<div className="xl:hidden">
				<EmptyState>
					The working tree is clean — nothing to stage, discard, or commit.
				</EmptyState>
			</div>
		);
	}
	return (
		<div className="space-y-2 xl:hidden">
			{files.map((file) => {
				const status = describeWorkingTreeFile(file);
				return (
					<Card key={file.path} variant="panel">
						<label className="flex items-start gap-3 max-sm:min-h-11">
							<Checkbox
								aria-label={`Select ${file.path}`}
								checked={selected.has(file.path)}
								className="mt-1"
								disabled={disabled}
								onChange={() => onToggleFile(file.path)}
							/>
							<span className="min-w-0 flex-1">
								<span className="block font-mono text-xs break-all text-foreground">
									{file.path}
								</span>
								{file.origPath ? (
									<span className="block font-mono text-xs break-all text-muted-foreground">
										was {file.origPath}
									</span>
								) : null}
								<span className="mt-2 flex flex-wrap items-center gap-2">
									<Badge tone={status.tone}>{status.label}</Badge>
									<span className="text-xs text-muted-foreground">
										{file.conflicted
											? 'Conflicted'
											: file.staged && file.unstaged
												? 'Partly staged'
												: file.staged
													? 'Staged'
													: 'Not staged'}
									</span>
								</span>
							</span>
						</label>
					</Card>
				);
			})}
		</div>
	);
}
