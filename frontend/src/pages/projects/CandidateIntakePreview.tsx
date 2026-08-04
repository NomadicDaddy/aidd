import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';

import { useProjectIntakePreview } from '../../hooks/useProjects.ts';
import { ProjectStackDisplay } from './ProjectStackDisplay.tsx';

export function CandidateIntakePreview({ path }: { path: string }) {
	const preview = useProjectIntakePreview(path);
	if (preview.isLoading) {
		return (
			<div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
				<Loader2 className="h-3 w-3 animate-spin" />
				Inspecting…
			</div>
		);
	}
	if (preview.isError || !preview.data) {
		return (
			<p className="pt-2 text-xs text-amber-700 dark:text-amber-300">
				Preview unavailable
				{preview.error instanceof Error ? `: ${preview.error.message}` : '.'}
			</p>
		);
	}
	const data = preview.data;
	return (
		<div className="space-y-1.5 pt-2 text-xs text-muted-foreground">
			<ProjectStackDisplay stack={data.stack} variant="detail" />
			{data.spernakit.inManifest && !data.spernakit.manifestVersion ? (
				<p className="text-amber-700 dark:text-amber-300">Pending Spernakit rebuild</p>
			) : data.spernakit.fileSignals && data.stack.family !== 'spernakit' ? (
				<p className="text-muted-foreground">Spernakit-like directory layout</p>
			) : null}
			<p>
				Likely phase: <span className="font-medium">{data.likelyPhase}</span>
				{data.git
					? ` · git ${data.git.branch ?? '(no branch)'}, ${data.git.dirtyCount} dirty`
					: ' · not a git repository'}
				{data.git?.lastCommit
					? ` · last commit ${data.git.lastCommit.hash} ${data.git.lastCommit.subject}`
					: ''}
			</p>
			{data.workspaceRoot.detected ? (
				<p className="text-amber-700 dark:text-amber-300">
					Monorepo root with {data.workspaceRoot.subprojectCount} subprojects — ingest the
					subprojects individually.
				</p>
			) : null}
		</div>
	);
}
