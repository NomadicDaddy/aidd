import { describe, expect, test } from 'bun:test';

import { checkBashWorkspacePolicy } from '../../shared/src/agent/tools/shell-policy.ts';

const cwd = process.platform === 'win32' ? 'D:\\projects\\app' : '/projects/app';
const outside = process.platform === 'win32' ? 'D:\\projects\\other' : '/projects/other';

// Every denial carries the "fixed policy" trailer. A run that read denials as ordinary command
// failures spent 24 minutes retrying the same intent in new spellings before giving up, so the
// trailer is the behavioral fix, not decoration — assert it on each category, not just one.
describe('bash workspace policy denials state that the boundary is final', () => {
	const denied: [string, string][] = [
		['absolute path outside the workspace', `ls -la ${outside}`],
		['cd escaping the workspace', `cd ${outside} && pwd`],
		['redirect outside the workspace', `echo hi > ${outside}/note.txt`],
		['copy destination outside the workspace', `cp report.md ${outside}/report.md`],
		['home-directory reference', 'cat $HOME/.aidd/config.json'],
		['environment dump', 'printenv'],
		['disallowed construct', 'eval "$payload"'],
		['destructive git', 'git reset --hard'],
	];

	for (const [label, command] of denied) {
		test(`${label} is denied and marked non-retryable`, () => {
			const result = checkBashWorkspacePolicy(command, cwd);
			expect(result).toBeString();
			expect(result).toContain('fixed policy of the aidd agent runtime');
			expect(result).toContain('will not succeed on retry');
			// The agent needs a sanctioned exit, or "stop probing" just leaves it stuck.
			expect(result).toContain('completion summary');
		});
	}

	test('the original violation text survives ahead of the trailer', () => {
		const result = checkBashWorkspacePolicy(`ls -la ${outside}`, cwd);
		expect(result).toStartWith('ERROR: bash command references path outside workspace');
		// Separated by a blank line: these messages end in the offending path, where a trailing
		// period would read as part of it.
		expect(result).toContain(`${outside}\n\n`);
	});

	test('permitted commands stay unannotated', () => {
		expect(checkBashWorkspacePolicy('bun run typecheck', cwd)).toBeNull();
		expect(checkBashWorkspacePolicy('git status', cwd)).toBeNull();
	});
});
