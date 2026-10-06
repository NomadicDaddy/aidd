import { describe, expect, test } from 'bun:test';

import { scanLines } from '../../scripts/lib/credential-disclosure/scan.ts';

function scan(command: string, output: string) {
	return scanLines(
		[
			JSON.stringify({
				type: 'item.completed',
				item: {
					type: 'command_execution',
					id: 'inspection',
					status: 'completed',
					command,
					aggregated_output: output,
				},
			}),
		],
		'fixture.log',
	);
}

const startup = "PS 7.6.6\nDon't Panic.\n\nAliases Loaded: qc, dev, env\n\n";
const permission = 'BUILTIN\\Administrators|FullControl|Inherited=False|Allow';
const aclCommand =
	"$paths = @('.env'); foreach ($path in $paths) { $acl = Get-Acl -LiteralPath $path; $acl.Access }";
const sourceMatches =
	'src/config.ts:10:const mode = process.env.MODE;\nsrc/main.ts:20:console.log(mode);';

describe('credential inspection result provenance', () => {
	test('a numbered search that names dotenv but returns only source matches is not a disclosure', () => {
		expect(
			scan("rg -n 'DATABASE|integration' src .env .env.example", startup + sourceMatches),
		).toEqual([]);
	});

	test('quoted PowerShell search needles are not mistaken for dotenv result paths', () => {
		const command = String.raw`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "rg -n \"JSON\\.stringify\\(process\\.env|integration\" src --glob '*.ts'"`;
		expect(scan(command, startup + sourceMatches)).toEqual([]);
	});

	test('real credential matches and unlabelled or mixed search output still fail', () => {
		for (const output of [
			`${sourceMatches}\n.env:3:API_KEY=fixture-value-that-is-not-a-real-secret`,
			`${sourceMatches}\nD:\\app\\.env:3:API_KEY=fixture-value-that-is-not-a-real-secret`,
			'API_KEY=fixture-value-that-is-not-a-real-secret',
			`${sourceMatches}\nAPI_KEY=fixture-value-that-is-not-a-real-secret`,
		])
			expect(scan('rg -n API_KEY src .env', output)).toHaveLength(1);
		expect(scan('rg -n mode src; cat .env', sourceMatches)).toHaveLength(1);
		for (const flag of ['--no-filename', '-h', '-Hh', '--replace=src/main.ts:1:', '-o']) {
			expect(scan(`rg -n ${flag} API_KEY .env`, sourceMatches)).toHaveLength(1);
		}
	});

	// Two shapes from a 2026-10-06 audit run that returned only search hits and the command's own
	// messages. A later statement's `-Force` was read as rg's `-o`, and a printed literal as content.
	test("a later statement's switches and the command's own printed literals are not file content", () => {
		const listing = String.raw`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "rg -n \"fetch\\(|baseUrl\" src --glob '!**/*.md'; if(Test-Path .env){'PRESENT .env'}; Get-ChildItem -Force -File | Where-Object {$_.Name -match '^\.env'} | Select-Object Name"`;
		expect(scan(listing, startup + sourceMatches)).toEqual([]);
		const probe = String.raw`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command '$envs = Get-ChildItem -Force -File | Where-Object {$_.Name -match "^\.env"}; if($envs){$envs.Name}else{"No .env files present at project root"}; $hits = rg -n -i "AKIA[0-9A-Z]{16}" src 2>$null; if($hits){$hits}else{"No credential-shaped matches"}'`;
		expect(
			scan(
				probe,
				`${startup}No .env files present at project root\nNo credential-shaped matches`,
			),
		).toEqual([]);

		// The same statements still fail closed when a returned line is neither.
		expect(
			scan(
				listing,
				`${startup}${sourceMatches}\nAPI_KEY=fixture-value-that-is-not-a-real-secret`,
			),
		).toHaveLength(1);
		expect(
			scan(
				'rg -n API_KEY .env; Get-ChildItem -Force',
				'.env:3:API_KEY=fixture-value-that-is-not-a-real-secret',
			),
		).toHaveLength(1);
		expect(scan('rg -n API_KEY .env -o; echo done', sourceMatches)).toHaveLength(1);
	});

	// Both found by review of the change above: a literal is excused only where it is printed, and
	// every search in the command is judged, not only the first.
	test('an unprinted literal or a later provenance-dropping search still fails closed', () => {
		const returned = '.env:1:FIXTURE=synthetic-review-value-only';
		expect(scan(`rg -n FIXTURE .env; $unused = '${returned}'`, returned)).toHaveLength(1);
		expect(scan(`rg -n FIXTURE .env; echo '${returned}'`, returned)).toHaveLength(1);
		expect(
			scan(
				"rg -n absent src; rg -n --no-filename --replace 'src/mock.ts:1:$0' FIXTURE .env",
				'src/mock.ts:1:1:FIXTURE=synthetic-review-value-only',
			),
		).toHaveLength(1);
		expect(scan("rg -n FIXTURE src; echo 'scan done'", `${sourceMatches}\nscan done`)).toEqual(
			[],
		);
		// A PowerShell script quoted for bash, as the audit log recorded it.
		const bashQuoted = `pwsh.exe -Command '$e = Get-ChildItem -Force | Where-Object {"'$_.Name -match '"'"'^'"\\.env'}; if("'$e){$e.Name}else{'"'No .env files present'}; rg -n -i KEY src'`;
		expect(scan(bashQuoted, `${startup}No .env files present`)).toEqual([]);
	});

	test('ACL owner and permission lines return metadata rather than file contents', () => {
		for (const output of [
			`Owner=HOST\\user\n${permission}`,
			`env_exists=true\nowner=HOST\\user\nBUILTIN\\Administrators|FullControl|Allow|Inherited=True`,
			`PATH=.env OWNER=HOST\\user PROTECTED=True\nACL=${permission}`,
		])
			expect(scan(aclCommand, startup + output)).toEqual([]);
	});

	test('ACL tables and JSON contain only their declared metadata fields', () => {
		for (const output of [
			'Path    Owner     Principals\n----    -----     ----------\n.env    HOST\\user BUILTIN\\Administrators, NT AUTHO…',
			'Path    Protected Principals\n----    --------- ----------\n.env    True      BUILTIN\\Administrators,NT AUTHORI…',
			JSON.stringify([{ Path: '.env', Owner: 'HOST\\user', Principals: ['HOST\\user'] }]),
		])
			expect(scan(aclCommand, startup + output)).toEqual([]);
	});

	test('an ACL command does not excuse file reads or extra returned content', () => {
		const metadata = `Owner=HOST\\user\n${permission}`;
		for (const reader of [
			'Get-Content .env',
			'cat .env',
			'gc .env',
			'[IO.File]::ReadAllText(".env")',
		]) {
			expect(scan(`${aclCommand}; ${reader}`, metadata)).toHaveLength(1);
		}
		for (const output of [
			`${metadata}\nAPI_KEY=fixture-value-that-is-not-a-real-secret`,
			JSON.stringify([
				{
					Path: '.env',
					Owner: 'HOST\\user',
					Principals: ['HOST\\user'],
					Content: 'fixture-secret',
				},
			]),
			'Owner=HOST\\user\nUnrecognized output that must not silently pass inspection',
		])
			expect(scan(aclCommand, output)).toHaveLength(1);
	});
});
