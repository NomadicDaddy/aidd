import { useState } from 'react';

import { parseGithubSource } from './projectNewPanelUtils.ts';

export interface GithubTemplateSourceState {
	/** Name-input change handler: sets the name and stops autofill overwriting it. */
	editName: (value: string) => void;
	/** True while the URL does not parse; gates the github lane's create button. */
	incomplete: boolean;
	onUrlChange: (value: string) => void;
	templateUrl: string;
	trimmedUrl: string;
	urlError: null | string;
}

// Owns the GitHub template URL input state for the create lane, including name autofill:
// a parsed repo name fills an empty or previously autofilled project name, never a
// hand-typed one. Split from ProjectCreateSourceFields.tsx so that file only exports
// components (react-refresh) and ProjectCreateLane.tsx stays within the modularity budget.
export function useGithubTemplateSource(
	name: string,
	setName: (value: string) => void
): GithubTemplateSourceState {
	const [templateUrl, setTemplateUrl] = useState('');
	const [nameWasAutoFilled, setNameWasAutoFilled] = useState(false);

	const trimmedUrl = templateUrl.trim();
	const source = parseGithubSource(templateUrl);
	const urlError =
		trimmedUrl.length > 0 && source === null
			? 'Use https://github.com/owner/repo, github.com/owner/repo, or owner/repo, with an optional #ref.'
			: null;

	function onUrlChange(value: string): void {
		setTemplateUrl(value);
		const parsed = parseGithubSource(value);
		if (parsed && (name.length === 0 || nameWasAutoFilled)) {
			setName(parsed.name);
			setNameWasAutoFilled(true);
		}
	}

	return {
		editName: (value: string) => {
			setName(value);
			setNameWasAutoFilled(false);
		},
		incomplete: source === null,
		onUrlChange,
		templateUrl,
		trimmedUrl,
		urlError,
	};
}
