import type { WorkingTreeFile } from '../../../../api/types.ts';

import { Badge } from '../../../../components/ui/badge.tsx';
import { Card } from '../../../../components/ui/card.tsx';
import { describeWorkingTreeFile } from './workingTreeStatus.ts';

function StageColumn({ file }: { file: WorkingTreeFile }) {
	if (file.conflicted) return <span className="text-xs text-muted-foreground">—</span>;
	return (
		<span className="text-xs text-muted-foreground">
			{file.staged && file.unstaged ? 'Partly staged' : file.staged ? 'Staged' : 'Not staged'}
		</span>
	);
}

export function WorkingTreeTable({
	disabled,
	files,
	onToggleAll,
	onToggleFile,
	selected,
}: {
	disabled: boolean;
	files: WorkingTreeFile[];
	onToggleAll: () => void;
	onToggleFile: (path: string) => void;
	selected: ReadonlySet<string>;
}) {
	const allSelected = files.length > 0 && files.every((file) => selected.has(file.path));
	const someSelected = files.some((file) => selected.has(file.path));

	return (
		<Card className="hidden overflow-x-auto p-0 md:block">
			<table aria-label="Changed files" className="w-full min-w-[640px] text-left text-sm">
				<thead className="border-b border-border bg-muted text-xs text-muted-foreground uppercase">
					<tr>
						<th className="w-10 px-3 py-3" scope="col">
							<input
								aria-label="Select all changed files"
								checked={allSelected}
								disabled={disabled || files.length === 0}
								onChange={onToggleAll}
								ref={(el) => {
									if (el) el.indeterminate = someSelected && !allSelected;
								}}
								type="checkbox"
							/>
						</th>
						<th className="px-3 py-3" scope="col">
							File
						</th>
						<th className="w-40 px-3 py-3" scope="col">
							Change
						</th>
						<th className="w-32 px-3 py-3" scope="col">
							Index
						</th>
					</tr>
				</thead>
				<tbody>
					{files.length === 0 ? (
						<tr>
							<td
								className="px-3 py-6 text-center text-sm text-muted-foreground"
								colSpan={4}>
								The working tree is clean — nothing to stage, discard, or commit.
							</td>
						</tr>
					) : null}
					{files.map((file) => {
						const status = describeWorkingTreeFile(file);
						return (
							<tr className="border-b border-border last:border-0" key={file.path}>
								<td className="px-3 py-3">
									<input
										aria-label={`Select ${file.path}`}
										checked={selected.has(file.path)}
										disabled={disabled}
										onChange={() => onToggleFile(file.path)}
										type="checkbox"
									/>
								</td>
								<td className="px-3 py-3">
									<div className="font-mono text-xs break-all text-foreground">
										{file.path}
									</div>
									{file.origPath ? (
										<div className="font-mono text-xs break-all text-muted-foreground">
											was {file.origPath}
										</div>
									) : null}
								</td>
								<td className="px-3 py-3">
									<span title={status.detail}>
										<Badge tone={status.tone}>{status.label}</Badge>
									</span>
								</td>
								<td className="px-3 py-3">
									<StageColumn file={file} />
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</Card>
	);
}
