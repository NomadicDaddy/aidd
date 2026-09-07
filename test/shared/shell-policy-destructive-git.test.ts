import { describe, expect, test } from 'bun:test';

import { checkBashWorkspacePolicy } from '../../shared/src/agent/tools/shell-policy';

describe('shell workspace policy — destructive git commands', () => {
	const cwd = '/workspace/project';

	test('blocks git reset --hard', () => {
		expect(checkBashWorkspacePolicy('git reset --hard', cwd)).toContain('destructive git');
		expect(checkBashWorkspacePolicy('git reset --hard HEAD', cwd)).toContain('destructive git');
		expect(checkBashWorkspacePolicy('git reset --hard HEAD~5', cwd)).toContain(
			'destructive git',
		);
	});

	test('blocks git reset HEAD~N (rewinds HEAD)', () => {
		expect(checkBashWorkspacePolicy('git reset HEAD~3', cwd)).toContain('destructive git');
		expect(checkBashWorkspacePolicy('git reset HEAD~1', cwd)).toContain('destructive git');
	});

	test('blocks git checkout .', () => {
		expect(checkBashWorkspacePolicy('git checkout .', cwd)).toContain('destructive git');
		expect(checkBashWorkspacePolicy('git checkout -- .', cwd)).toContain('destructive git');
	});

	test('blocks git restore .', () => {
		expect(checkBashWorkspacePolicy('git restore .', cwd)).toContain('destructive git');
		expect(checkBashWorkspacePolicy('git restore -- .', cwd)).toContain('destructive git');
	});

	test('blocks git clean with -f flag', () => {
		expect(checkBashWorkspacePolicy('git clean -f', cwd)).toContain('destructive git');
		expect(checkBashWorkspacePolicy('git clean -fd', cwd)).toContain('destructive git');
		expect(checkBashWorkspacePolicy('git clean -fdx', cwd)).toContain('destructive git');
		expect(checkBashWorkspacePolicy('git clean -df', cwd)).toContain('destructive git');
		expect(checkBashWorkspacePolicy('git clean -xf', cwd)).toContain('destructive git');
	});

	test('allows non-destructive git commands', () => {
		expect(checkBashWorkspacePolicy('git status', cwd)).toBeNull();
		expect(checkBashWorkspacePolicy('git log --oneline -5', cwd)).toBeNull();
		expect(checkBashWorkspacePolicy('git diff', cwd)).toBeNull();
		expect(checkBashWorkspacePolicy('git add file.txt', cwd)).toBeNull();
		expect(checkBashWorkspacePolicy('git commit -m "msg"', cwd)).toBeNull();
		expect(checkBashWorkspacePolicy('git checkout main', cwd)).toBeNull();
		expect(checkBashWorkspacePolicy('git checkout feature-branch', cwd)).toBeNull();
	});

	test('allows git clean without -f (dry-run, list)', () => {
		expect(checkBashWorkspacePolicy('git clean -n', cwd)).toBeNull();
		expect(checkBashWorkspacePolicy('git clean -nd', cwd)).toBeNull();
		expect(checkBashWorkspacePolicy('git clean -i', cwd)).toBeNull();
	});

	test('blocks destructive git in a compound command', () => {
		expect(checkBashWorkspacePolicy('echo hello && git reset --hard', cwd)).toContain(
			'destructive git',
		);
		expect(checkBashWorkspacePolicy('git status; git clean -fdx', cwd)).toContain(
			'destructive git',
		);
	});
});
