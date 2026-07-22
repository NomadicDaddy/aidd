import { default as LoaderCircle } from 'lucide-react/dist/esm/icons/loader-circle';
import { Link } from 'react-router-dom';

import type { ProjectActiveRunSummary } from '../../api/types.ts';

export function ProjectActiveRunLink({
	activeRuns,
	className = '',
}: {
	activeRuns: ProjectActiveRunSummary;
	className?: string;
}) {
	if (activeRuns.count === 0 || activeRuns.latestRunId === null) return null;
	const label = `${activeRuns.count} ${activeRuns.count === 1 ? 'run' : 'runs'} active`;
	return (
		<Link
			aria-label={`Open latest active run: ${label}`}
			className={`inline-flex items-center gap-1.5 rounded text-amber-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:text-amber-300 ${className}`}
			to={`/runs?run=${encodeURIComponent(activeRuns.latestRunId)}`}>
			<LoaderCircle
				aria-hidden="true"
				className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
			/>
			<span className="font-medium tabular-nums">{label}</span>
		</Link>
	);
}
