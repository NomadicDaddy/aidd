/* eslint-disable react-hooks/set-state-in-effect */
import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as PackagePlus } from 'lucide-react/dist/esm/icons/package-plus';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectImportAction, ProjectImportCandidateResult } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { LaunchTargetControl } from '../../components/shared/LaunchTargetControl.tsx';
import { Button } from '../../components/ui/button.tsx';
import { FieldCheckbox, FieldRow } from '../../components/ui/field.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { useImportProjects, useProjectImportCandidates } from '../../hooks/useProjects.ts';
import { filterRegister } from '../../lib/filterFields.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';
import { IngestCandidateRow } from './IngestCandidateRow.tsx';
import {
	candidateRoots,
	type CandidateSignalFilter,
	filterImportCandidates,
} from './projectImportCandidates.ts';
import { ProjectIngestFilters } from './ProjectIngestFilters.tsx';
import { ProjectIngestResults } from './ProjectIngestResults.tsx';
import { projectImportResultSummary } from './projectIngestResultSummary.ts';

// Scans configured roots for importable directories, previews them, and handles the selection.
export function ProjectIngestLane() {
	const candidates = useProjectImportCandidates(true);
	const importProjects = useImportProjects();
	const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
	const [action, setAction] = useState<ProjectImportAction>('ingest');
	const [launchTarget, setLaunchTarget] = useState<LaunchTargetValue>({});
	const [previewIds, setPreviewIds] = useState<Set<string>>(() => new Set());
	const [results, setResults] = useState<ProjectImportCandidateResult[]>([]);
	const [query, setQuery] = useState('');
	const [rootFilter, setRootFilter] = useState('');
	const [signalFilter, setSignalFilter] = useState<CandidateSignalFilter>('all');
	const actionHelpId = useId();
	function resetFilters(): void {
		setQuery('');
		setRootFilter('');
		setSignalFilter('all');
	}
	const emptyFilters = filterRegister(resetFilters, [
		query.trim() !== '' && { label: 'Search', value: query.trim() },
		rootFilter !== '' && { label: 'Root', value: rootFilter },
		signalFilter !== 'all' && { label: 'Signal', value: signalFilter },
	]);

	useEffect(() => {
		setSelectedIds(new Set());
		setResults([]);
	}, [candidates.data]);

	const allCandidates = candidates.data?.candidates ?? [];
	const roots = candidateRoots(allCandidates);
	const filteredCandidates = filterImportCandidates(allCandidates, {
		query,
		root: rootFilter,
		signal: signalFilter,
	});
	const importableCount = allCandidates.filter((candidate) => candidate.canImport).length;
	const importableFilteredCandidates = filteredCandidates.filter(
		(candidate) => candidate.canImport,
	);
	const allFilteredSelected =
		importableFilteredCandidates.length > 0 &&
		importableFilteredCandidates.every((candidate) => selectedIds.has(candidate.id));
	const someFilteredSelected =
		!allFilteredSelected &&
		importableFilteredCandidates.some((candidate) => selectedIds.has(candidate.id));
	const actionHelp =
		action === 'ingest'
			? 'Creates the .aidd metadata skeleton and launches the metadata-only project-intake pipeline.'
			: 'Creates the .aidd metadata skeleton only. No pipeline or Run is launched.';

	function toggleCandidate(id: string, checked: boolean): void {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	}

	function toggleFilteredCandidates(checked: boolean): void {
		setSelectedIds((current) => {
			const next = new Set(current);
			for (const candidate of importableFilteredCandidates) {
				if (checked) next.add(candidate.id);
				else next.delete(candidate.id);
			}
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
			const result = await importProjects.mutateAsync({
				action,
				candidateIds,
				launchTarget,
			});
			setResults(result.results);
			const failed = result.results.filter((entry) => entry.status === 'failed').length;
			if (failed > 0) {
				toast.warning('Import finished with errors', {
					description: projectImportResultSummary(result.results),
				});
			} else {
				toast.success('Import finished', {
					description: projectImportResultSummary(result.results),
				});
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
				<div
					className={`flex items-start gap-2 rounded border p-3 text-sm ${toneBorder.red} ${toneSurface.red} ${toneText.red}`}>
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
					<ProjectIngestFilters
						actions={
							<div className="flex w-full flex-wrap items-center justify-end gap-2">
								{action === 'ingest' ? (
									<div className="mr-auto">
										<LaunchTargetControl
											label="Launch"
											onChange={setLaunchTarget}
											size="default"
											value={launchTarget}
										/>
									</div>
								) : null}
								<Button
									disabled={candidates.isFetching}
									onClick={() => void candidates.refetch()}
									variant="secondary">
									Refresh
								</Button>
								<Button
									aria-describedby={actionHelpId}
									disabled={selectedIds.size === 0 || importProjects.isPending}
									onClick={() => void handleImport()}
									variant="primary">
									<PackagePlus className="h-4 w-4" />
									{importProjects.isPending
										? 'Importing…'
										: action === 'ingest'
											? 'Ingest Selected'
											: 'Register Selected'}
								</Button>
							</div>
						}
						filtered={filteredCandidates.length}
						header={
							<div className="grid gap-3 sm:grid-cols-2">
								<FieldRow group label="Selection">
									<div className="flex flex-wrap items-center gap-2">
										<FieldCheckbox
											checked={allFilteredSelected}
											className="w-fit"
											disabled={
												importableFilteredCandidates.length === 0 ||
												importProjects.isPending
											}
											indeterminate={someFilteredSelected}
											label={`Select all filtered (${importableFilteredCandidates.length})`}
											onChange={(event) =>
												toggleFilteredCandidates(event.target.checked)
											}
										/>
										<Button
											disabled={
												selectedIds.size === 0 || importProjects.isPending
											}
											onClick={() => setSelectedIds(new Set())}
											size="compact"
											variant="ghost">
											Clear selection
										</Button>
									</div>
								</FieldRow>
								<FieldRow group label="Action">
									<SegmentedControl
										ariaDescribedBy={actionHelpId}
										ariaLabel="Import action"
										onChange={setAction}
										options={[
											{ label: 'Ingest', value: 'ingest' },
											{ label: 'Register only', value: 'register' },
										]}
										value={action}
									/>
									<p
										aria-live="polite"
										className="mt-1 max-w-xl text-xs text-muted-foreground"
										id={actionHelpId}>
										{actionHelp}
									</p>
								</FieldRow>
							</div>
						}
						onQueryChange={setQuery}
						onReset={resetFilters}
						onRootChange={setRootFilter}
						onSignalChange={setSignalFilter}
						query={query}
						readoutSuffix={
							<>
								{' '}
								· {importableCount} importable · {selectedIds.size} selected
							</>
						}
						root={rootFilter}
						roots={roots}
						signal={signalFilter}
						total={allCandidates.length}
					/>

					{allCandidates.length === 0 ? (
						<EmptyState>
							No import candidates found under the configured roots.
						</EmptyState>
					) : filteredCandidates.length === 0 ? (
						<EmptyState filterReset="toolbar" filters={emptyFilters}>
							No candidates match the current filters.
						</EmptyState>
					) : (
						<div className="@container">
							<div
								className="grid gap-2 @min-[60rem]:grid-cols-2"
								data-ingest-candidates="">
								{filteredCandidates.map((candidate) => (
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
						</div>
					)}
				</div>
			) : null}

			<ProjectIngestResults results={results} />
		</div>
	);
}
