import { describe, expect, test } from 'bun:test';

import { checkBashWorkspacePolicy } from '../../shared/src/agent/tools/shell-policy';
import { tokenizeShell } from '../../shared/src/agent/tools/shell-policy-tokens';

// The policy and bash disagreed about what was quoted, so text bash runs as a command was judged
// as one harmless quoted token. Each denied command here read a file outside the workspace.
describe('shell workspace policy - quote state follows bash', () => {
	const cwd = '/workspace/project';
	const verdict = (command: string) => checkBashWorkspacePolicy(command, cwd);

	test.each([
		'echo "a\\"" ; cat ../outside/sentinel.txt ; echo "x"',
		'echo "a\\"" ; cat /c/fakehome/.aidd/config.json ; echo "x"',
		'echo a \\\\" "; cat ../outside/sentinel.txt; echo " "',
		"echo a # it's\ncat ../outside/sentinel.txt # it's",
		"cat <<EOF\nit's\nEOF\ncat ../outside/sentinel.txt # it's",
		"cat <<'EOF'\nit's\nEOF\ncat ../outside/sentinel.txt",
		"cat <<-EOF\n\tit's\n\tEOF\ncat ../outside/sentinel.txt",
		"cat <<A <<B\nit's\nA\nit's\nB\ncat ../outside/sentinel.txt",
		'xargs cat <<EOF\n../outside/sentinel.txt\nEOF',
		"cat <<EOF\nit's $SECRET_VALUE\nEOF",
	])('denies %j', (command) => {
		expect(verdict(command)).toContain('ERROR');
	});

	test.each([
		['echo "never closed', 'unterminated quote'],
		["echo 'never closed", 'unterminated quote'],
		["cat <<EOF\nit's", 'no terminator'],
		['cat <<EOF', 'no terminator'],
	])('names the reason for %j', (command, reason) => {
		expect(verdict(command)).toContain(reason);
	});

	test.each([
		'echo "quoted \\"inner\\" text" src/a.txt',
		"echo done # it's fine\ncat src/a.txt",
		"cat <<EOF\nit's ../x and more\nEOF\ncat src/a.txt",
		"cat <<'EOF' > src/out.txt\nit's ../x and $LITERAL\nEOF",
		"cat <<-EOF\n\tit's\n\tEOF",
		'echo $((1<<2))',
		'echo a#b src/a.txt',
		'cat <<<"text"',
		'rg "it\'s" src',
		"git commit -m 'it'\\''s done'",
	])('allows %j', (command) => {
		expect(verdict(command)).toBeNull();
	});
});

describe('tokenizeShell', () => {
	const words = (command: string) => tokenizeShell(command).map((token) => token.text);

	test('a backslash inside double quotes escapes only what bash says it does', () => {
		expect(words('echo "a\\"b" "c\\\\d" "e\\f"')).toEqual(['echo', 'a"b', 'c\\d', 'e\\f']);
	});

	test('nothing is escaped inside single quotes', () => {
		expect(words("echo 'a\\' b")).toEqual(['echo', 'a\\', 'b']);
	});

	test('a comment starts only at the start of a word', () => {
		expect(words("a#b # it's\nc")).toEqual(['a#b', 'c']);
		expect(words('""#x')).toEqual(['#x']);
	});

	test('a heredoc body yields no words, and the line after it does', () => {
		expect(words('cat <<EOF x\nbody ../y\nEOF\nnext')).toEqual(['cat', 'EOF', 'x', 'next']);
	});

	test('a backslash outside quotes stays, so a Windows path keeps its separator', () => {
		expect(words('cat ..\\outside.txt')).toEqual(['cat', '..\\outside.txt']);
	});
});
