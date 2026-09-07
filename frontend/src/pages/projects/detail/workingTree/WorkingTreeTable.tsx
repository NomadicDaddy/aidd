import type { WorkingTreeFile } from '../../../../api/types.ts';

import { FilePath } from '../../../../components/shared/FilePath.tsx';
import { OverflowScroller } from '../../../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../../../components/ui/badge.tsx';
import { Checkbox } from '../../../../components/ui/checkbox.tsx';
import { useViewportFill, viewportFillScrollerClass } from '../../../../hooks/useViewportFill.ts';
import { tableHeadClass } from '../../../../lib/tableStyles.ts';
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
	const tableRef = useViewportFill<HTMLDivElement>({ refreshKey: files });
	const allSelected = files.length > 0 && files.every((file) => selected.has(file.path));
	const someSelected = files.some((file) => selected.has(file.path));

	return (
		// The table owns the bounded scrollport, so the selection readout and action toolbar in the
		// parent Card remain visible while a long working tree scrolls beneath them.
		<OverflowScroller
			ariaLabel="Changed files"
			rootRef={tableRef}
			scrollerClassName={viewportFillScrollerClass}>
			<table
				aria-label="Changed files"
				className="w-full min-w-[640px] table-auto text-left text-sm">
				<thead className={tableHeadClass}>
					<tr>
						<th className="relative w-10 p-0" scope="col">
							<label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
								<Checkbox
									aria-label="Select all changed files"
									checked={allSelected}
									disabled={disabled || files.length === 0}
									onChange={onToggleAll}
									ref={(el) => {
										if (el) el.indeterminate = someSelected && !allSelected;
									}}
								/>
							</label>
						</th>
						<th className="px-3 py-3" scope="col">
							File
						</th>
						<th className="w-px px-3 py-3 whitespace-nowrap" scope="col">
							Change
						</th>
						<th className="w-px px-3 py-3 whitespace-nowrap" scope="col">
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
							<tr
								className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
								key={file.path}>
								<td className="p-0">
									<label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
										<Checkbox
											aria-label={`Select ${file.path}`}
											checked={selected.has(file.path)}
											disabled={disabled}
											onChange={() => onToggleFile(file.path)}
										/>
									</label>
								</td>
								<td className="px-3 py-3">
									<FilePath
										className="block text-xs break-all text-foreground"
										path={file.path}
									/>
									{file.origPath ? (
										<div className="text-xs break-all text-muted-foreground">
											was <FilePath path={file.origPath} />
										</div>
									) : null}
								</td>
								<td className="px-3 py-3">
									<span title={status.detail}>
										<Badge tone={status.tone}>{status.label}</Badge>
									</span>
								</td>
								<td className="px-3 py-3 whitespace-nowrap">
									<StageColumn file={file} />
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</OverflowScroller>
	);
}
