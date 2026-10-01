import { describe, expect, test } from 'bun:test';

import { checkBashWorkspacePolicy } from '../../shared/src/agent/tools/shell-policy';

// The deny-list was one regex over the raw command, so any spelling it did not literally contain
// went through: a global option before the subcommand, a different flag order, a long option, a
// whole-tree pathspec other than `.`. Each form below was allowed before the check was tokenised.
describe('shell workspace policy - destructive git, every spelling', () => {
	const cwd = '/workspace/project';
	const verdict = (command: string) => checkBashWorkspacePolicy(command, cwd);

	test.each([
		'git -C . reset --hard',
		'git -c core.x=1 reset --hard',
		'git --no-pager reset --hard',
		'git --git-dir=.git reset --hard',
		'git.exe reset --hard',
		'GIT reset --hard',
		'git reset -q --hard',
		'git reset --merge',
		'git reset --keep HEAD~1',
		'git reset HEAD~',
		'git reset HEAD^',
		'git reset @~2',
		'git clean -d -f',
		'git clean -x -f',
		'git clean -Xf',
		'git clean --force',
		'git clean --force -d',
		'git checkout -f',
		'git checkout --force main',
		'git checkout HEAD -- .',
		'git checkout :/',
		'git switch -f main',
		'git switch --discard-changes main',
		'git restore :/',
		'git restore --staged --worktree .',
		'git restore -SW .',
		'git restore --source=HEAD~1 .',
		'env GIT_PAGER=cat git reset --hard',
		'git status && git -C sub clean -fd',
	])('denies %s', (command) => {
		expect(verdict(command)).toContain('destructive git');
	});

	// Found by attacking the first tokenised version. Each was run in a throwaway repository and
	// discarded an edit or deleted an untracked file.
	test.each([
		String.raw`g\it reset --hard`,
		String.raw`git re\set --hard`,
		String.raw`git reset --ha\rd`,
		'g=git; $g reset --hard',
		'x=--hard; git reset $x',
		'p=.; git checkout $p',
		'git reset --har',
		'git clean --forc',
		'git checkout --forc',
		'env -u git git reset --hard',
		'git --config-env a.b=PATH reset --hard',
		'git --attr-source HEAD reset --hard',
		'git clean -f -e -n',
		'git status # "\ngit reset --hard',
		"git status # don't\ngit reset --hard",
		String.raw`git log --format=it\'s; git reset --hard`,
		'git checkout-index -a -f',
		'git read-tree --reset -u HEAD',
		'git restore ":(top)"',
		'git checkout ./.',
		'git checkout -- *',
		'git restore *',
		'git submodule foreach git reset --hard',
		'git rebase -x "git reset --hard" main',
		'git bisect run git reset --hard',
		// From a second attack on the hardened version.
		'git reset --h',
		'git clean --f',
		'git checkout --f',
		'git restore --staged --w .',
		'git clean -n --no-dry-run -f',
		'git clean -fe -n',
		'git clean -f --excl -n',
		'git -c clean.requireForce=false clean',
		's=reset; git $s --hard',
		'g=git; env $g reset --hard',
		'g=git; if true; then $g reset --hard; fi',
		'g=git; { $g reset --hard; }',
		'echo reset --hard | xargs git',
		'echo --hard | xargs git reset',
		'git ls-files -m | xargs git checkout --',
		'git checkout -- src/..',
		'git restore src/..',
		"git restore '*.*'",
		"git restore './*'",
		"git restore -- '[a-z]*'",
		'git rebase --exec="git reset --hard" main',
	])('denies %s', (command) => {
		expect(verdict(command)).not.toBeNull();
	});

	test.each([
		'git reset',
		'git reset HEAD file.txt',
		'git reset -- file.txt',
		'git reset --soft HEAD',
		'git reset --soft HEAD~1',
		'd=sub; git -C "$d" status',
		'git ls-files | xargs git add',
		'git checkout feature/login',
		'git restore src/components/Button.tsx',
		'git rebase main',
		'git submodule update --init',
		'git stash',
		'git clean -n',
		'git clean -n -f',
		'git clean --dry-run --force',
		'git clean -i',
		'git checkout main',
		'git checkout -b feature',
		'git checkout -- src/file.ts',
		'git switch main',
		'git restore src/file.ts',
		'git restore --staged .',
		'git restore -S .',
		'git status; ls .',
		'git checkout main; ls .',
		'git -C . status',
		'git log --oneline -- .',
		'git commit -m "reset --hard is in this message"',
		'echo "git reset --hard"',
	])('allows %s', (command) => {
		expect(verdict(command)).toBeNull();
	});
});
