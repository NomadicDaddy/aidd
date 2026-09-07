import { default as CheckCircle2 } from 'lucide-react/dist/esm/icons/check-circle-2';
import { Link } from 'react-router';

import type { ProjectImportCandidateResult } from '../../api/types.ts';

import { toneText } from '../../lib/tones.ts';
import { projectImportResultSummary } from './projectIngestResultSummary.ts';

interface ProjectIngestResultsProps {
	results: ProjectImportCandidateResult[];
}

export function ProjectIngestResults({ results }: ProjectIngestResultsProps) {
	if (results.length === 0) return null;
	return (
		<div className="space-y-2 rounded border border-border bg-card p-3 text-sm">
			<div className="flex items-center gap-2 font-medium">
				<CheckCircle2 className={`h-4 w-4 ${toneText.emerald}`} />
				{projectImportResultSummary(results)}
			</div>
			<ul className="space-y-1 text-xs text-muted-foreground">
				{results.map((result) => (
					<li className="break-all" key={result.candidateId}>
						{result.status === 'imported' ? 'Imported' : 'Failed'} {result.path}
						{result.intakeSessionId ? (
							<>
								{', '}
								<Link
									className={`${toneText.teal} underline`}
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
	);
}
