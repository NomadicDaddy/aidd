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
import { Checkbox } from '../../components/ui/checkbox.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { useImportProjects, useProjectImportCandidates } from '../../hooks/useProjects.ts';
import { toneText } from '../../lib/tones.ts';
import { CandidateIntakePreview } from './CandidateIntakePreview.tsx';

function signalLabels(signals: { aidd: boolean; git: boolean; packageJson: boolean }): string[] {
	const labels: string[] = [];
	if (signals.packageJson) labels.push('package.json');
	if (signals.git) labels.push('.git');
	if (signals.aidd) labels.push('.aidd');
	return labels;
}

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
						<div className="max-h-[28rem] space-y-2 overflow-auto pr-1">
							{(candidates.data?.candidates ?? []).map((candidate) => {
								const labels = signalLabels(candidate.signals);
								return (
									<label
										className="flex gap-3 rounded border border-border bg-card p-3 text-sm"
										key={candidate.id}>
										<Checkbox
											checked={selectedIds.has(candidate.id)}
											className="mt-1 h-4 w-4"
											disabled={
												!candidate.canImport || importProjects.isPending
											}
											onChange={(event) =>
												toggleCandidate(candidate.id, event.target.checked)
											}
										/>
										<div className="min-w-0 flex-1 space-y-1">
											<div className="flex flex-wrap items-center gap-2">
												<span className="font-medium text-foreground">
													{candidate.name}
												</span>
												<span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
													{labels.length > 0
														? labels.join(', ')
														: 'directory'}
												</span>
											</div>
											<p className="font-mono text-xs break-all text-muted-foreground">
												{candidate.path}
											</p>
											<p className="text-xs break-all text-muted-foreground">
												Root: {candidate.root}
											</p>
											{candidate.reason ? (
												<p className="text-xs text-amber-700 dark:text-amber-300">
													{candidate.reason}
												</p>
											) : null}
											<button
												className="text-xs text-teal-700 underline dark:text-teal-300"
												onClick={(event) => {
													event.preventDefault();
													setPreviewIds((current) => {
														const next = new Set(current);
														if (next.has(candidate.id)) {
															next.delete(candidate.id);
														} else {
															next.add(candidate.id);
														}
														return next;
													});
												}}
												type="button">
												{previewIds.has(candidate.id)
													? 'Hide preview'
													: 'Preview'}
											</button>
											{previewIds.has(candidate.id) ? (
												<CandidateIntakePreview path={candidate.path} />
											) : null}
										</div>
									</label>
								);
							})}
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
