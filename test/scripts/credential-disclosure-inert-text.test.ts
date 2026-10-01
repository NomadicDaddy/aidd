import { describe, expect, test } from 'bun:test';

import { commandCredentialLabel } from '../../scripts/lib/credential-disclosure/command.ts';

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
});
