import { default as LoaderCircle } from 'lucide-react/dist/esm/icons/loader-circle';
import { Link } from 'react-router';

import type { ProjectActiveRunSummary } from '../../api/types.ts';

import { toneText } from '../../lib/tones.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';

export function ProjectActiveRunLink({
	activeRuns,
	className = '',
	empty = 'hidden',
}: {
	activeRuns: ProjectActiveRunSummary;
	className?: string;
	empty?: 'hidden' | 'placeholder';
}) {
	if (activeRuns.count === 0 || activeRuns.latestRunId === null) {
		return empty === 'placeholder' ? <span className="text-muted-foreground">—</span> : null;
	}
	const label = `${activeRuns.count} ${activeRuns.count === 1 ? 'run' : 'runs'} active`;
	return (
		<Link
			aria-label={`Open latest active run: ${label}`}
			className={`inline-flex items-center gap-1.5 rounded hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${toneText.amber} ${touchTargetTextClass} ${className}`}
			to={`/runs?run=${encodeURIComponent(activeRuns.latestRunId)}`}>
			<LoaderCircle
				aria-hidden="true"
				className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
			/>
			<span className="font-medium tabular-nums">{label}</span>
		</Link>
	);
}
