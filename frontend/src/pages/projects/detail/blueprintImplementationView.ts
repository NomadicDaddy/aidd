import type { ProjectDetail } from '../../../api/types.ts';

import { projectDetailTabSearch } from './overviewLinks.ts';

type ProjectImplementation = ProjectDetail['implementation'];

/**
 * What the card shows, decided here rather than in JSX so the wording and — crucially — the choice
 * of indicator can be asserted directly. The defect this replaces was a spinner shown for every
 * pre-coding project; `indicator: 'progress'` is now reachable only from a `preparing` state, which
 * the server only produces when it found a running run or pipeline for this project.
 */
export type BlueprintIndicator = 'idle' | 'progress' | 'queued' | 'ready';

export interface BlueprintImplementationLink {
	label: string;
	to: string;
}

export interface BlueprintImplementationView {
	description: null | string;
	indicator: BlueprintIndicator;
	link: BlueprintImplementationLink | null;
	title: string;
	tone: 'amber' | 'teal';
}

const blueprintReadyDescription =
	'The app scaffold, reviewed backlog, and roadmap are ready. Implementation has not started.';

const artifactsLink: BlueprintImplementationLink = {
	label: 'Review project artifacts',
	to: projectDetailTabSearch('artifacts'),
};

/**
 * A link to the work the reason names, so the claim can be checked rather than taken on faith.
 * Never a launch control: the card reports what setup is doing, it does not start setup.
 */
function activityLink(
	activity: ProjectImplementation['activity'],
	projectPath: string,
): BlueprintImplementationLink | null {
	if (!activity || activity.reference === null) return null;
	if (activity.kind === 'pipeline') {
		return {
			label: 'Open pipeline session',
			to: `/pipeline-sessions/${encodeURIComponent(activity.reference)}`,
		};
	}
	return {
		label: 'Open run in Live Console',
		to: `/runs?project=${encodeURIComponent(projectPath)}&run=${encodeURIComponent(activity.reference)}`,
	};
}

export function describeBlueprintImplementation(
	implementation: ProjectImplementation,
	projectPath: string,
): BlueprintImplementationView {
	const link = activityLink(implementation.activity, projectPath);
	switch (implementation.state) {
		case 'blueprint_ready':
			return {
				description: blueprintReadyDescription,
				indicator: 'ready',
				link: null,
				title: 'Blueprint ready for review',
				tone: 'teal',
			};
		case 'preparing':
			return {
				description: implementation.reason,
				indicator: 'progress',
				link,
				title: 'Preparing blueprint',
				tone: 'teal',
			};
		case 'queued':
			return {
				description: implementation.reason,
				indicator: 'queued',
				link,
				title: 'Blueprint setup queued',
				tone: 'teal',
			};
		case 'setup_incomplete':
			return {
				description: implementation.reason,
				indicator: 'idle',
				link: artifactsLink,
				title: 'Project setup incomplete',
				tone: 'amber',
			};
		default:
			return {
				description: implementation.reason,
				indicator: 'idle',
				link: link ?? artifactsLink,
				title: 'Blueprint needs attention',
				tone: 'amber',
			};
	}
}
