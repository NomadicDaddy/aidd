import { describe, expect, test } from 'bun:test';

import { checkBashWorkspacePolicy } from '../../shared/src/agent/tools/shell-policy';

// The bash tool denies the force-push spellings it can read up front; the repository's pre-push
// guard refuses the rewrite itself whatever it was spelled as. Both are needed: the policy gives
// the agent a reason before anything runs, the hook catches what the policy cannot see.
describe('shell workspace policy — pushes that rewrite the remote', () => {
	const cwd = '/workspace/project';
	const denied = (command: string): void => {
		expect(checkBashWorkspacePolicy(command, cwd)).toContain('destructive git');
	};
	const allowed = (command: string): void => {
		expect(checkBashWorkspacePolicy(command, cwd)).toBeNull();
	};

	test('blocks every force flag git accepts', () => {
		denied('git push --force');
		denied('git push -f origin main');
		denied('git push origin main -f');
		denied('git push --force-with-lease origin main');
		denied('git push --force-with-lease=main:abc123 origin main');
		denied('git push --force-if-includes --force-with-lease origin main');
		denied('git push --forc origin main');
	});

	test('blocks a forcing or deleting refspec with no flag at all', () => {
		denied('git push origin +main');
		denied('git push origin :old-branch');
		denied('git push origin +refs/heads/main:refs/heads/main');
	});

	test('blocks remote deletions, mirrors and prunes', () => {
		denied('git push --delete origin old');
		denied('git push -d origin old');
		denied('git push --mirror backup');
		denied('git push --prune origin');
	});

	test('reads a push option value as a value, and the flag after it as a flag', () => {
		denied('git push -o ci.skip -f origin main');
		denied('git push --push-option ci.skip --force origin main');
	});

	test('blocks the spelling wherever it is run from', () => {
		denied('git -C ../other push --force');
		denied('cd src && git push -f');
		denied('pwsh -c "git push --force origin main"');
		denied('echo origin | xargs git push');
		denied('git push origin "$BRANCH"');
	});

	test('allows pushes that cannot rewrite anything', () => {
		allowed('git push');
		allowed('git push origin main');
		allowed('git push -u origin feature');
		allowed('git push origin HEAD:refs/heads/feature');
		allowed('git push -o ci.skip origin main');
		allowed('git push --push-option=ci.skip origin main');
		allowed('git push --tags origin');
		allowed('git push --dry-run origin main');
		allowed('git push --no-force-with-lease origin main');
		allowed('git log --oneline -3 && git push origin main');
	});
});
