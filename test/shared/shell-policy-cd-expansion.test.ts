import { describe, expect, test } from 'bun:test';

import { checkBashWorkspacePolicy } from '../../shared/src/agent/tools/shell-policy.ts';

const cwd = process.platform === 'win32' ? 'D:\\projects\\app' : '/projects/app';

// `cd "$AIDD_ROOT"` must not pass: a path check that sees the literal segment `$AIDD_ROOT` resolves
// it inside the workspace, and bash then expands it back out. Every path check after a `cd` is
// relative to the directory `cd` chose, so an unbounded destination unbinds the whole command.
describe('cd/pushd destinations that expand at runtime are denied', () => {
	const expanding = [
		'cd "$AIDD_ROOT"',
		'cd $AIDD_ROOT',
		'cd ${AIDD_ROOT}',
		'cd "${AIDD_ROOT}/cli"',
		'cd "$(git rev-parse --show-toplevel)"',
		'cd `dirname "$0"`',
		'pushd "$AIDD_ROOT"',
		'git status && cd "$OUT" && ls',
	];

	for (const command of expanding) {
		test(`denies ${command}`, () => {
			const result = checkBashWorkspacePolicy(command, cwd);
			expect(result).toContain('expanded at runtime');
			// The denial still carries the it-is-final trailer, or the agent retries a respelling.
			expect(result).toContain('will not succeed on retry');
		});
	}

	test('single quotes suppress expansion, so the target is a literal name', () => {
		expect(checkBashWorkspacePolicy("cd '$literal'", cwd)).toBeNull();
	});

	test('ordinary relative navigation is unaffected', () => {
		expect(checkBashWorkspacePolicy('cd src && bun test', cwd)).toBeNull();
		expect(checkBashWorkspacePolicy('cd ./packages/core', cwd)).toBeNull();
		expect(checkBashWorkspacePolicy('cd -', cwd)).toBeNull();
	});

	test('a bound $VAR outside a cd target stays allowed', () => {
		// The containment sweep expands what the command binds; an unbound name is denied there.
		expect(
			checkBashWorkspacePolicy('MESSAGE=hi; echo "$MESSAGE" > notes/out.txt', cwd),
		).toBeNull();
		expect(checkBashWorkspacePolicy('FILTER=policy; bun test "$FILTER"', cwd)).toBeNull();
	});

	test('a literal escape is still reported as an escape, not an expansion', () => {
		// Relative, so it reaches the cd branch: an absolute target is caught earlier by the
		// absolute-path sweep and reported as "references path outside workspace".
		expect(checkBashWorkspacePolicy('cd ../other', cwd)).toContain('would escape workspace');
	});
});
