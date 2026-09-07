import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';

import { useProjectIntakePreview } from '../../hooks/useProjects.ts';
import { toneText } from '../../lib/tones.ts';
import { microLabelClass } from '../../lib/typography.ts';
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
			<p className={`pt-2 text-xs ${toneText.amber}`}>
				Preview unavailable
				{preview.error instanceof Error ? `: ${preview.error.message}` : '.'}
			</p>
		);
	}
	const data = preview.data;
	return (
		<div className="space-y-2 pt-2 text-xs text-muted-foreground">
			<ProjectStackDisplay stack={data.stack} variant="detail" />
			{data.spernakit.inManifest && !data.spernakit.manifestVersion ? (
				<p className={toneText.amber}>Pending Spernakit rebuild</p>
			) : data.spernakit.fileSignals && data.stack.family !== 'spernakit' ? (
				<p className="text-muted-foreground">Spernakit-like directory layout</p>
			) : null}
			<dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)]">
				<dt className={microLabelClass}>Likely phase</dt>
				<dd className="font-medium text-foreground">{data.likelyPhase}</dd>
				<dt className={microLabelClass}>Repository</dt>
				<dd>
					{data.git ? (
						<>
							<span className="font-mono text-foreground">
								{data.git.branch ?? '(no branch)'}
							</span>{' '}
							· {data.git.dirtyCount} dirty
						</>
					) : (
						'Not a git repository'
					)}
				</dd>
				{data.git?.lastCommit ? (
					<>
						<dt className={microLabelClass}>Last commit</dt>
						<dd className="min-w-0">
							<span className="font-mono text-foreground">
								{data.git.lastCommit.hash}
							</span>{' '}
							{data.git.lastCommit.subject}
						</dd>
					</>
				) : null}
			</dl>
			{data.workspaceRoot.detected ? (
				<p className={toneText.amber}>
					Monorepo root with {data.workspaceRoot.subprojectCount} subprojects — ingest the
					subprojects individually.
				</p>
			) : null}
		</div>
	);
}
