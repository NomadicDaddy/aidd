import { describe, expect, test } from 'bun:test';

import { commandCredentialLabel } from '../../scripts/lib/credential-disclosure/command.ts';

const SEARCH =
	'grep -n "useWorktrees" ~/.aidd/config.json /d/app/.aidd/aidd.config.json 2>&1 | cut -c1-120';
// The expanded home path a search prints. Assembled so the file holds no profile-path literal.
const HOME_CONFIG = ['', 'home', 'someone', '.aidd', 'config.json'].join('/');
const FLAG_LINE = `${HOME_CONFIG}:41:\t\t"useWorktrees": false,`;

// On 2026-10-01 an audit checked whether worktrees were switched on by searching the user config for
// one key. The file was opened, so the gate reported a disclosure, but the only line that came back
// from it was a boolean setting. A credential is never a JSON boolean, so nothing was disclosed.
describe('credential-disclosure: a search that returns only boolean settings', () => {
	test('one boolean line from the user config is not a disclosure', () => {
		expect(commandCredentialLabel(SEARCH, FLAG_LINE)).toBeUndefined();
	});

	test('output from the other commands in the same compound does not change that', () => {
		const command = `${SEARCH}; sed -n 1,3p audits/SEVERITY.md`;
		const output = `${FLAG_LINE}\n# Severity\n\nCritical means data loss.`;
		expect(commandCredentialLabel(command, output)).toBeUndefined();
	});

	test('nothing returned from the credential file is not a disclosure either', () => {
		const output = '/d/app/.aidd/aidd.config.json:3:\t"useWorktrees": true,';
		expect(commandCredentialLabel(SEARCH, output)).toBeUndefined();
	});

	// Every way the output could carry something other than a boolean setting stays reported.
	test('a string value from the user config is reported', () => {
		const output = `${HOME_CONFIG}:12:\t\t"apiKey": "abc123",`;
		expect(commandCredentialLabel(SEARCH, output)).toBe('aidd user config');
	});

	test('a boolean line beside a string line is reported', () => {
		const output = `${FLAG_LINE}\n${HOME_CONFIG}:12:\t\t"authToken": "abc",`;
		expect(commandCredentialLabel(SEARCH, output)).toBe('aidd user config');
	});

	test('a search of the credential file alone prints no filename, so it is reported', () => {
		const command = 'grep -n "useWorktrees" ~/.aidd/config.json';
		expect(commandCredentialLabel(command, '41:\t\t"useWorktrees": false,')).toBe(
			'aidd user config',
		);
	});

	test('context lines arrive unattributed, so a context switch is reported', () => {
		const command = SEARCH.replace('grep -n', 'grep -n -A2');
		expect(commandCredentialLabel(command, FLAG_LINE)).toBe('aidd user config');
	});

	test('a switch that drops the filename is reported', () => {
		const command = SEARCH.replace('grep -n', 'grep -nh');
		expect(commandCredentialLabel(command, FLAG_LINE)).toBe('aidd user config');
	});

	test('a search without line numbers is reported', () => {
		const command = SEARCH.replace('grep -n', 'grep');
		expect(commandCredentialLabel(command, FLAG_LINE)).toBe('aidd user config');
	});

	test('a later stage that can cut the filename off is reported', () => {
		const command = SEARCH.replace('cut -c1-120', 'cut -d: -f3');
		expect(commandCredentialLabel(command, '\t\t"useWorktrees": false,')).toBe(
			'aidd user config',
		);
	});

	test('a search whose result is redirected into a file is reported', () => {
		const command = 'grep -n "x" ~/.aidd/config.json other.json > /tmp/copy.txt';
		expect(commandCredentialLabel(command, FLAG_LINE)).toBe('aidd user config');
	});
});
