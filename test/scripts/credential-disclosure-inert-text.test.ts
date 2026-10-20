import { describe, expect, test } from 'bun:test';

import { commandCredentialLabel } from '../../scripts/lib/credential-disclosure/command.ts';
import { maskInertHereStrings } from '../../scripts/lib/credential-disclosure/inert-text.ts';

// On 2026-10-01 the gate reported four disclosures in one audit run and none of them was a read.
// The sandbox audit had written lists of probe command STRINGS into fixture files with a quoted
// heredoc, and the build audit had requested `/.env` from the local panel over HTTP. In each the
// credential path was text the command wrote or sent, not a file it opened. A returned copy of the
// user config would have carried dozens of its key names on one line; no line of the log had more
// than five.
describe('credential-disclosure: a credential path that is only text', () => {
	test('a quoted heredoc written to a file is data, not a read', () => {
		const command = [
			'T=/tmp/work && cat > "$T/cmds.txt" <<\'EOF\'',
			'N cat $HOME/.aidd/config.json',
			'N cat ~/.aidd/config.json',
			'N cat ~/.ssh/id_ed25519',
			'EOF',
			'cd "$T" && bun probe.ts cmds.txt',
		].join('\n');
		expect(commandCredentialLabel(command, 'ok')).toBeUndefined();
	});

	// audit-secret-handling-retention-1790879440: a CRLF log kept `\r` on the terminator line, so it
	// never matched and every command after the heredoc was swallowed as body.
	test('a CRLF-joined heredoc still ends at its terminator, so the read after it is judged', () => {
		const lines = [
			'T=/tmp/work && cat > "$T/cmds.txt" <<\'EOF\'',
			'N cat ~/.ssh/id_ed25519',
			'EOF',
			'cat ~/.aidd/config.json',
		];
		expect(commandCredentialLabel(lines.join('\r\n'), 'x')).toBe('aidd user config');
		expect(commandCredentialLabel(lines.join('\n'), 'x')).toBe('aidd user config');
		expect(commandCredentialLabel(lines.slice(0, 2).join('\r\n'), 'x')).toBeUndefined();
	});

	test('a quoted heredoc written with tee, or with the redirect after it, is data too', () => {
		expect(
			commandCredentialLabel("tee list.txt <<'EOF'\ncat ~/.aidd/config.json\nEOF", 'x'),
		).toBeUndefined();
		expect(
			commandCredentialLabel("cat <<'EOF' > list.txt\ncat ~/.aidd/config.json\nEOF", 'x'),
		).toBeUndefined();
	});

	test('a source file written by heredoc that names the path as a string is data', () => {
		const command = [
			"cat > /tmp/p.ts <<'EOF'",
			"const cmds = ['cd; cat .aidd/config.json', 'cat ~/.aidd/config.json'];",
			'EOF',
			'bun /tmp/p.ts',
		].join('\n');
		expect(commandCredentialLabel(command, 'ok')).toBeUndefined();
	});

	test('a loop word list that is only requested over HTTP is not a read', () => {
		const command =
			'B=http://127.0.0.1:3210 && for P in index.html ".env" "src/main.tsx"; do echo "=== GET /$P"; curl -s -D - "$B/$P" | grep -i "^HTTP"; done';
		expect(commandCredentialLabel(command, 'HTTP/1.1 404 Not Found')).toBeUndefined();
	});

	// The same shapes, when they do open the file, must still be reported.
	test('an unquoted heredoc can expand a command substitution, so it is still judged', () => {
		const command = 'cat > out.txt <<EOF\n$(cat ~/.aidd/config.json)\nEOF';
		expect(commandCredentialLabel(command, 'x')).toBe('aidd user config');
	});

	test('a heredoc fed to a shell runs its body, so it is still judged', () => {
		expect(commandCredentialLabel("bash <<'EOF'\ncat ~/.aidd/config.json\nEOF", 'x')).toBe(
			'aidd user config',
		);
	});

	test('a loop that reads its word with a file-reading command is still judged', () => {
		expect(commandCredentialLabel('for F in .env; do cat "$F"; done', 'A=1')).toBe('dotenv');
	});

	test('a plain read after an inert heredoc is still judged', () => {
		const command = "cat > notes.txt <<'EOF'\nhello\nEOF\ncat ~/.aidd/config.json";
		expect(commandCredentialLabel(command, '{}')).toBe('aidd user config');
	});

	// A run log truncates a long command, so the terminator can be missing from the artifact. The
	// shell reads every remaining line as the body, so nothing after the operator is a command.
	test('a quoted heredoc with no terminator is all body', () => {
		const command = "cat > probe.ts <<'EOF'\nconst cmds = ['cat ~/.aidd/config.json',";
		expect(commandCredentialLabel(command, 'ok')).toBeUndefined();
	});

	test('an unquoted heredoc with no terminator is still judged', () => {
		const command = 'cat > out.txt <<EOF\n$(cat ~/.aidd/config.json)';
		expect(commandCredentialLabel(command, 'x')).toBe('aidd user config');
	});
});

// run_1792502439169 (2026-10-20): a codex sandbox audit wrote a bun test into a temporary file with
// a PowerShell here-string, and the test asserted that the shell policy refuses `cat` of the user
// config. The path was text in the file it wrote; the gate read it as a read, because codex wraps
// the script in bash quotes and the `\"` in the body sent every quote reader the wrong way.
describe('credential-disclosure: a PowerShell here-string written to a file', () => {
	const pwsh = String.raw`"C:\Program Files\PowerShell\7\pwsh.exe" -NoProfile -Command`;

	test('a here-string piped to Set-Content is data, not a read', () => {
		const command = [
			`${pwsh} '$testPath = Join-Path $env:TEMP '"'probe.test.ts'`,
			"@'",
			"import {test,expect} from 'bun:test';",
			"import {checkBashWorkspacePolicy as policy} from './shell-policy.ts';",
			"test('the home config is refused',()=>{",
			String.raw` expect(policy('cat \""'$HOME/.aidd/config.json"'"',one)).toContain('ERROR:');`,
			'});',
			`'@ | Set-Content -LiteralPath "'$testPath`,
			"bun test $testPath'",
		].join('\n');
		const output = '1 pass\n0 fail\nRan 1 test across 1 file. [120.00ms]';
		expect(commandCredentialLabel(command)).toBeUndefined();
		expect(commandCredentialLabel(command, output)).toBeUndefined();
	});

	test('a here-string redirected or sent to Out-File, or a @" one with nothing to expand, is data', () => {
		for (const command of [
			`${pwsh} "@'\ncat ~/.aidd/config.json\n'@ | Out-File list.txt"`,
			`${pwsh} "@'\ncat ~/.aidd/config.json\n'@ > list.txt"`,
			`${pwsh} '@"\nGet-Content ~/.aidd/config.json\n"@ | Set-Content list.txt'`,
		])
			expect(commandCredentialLabel(command, 'x')).toBeUndefined();
	});

	// The same shapes, when they do open the file, must still be reported.
	test('a read after the here-string is still judged', () => {
		const command = `${pwsh} "@'\nnotes\n'@ | Out-File x; cat ~/.aidd/config.json"`;
		expect(commandCredentialLabel(command, '{}')).toBe('aidd user config');
	});

	test('a here-string that runs a command, or is run, is left in place', () => {
		for (const command of [
			// PowerShell runs a `$(...)` subexpression in a @" body.
			`${pwsh} '@"\n$(Get-Content ~/.aidd/config.json)\n"@ | Set-Content x'`,
			// Bash runs a `$(...)` in its double quotes before PowerShell sees the @' body.
			`${pwsh} "@'\n$(cat ~/.aidd/config.json)\n'@ | Set-Content x"`,
			`${pwsh} "@'\nGet-Content ~/.aidd/config.json\n'@ | Invoke-Expression"`,
			`${pwsh} "@'\nGet-Content ~/.aidd/config.json\n'@"`,
		])
			expect(maskInertHereStrings(command)).toBe(command);
		const expanded = `${pwsh} "@'\n$(cat ~/.aidd/config.json)\n'@ | Set-Content x"`;
		expect(commandCredentialLabel(expanded, 'x')).toBe('aidd user config');
	});

	test('here-string lines outside a pwsh script argument are not a here-string', () => {
		const command =
			'printf "\n@\'\n"; cat ~/.aidd/config.json; printf "\n\'@ | Set-Content x\n"';
		expect(commandCredentialLabel(command, '{}')).toBe('aidd user config');
		const split =
			"printf '@'\"'\"'\n'; cat ~/.aidd/config.json; printf '\n'\"'\"'@ | Out-File x'";
		expect(commandCredentialLabel(split, '{}')).toBe('aidd user config');
	});
});
