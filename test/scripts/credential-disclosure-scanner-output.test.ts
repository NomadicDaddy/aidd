import { describe, expect, test } from 'bun:test';

import { commandCredentialLabel } from '../../scripts/lib/credential-disclosure/command.ts';
import { scanLines } from '../../scripts/lib/credential-disclosure/scan.ts';
import { isEmptyScannerReport } from '../../scripts/lib/credential-disclosure/scanner-output.ts';

const command = `bun -e '/* inspect .env files */ const fs=require("fs"); fs.readFileSync(".env","utf8");'`;
const report = {
	envFiles: [],
	files: 1037,
	matches: [],
	packageControl: true,
	positiveControls: ['private-key', 'aws-access-id', 'provider-key', 'github-token'],
	textFiles: 969,
};

function records(output: string): string[] {
	return [
		JSON.stringify({
			item: {
				aggregated_output: output,
				command,
				id: 'scanner',
				status: 'completed',
				type: 'command_execution',
			},
			type: 'item.completed',
		}),
	];
}

describe('credential-disclosure scanner output', () => {
	test('fixed empty metadata contains no credential content despite inline path literals', () => {
		expect(commandCredentialLabel(command)).toBe('dotenv');
		expect(commandCredentialLabel(command, JSON.stringify(report))).toBeUndefined();
		expect(scanLines(records(JSON.stringify(report)), 'fixture.log')).toEqual([]);
	});

	test('the same inline read returning content remains a disclosure', () => {
		const output = 'SYNTHETIC_SETTING=synthetic-placeholder-value-for-positive-control';
		expect(scanLines(records(output), 'fixture.log')).toEqual([
			{ file: 'fixture.log', label: 'dotenv', line: 1 },
		]);
	});

	test('unknown, mixed, populated or invalid metadata stays fail closed', () => {
		for (const output of [
			`${JSON.stringify(report)}\nextra output`,
			JSON.stringify({ ...report, extra: 'synthetic content' }),
			JSON.stringify({ ...report, envFiles: ['.env'] }),
			JSON.stringify({ ...report, matches: [{ file: '.env', line: 1 }] }),
			JSON.stringify({ ...report, positiveControls: ['unexpected'] }),
			JSON.stringify({ ...report, files: -1 }),
			JSON.stringify({ ...report, textFiles: 1038 }),
			JSON.stringify({ ...report, packageControl: 'true' }),
			'null',
			'[]',
		]) {
			expect(isEmptyScannerReport(command, output)).toBe(false);
		}
	});

	test('unrelated tools do not acquire the scanner exception', () => {
		expect(isEmptyScannerReport('cat .env', JSON.stringify(report))).toBe(false);
		expect(isEmptyScannerReport(command, report)).toBe(false);
	});
});
