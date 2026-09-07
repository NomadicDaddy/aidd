import { default as Ban } from 'lucide-react/dist/esm/icons/ban';
import { default as Rocket } from 'lucide-react/dist/esm/icons/rocket';
import { default as TriangleAlert } from 'lucide-react/dist/esm/icons/triangle-alert';
import { Link } from 'react-router';

import type {
	DirectorAutoLaunchLaunched,
	DirectorAutoLaunchSkipped,
	DirectorCycleAutoLaunch,
} from '../../api/types.ts';

import { toneText } from '../../lib/tones.ts';

// Every other code names a bound doing its job. Only a launch failure needs warning emphasis.
function skipTone(skip: DirectorAutoLaunchSkipped): string {
	return skip.code === 'launch_failed' ? toneText.amber : 'text-muted-foreground';
}

// A run and a pipeline session are followed to different pages, and a session is the more
// consequential of the two — several steps rather than one — so the link has to land on its report
// rather than on a runs list that will not have it.
function launchedHref(item: DirectorAutoLaunchLaunched): string {
	return item.kind === 'pipeline'
		? `/pipeline-sessions/${encodeURIComponent(item.pipelineSessionId)}`
		: `/runs?run=${encodeURIComponent(item.runId)}`;
}

/**
 * What a cycle started on its own, and what it declined to start.
 *
 * Shown on the cycle rather than only in the log, because an unattended launch is the one thing on
 * this page that happened while nobody was looking. The skipped list is not noise to be collapsed
 * away: an operator who switched auto-launch on and got nothing needs to see which bound answered,
 * and telling them "0 launched" without saying why is how a working guard gets mistaken for a bug.
 */
export function CycleAutoLaunchSummary({ autoLaunch }: { autoLaunch: DirectorCycleAutoLaunch }) {
	const { error, launched, skipped } = autoLaunch;
	if (!error && launched.length === 0 && skipped.length === 0) return null;
	return (
		<div className="mt-2 space-y-1 rounded-md border border-border bg-background/40 p-2 text-xs">
			{error ? (
				<div className="flex items-start gap-1.5">
					<TriangleAlert className={`mt-px h-3.5 w-3.5 shrink-0 ${toneText.amber}`} />
					<span className={`break-words ${toneText.amber}`}>
						Auto-launch could not run: {error}
					</span>
				</div>
			) : null}
			{launched.map((item) => (
				<div className="flex items-start gap-1.5" key={item.suggestionId}>
					<Rocket className={`mt-px h-3.5 w-3.5 shrink-0 ${toneText.teal}`} />
					<span className="break-words text-foreground">
						Started{' '}
						<Link
							className="underline underline-offset-2 hover:text-accent"
							to={launchedHref(item)}>
							{item.title}
						</Link>
					</span>
				</div>
			))}
			{skipped.map((item) => (
				<div className="flex items-start gap-1.5" key={item.suggestionId}>
					<Ban className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<span className={`break-words ${skipTone(item)}`}>
						<span className="text-foreground">{item.title}</span>
						{' — '}
						{item.reason}
					</span>
				</div>
			))}
		</div>
	);
}
