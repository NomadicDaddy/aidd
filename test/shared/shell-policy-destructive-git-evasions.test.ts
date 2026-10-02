import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { checkBashWorkspacePolicy } from '../../shared/src/agent/tools/shell-policy';

// The 2026-10-01 GIT_DESTRUCTIVE_SAFETY audit attacked the tokenised check a third time. Every
// denied string below returned null and was run in a throwaway repository, where it discarded two
// edited tracked files or deleted an untracked one. They are grouped by what bash or git does to
// the text that the check did not do.
describe('shell workspace policy - destructive git, what bash and git do to the text', () => {
	const cwd = '/workspace/project';
	const verdict = (command: string) => checkBashWorkspacePolicy(command, cwd);
	const root = resolve(cwd).split('\\').join('/');

	// Bash deletes a backslash-newline pair before it reads words.
	test.each([
		'git res\\\net --hard',
		'gi\\\nt reset --hard',
		'git reset\\\n --hard',
		'git reset \\\n--hard',
		'git \\\nreset --hard',
		'git clean \\\n-fdx',
		'git checkout \\\n.',
	])('denies a command split by a line continuation: %j', (command) => {
		expect(verdict(command)).toContain('destructive git');
	});

	// Bash lifts a redirection out of the command wherever it stands.
	test.each([
		'git >o.txt reset --hard',
		'git 2>&1 reset --hard',
		'git <in.txt reset --hard',
		'git reset 2>&1 --hard',
		'git reset >&2 --hard',
		'git reset <&0 --hard',
		'git reset &> o.txt --hard',
		'git reset >| o.txt --hard',
		'git clean 2>&1 -fdx',
		'git clean 2>&1 --force',
		'git restore 2>&1 .',
		'git checkout 2>&1 .',
		'git checkout 2>&1 -f',
		'git switch 2>&1 -f main',
		'git reset 2>&1 HEAD~3',
		// A backslash makes `>` an argument, so the flag after it is still a flag.
		String.raw`git reset \> --hard`,
	])('denies a command with a redirection inside it: %s', (command) => {
		expect(verdict(command)).toContain('destructive git');
	});

	// Git stops reading options at `--`, hands the rest of a short cluster to the first letter
	// that takes a value, and never reads a value as a flag.
	test.each([
		'git clean -fdx -- . -n',
		'git clean -fd -- . --dry-run',
		'git clean -f --end-of-options . -n',
		'touch ./--staged; git add ./--staged; git restore -- . --staged',
		'git clean -fe-n',
		'git clean -fe.tmp',
		'git clean -fen',
		'git clean -fdxen',
		'git checkout -fb2',
		'git restore -sS .',
	])('denies a flag that git reads differently: %s', (command) => {
		expect(verdict(command)).toContain('destructive git');
	});

	// No terminal is attached, so an interactive mode can only be answered from a pipe.
	test.each([
		"printf '1\\n' | git clean -i",
		'git clean -i',
		'git clean --interactive',
		'yes | git checkout -p',
		'yes | git restore -p',
		'echo . | git restore --pathspec-from-file=-',
		'git ls-files -m | git checkout --pathspec-from-file=-',
	])('denies a command whose target arrives on standard input: %s', (command) => {
		expect(verdict(command)).toContain('destructive git');
	});

	test.each([
		`git restore ${root}`,
		`git checkout -- ${root}`,
		'x=it; g$x reset --hard',
		'x=; git$x reset --hard',
		'x=it; g${x} reset --hard',
		'echo reset --hard | xargs.exe git',
		'x=xargs; echo reset --hard | $x git',
		'echo --hard | xargs git -C . reset',
		'git ls-files -m | xargs git -C . checkout --',
		'find . -maxdepth 0 -exec git checkout {} +',
		'find . -maxdepth 0 -exec git restore -- {} +',
		'find . -maxdepth 0 -execdir git checkout {} +',
		'git config clean.requireForce false; git clean',
		'git config --global clean.requireForce false',
		String.raw`git -c clean.requireF\orce=false clean`,
		'git -c clean.require""Force=false clean',
		'git diff | git apply -R',
		'git diff > p.patch; git apply -R p.patch',
		'git rm -rf .',
		'git archive HEAD | tar -xf -',
	])('denies %s', (command) => {
		expect(verdict(command)).toContain('destructive git');
	});

	// A destructive command handed to something else as one quoted word.
	test.each([
		"env -S 'git reset --hard'",
		`awk 'BEGIN{system("git reset --hard")}'`,
		`node -e 'require("child_process").execSync("git reset --hard")'`,
		`bun -e 'Bun.spawnSync({cmd:["git","reset","--hard"]})'`,
		`python -c 'import os; os.system("git reset --hard")'`,
		'pwsh -c "git reset --hard"',
		`"bash" -c 'git reset --hard'`,
		"bash.exe -c 'git reset --hard'",
		"sh -ec 'git reset --hard'",
		"bash --norc -c 'git reset --hard'",
		`"eval" 'git reset --hard'`,
		"trap 'git reset --hard' EXIT",
	])('denies %s', (command) => {
		expect(verdict(command)).not.toBeNull();
	});

	test.each([
		'git status 2>&1',
		'git log > out.txt',
		'git diff 2>&1 | head -20',
		'git clean -n -- build',
		'git clean -nf',
		'git clean -fn',
		'git restore -S .',
		'git checkout -b feature',
		'git checkout -b fix-2 main',
		'git switch -c topic',
		'git apply fix.patch',
		'git rm old.txt',
		'git rm -r --cached .',
		'git archive -o out.zip HEAD',
		'git archive -o x.tar HEAD; tar -tf x.tar',
		'git ls-files | xargs git add',
		"find . -name '*.ts' -exec git add {} +",
		'd=sub; ls $d',
		'f=a.ts; cat src/$f',
		'for f in a b; do cp src/$f dst/$f; done',
		'grep -rn "git reset --hard" docs',
		"rg 'git clean -fd' src",
		'git commit -m "revert: undo git reset --hard guidance"',
		'bun test -t "resets the tree"',
		'node -e "console.log(1 + 1)"',
	])('allows %s', (command) => {
		expect(verdict(command)).toBeNull();
	});
});
