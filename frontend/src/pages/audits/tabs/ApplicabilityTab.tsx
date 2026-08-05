/* eslint-disable react-hooks/set-state-in-effect */
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { AuditProfileMapping } from '../../../api/types.ts';

import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { useAuditProfileMapping, useUpdateAuditProfileMapping } from '../../../hooks/useAudits.ts';
import { tableHeadClass } from '../../../lib/tableStyles.ts';
import { bucketColumns, bucketShortLabels, describeCell, effectTone } from '../auditsUtils.ts';

export function ApplicabilityTab() {
	const mapping = useAuditProfileMapping();
	const update = useUpdateAuditProfileMapping();
	const [editorOpen, setEditorOpen] = useState(false);
	const [editorText, setEditorText] = useState('');
	const [editorError, setEditorError] = useState<null | string>(null);

	useEffect(() => {
		if (editorOpen && mapping.data?.mapping) {
			setEditorText(JSON.stringify(mapping.data.mapping, null, 2));
			setEditorError(null);
		}
	}, [editorOpen, mapping.data?.mapping]);

	if (mapping.isLoading) {
		return <LoadingState message="Loading matrix…" />;
	}

	if (mapping.isError || !mapping.data) {
		return (
			<ErrorState
				error={mapping.error}
				message="Could not load audit profile mapping."
				onRetry={() => void mapping.refetch()}
			/>
		);
	}

	function saveEditor() {
		try {
			const parsed = JSON.parse(editorText) as AuditProfileMapping;
			update.mutate(parsed, {
				onError: (error) =>
					setEditorError(
						error instanceof Error ? error.message : 'Failed to save mapping',
					),
				onSuccess: () => {
					toast.success('Audit profile mapping saved');
					setEditorOpen(false);
				},
			});
		} catch (error) {
			setEditorError(error instanceof Error ? error.message : 'Invalid JSON');
		}
	}

	return (
		<div className="space-y-4">
			<Card className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<div className="font-medium text-foreground">Audit ✕ Bucket Applicability</div>
					<p className="text-xs text-muted-foreground">
						Cells show the strictest effect any rule could produce for that bucket; an
						asterisk means the rule has additional facet constraints, so the effect only
						applies for matching profiles. Hover for source and rule id.
					</p>
				</div>
				<Button onClick={() => setEditorOpen((value) => !value)} variant="secondary">
					{editorOpen ? 'Cancel Edit' : 'Edit Global Mapping'}
				</Button>
			</Card>

			{editorOpen && (
				<Card className="space-y-3">
					<div className="flex items-center justify-between">
						<div className="font-medium text-foreground">Global Mapping JSON</div>
						<Button disabled={update.isPending} onClick={saveEditor} variant="primary">
							<Save className="h-4 w-4" />
							{update.isPending ? 'Saving…' : 'Save Mapping'}
						</Button>
					</div>
					<textarea
						aria-label="Audit profile mapping JSON"
						className="min-h-[360px] w-full resize-y rounded-md border border-border bg-card p-3 font-mono text-xs text-foreground outline-none focus-visible:border-border focus-visible:ring-2 focus-visible:ring-ring"
						onChange={(event) => setEditorText(event.target.value)}
						value={editorText}
					/>
					{editorError && (
						<div className="text-xs text-red-700 dark:text-red-300">{editorError}</div>
					)}
				</Card>
			)}

			<Card className="hidden overflow-x-auto p-0 xl:block">
				<table
					aria-label="Audit applicability matrix"
					className="w-full min-w-[820px] text-left text-sm">
					<thead className={tableHeadClass}>
						<tr>
							<th className="px-3 py-3" scope="col">
								Audit
							</th>
							{bucketColumns.map((bucket) => (
								<th className="px-3 py-3 text-center" key={bucket} scope="col">
									{bucketShortLabels[bucket]}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{mapping.data.matrix.map((row) => (
							<tr
								className="border-b border-border last:border-0"
								key={row.auditName}>
								<td className="px-3 py-2 font-medium text-foreground">
									{row.auditName}
								</td>
								{bucketColumns.map((bucket) => {
									const cell = row.byBucket[bucket];
									return (
										<td className="px-3 py-2 text-center" key={bucket}>
											<Badge tone={effectTone[cell.effect]}>
												<span title={describeCell(cell)}>
													{cell.effect}
													{cell.conditional ? '*' : ''}
												</span>
											</Badge>
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</Card>

			<div className="space-y-2 xl:hidden">
				{mapping.data.matrix.map((row) => (
					<div className="rounded-md border border-border p-3" key={row.auditName}>
						<div className="font-medium text-foreground">{row.auditName}</div>
						<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
							{bucketColumns.map((bucket) => {
								const cell = row.byBucket[bucket];
								return (
									<div className="space-y-1" key={bucket}>
										<dt className="font-medium text-muted-foreground uppercase">
											{bucketShortLabels[bucket]}
										</dt>
										<dd>
											<Badge tone={effectTone[cell.effect]}>
												<span title={describeCell(cell)}>
													{cell.effect}
													{cell.conditional ? '*' : ''}
												</span>
											</Badge>
										</dd>
									</div>
								);
							})}
						</dl>
					</div>
				))}
			</div>
		</div>
	);
}
