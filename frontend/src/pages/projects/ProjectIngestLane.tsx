/* eslint-disable react-hooks/set-state-in-effect */
import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as CheckCircle2 } from 'lucide-react/dist/esm/icons/check-circle-2';
import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as PackagePlus } from 'lucide-react/dist/esm/icons/package-plus';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import type { ProjectImportAction, ProjectImportCandidateResult } from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { useImportProjects, useProjectImportCandidates } from '../../hooks/useProjects.ts';
import { toneText } from '../../lib/tones.ts';
import { IngestCandidateRow } from './IngestCandidateRow.tsx';

function resultSummary(results: ProjectImportCandidateResult[]): string {
	const imported = results.filter((result) => result.status === 'imported').length;
	const failed = results.length - imported;
	if (failed === 0) return `${imported} project${imported === 1 ? '' : 's'} imported`;
	return `${imported} imported, ${failed} failed`;
}

// The ingest lane of the Project Intake panel: scans configured roots for importable
// directories, previews each, and registers or ingests the selection.
export function ProjectIngestLane() {
	const candidates = useProjectImportCandidates(true);
	const importProjects = useImportProjects();
	const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
	const [action, setAction] = useState<ProjectImportAction>('ingest');
	const [previewIds, setPreviewIds] = useState<Set<string>>(() => new Set());
	const [results, setResults] = useState<ProjectImportCandidateResult[]>([]);

	useEffect(() => {
		setSelectedIds(new Set());
		setResults([]);
	}, [candidates.data]);

	const importableCount = (candidates.data?.candidates ?? []).filter(
		(candidate) => candidate.canImport,
	).length;

	function toggleCandidate(id: string, checked: boolean): void {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	}

	function togglePreview(id: string): void {
		setPreviewIds((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	async function handleImport(): Promise<void> {
		const candidateIds = [...selectedIds];
		if (candidateIds.length === 0) return;
		try {
			const result = await importProjects.mutateAsync({ action, candidateIds });
			setResults(result.results);
			const failed = result.results.filter((entry) => entry.status === 'failed').length;
			if (failed > 0) {
				toast.warning('Import finished with errors', {
					description: resultSummary(result.results),
				});
			} else {
				toast.success('Import finished', { description: resultSummary(result.results) });
			}
		} catch (error) {
			toast.error('Import failed', {
				description: error instanceof Error ? error.message : 'Unknown import error.',
			});
		}
	}

	return (
		<div className="space-y-4">
			{candidates.isLoading ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					Scanning configured roots…
				</div>
			) : null}

			{candidates.isError ? (
				<div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
					<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
					<div>
						<p className="font-medium">Could not load import candidates.</p>
						<p className="text-xs">
							{candidates.error instanceof Error
								? candidates.error.message
								: 'Unknown candidate scan error.'}
						</p>
					</div>
				</div>
			) : null}

			{!candidates.isLoading && !candidates.isError ? (
				<div className="space-y-3">
					<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
						<span className="text-muted-foreground">
							{selectedIds.size} selected of {importableCount} importable candidates
						</span>
						<div className="flex flex-wrap items-center gap-2">
							<SegmentedControl
								ariaLabel="Import action"
								onChange={setAction}
								options={[
									{
										label: 'Ingest',
										title: 'Register and run the metadata-only project-intake recipe',
										value: 'ingest',
									},
									{
										label: 'Register only',
										title: 'Create the .aidd skeleton without launching anything',
										value: 'register',
									},
								]}
								value={action}
							/>
							<Button
								disabled={candidates.isFetching}
								onClick={() => void candidates.refetch()}
								variant="secondary">
								Refresh
							</Button>
							<Button
								disabled={selectedIds.size === 0 || importProjects.isPending}
								onClick={() => void handleImport()}>
								<PackagePlus className="h-4 w-4" />
								{importProjects.isPending
									? 'Importing…'
									: action === 'ingest'
										? 'Ingest Selected'
										: 'Register Selected'}
							</Button>
						</div>
					</div>

					{(candidates.data?.candidates ?? []).length === 0 ? (
						<div className="rounded border border-border bg-card p-4 text-sm text-muted-foreground">
							No import candidates found under the configured roots.
						</div>
					) : (
						// The list scrolls, and with a flat cut edge the row sliced at 28rem read as
						// a rendering defect rather than as "more below" — hence the bottom fade.
						<div className="relative">
							<div className="max-h-[28rem] space-y-2 overflow-auto pr-1 pb-4">
								{(candidates.data?.candidates ?? []).map((candidate) => (
									<IngestCandidateRow
										candidate={candidate}
										disabled={!candidate.canImport || importProjects.isPending}
										key={candidate.id}
										onPreviewToggle={() => togglePreview(candidate.id)}
										onToggle={(checked) =>
											toggleCandidate(candidate.id, checked)
										}
										previewOpen={previewIds.has(candidate.id)}
										selected={selectedIds.has(candidate.id)}
									/>
								))}
							</div>
							<div
								aria-hidden="true"
								className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-card to-transparent"
							/>
						</div>
					)}
				</div>
			) : null}

			{results.length > 0 ? (
				<div className="space-y-2 rounded border border-border bg-card p-3 text-sm">
					<div className="flex items-center gap-2 font-medium">
						<CheckCircle2 className={`h-4 w-4 ${toneText.emerald}`} />
						{resultSummary(results)}
					</div>
					<ul className="space-y-1 text-xs text-muted-foreground">
						{results.map((result) => (
							<li className="break-all" key={result.candidateId}>
								{result.status === 'imported' ? 'Imported' : 'Failed'} {result.path}
								{result.intakeSessionId ? (
									<>
										{', '}
										<Link
											className="text-teal-700 underline dark:text-teal-300"
											to={`/pipeline-sessions/${result.intakeSessionId}`}>
											intake session
										</Link>
									</>
								) : null}
								{result.error ? `: ${result.error}` : ''}
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}
