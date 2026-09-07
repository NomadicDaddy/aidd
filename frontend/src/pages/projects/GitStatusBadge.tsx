import { default as GitBranch } from 'lucide-react/dist/esm/icons/git-branch';

import type { ProjectGitStatusSummary } from '../../api/types.ts';
import type { Tone } from '../../lib/tones.ts';

import { Badge } from '../../components/ui/badge.tsx';

function plural(count: number, singular: string, pluralLabel = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function toneFor(status: null | ProjectGitStatusSummary | undefined): Tone {
	if (!status) return 'neutral';
	if (status.state === 'conflicted') return 'red';
	if (status.state === 'dirty') return 'amber';
	if (status.state === 'clean') return 'emerald';
	if (status.state === 'error') return 'red';
	return 'neutral';
}

function statusLabel(status: null | ProjectGitStatusSummary | undefined): string {
	if (!status) return 'git --';
	if (status.state === 'not-a-repo') return 'no git';
	if (status.state === 'project-missing') return 'missing';
	if (status.state === 'error') return 'git error';
	const branch = status.branch ?? 'git';
	const remote =
		status.ahead > 0 || status.behind > 0
			? ` ${status.ahead > 0 ? `ahead ${status.ahead}` : ''}${
					status.ahead > 0 && status.behind > 0 ? ' ' : ''
				}${status.behind > 0 ? `behind ${status.behind}` : ''}`
			: '';
	if (status.state === 'clean') return `${branch} clean${remote}`;
	if (status.state === 'conflicted') return `${branch} ${plural(status.conflicted, 'conflict')}`;
	return `${branch} ${plural(status.total, 'change')}`;
}

function titleFor(status: null | ProjectGitStatusSummary | undefined): string {
	if (!status) return 'Git status is loading or unavailable.';
	if (status.state === 'not-a-repo') return 'This project directory is not a git repository.';
	if (status.state === 'project-missing')
		return 'The project directory no longer exists on disk.';
	if (status.state === 'error') return 'Git status could not be read.';
	const parts = [
		status.branch ? `branch ${status.branch}` : 'detached or unnamed branch',
		plural(status.staged, 'staged change'),
		plural(status.unstaged, 'unstaged change'),
		plural(status.untracked, 'untracked file'),
		plural(status.conflicted, 'conflict'),
	];
	if (status.ahead > 0) parts.push(`ahead ${status.ahead}`);
	if (status.behind > 0) parts.push(`behind ${status.behind}`);
	return parts.join('; ');
}

export function GitStatusBadge({
	className,
	status,
}: {
	className?: string;
	status: null | ProjectGitStatusSummary | undefined;
}) {
	return (
		<Badge className={className ?? ''} showDot tone={toneFor(status)}>
			<GitBranch aria-hidden="true" className="h-3 w-3 shrink-0" />
			<span className="truncate" title={titleFor(status)}>
				{statusLabel(status)}
			</span>
		</Badge>
	);
}
