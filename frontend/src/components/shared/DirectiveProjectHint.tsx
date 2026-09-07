import { useProjectGitStatus } from '../../hooks/useProjects.ts';

interface DirectiveProjectHintProps {
	projectDir: string;
	projectId: string | undefined;
}

export function DirectiveProjectHint({ projectDir, projectId }: DirectiveProjectHintProps) {
	const projectGitStatus = useProjectGitStatus(projectId);
	const branch = projectGitStatus.data?.status.branch;

	return (
		<span className="flex min-w-0 flex-wrap items-center gap-x-2 font-mono">
			<span className="break-all">{projectDir}</span>
			<span aria-hidden="true">·</span>
			<span>
				{projectGitStatus.isLoading
					? 'branch resolving…'
					: `branch ${branch ?? 'unavailable'}`}
			</span>
		</span>
	);
}
