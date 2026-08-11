import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { join } from 'node:path';

import {
	forceStopAllowed,
	listLiveRunningRuns,
	parseNetstatListeningPids,
	parseStopWebArgs,
} from '../../scripts/stop-web.ts';
import { reportOrphanedSocket } from '../../scripts/lib/stop-web/process-control.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
function captureConsole(callback: () => void): string[] {
	const lines: string[] = [];
	const original = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	try {
		callback();
	} finally {
		console.log = original;
	}
	return lines;
}

describe('stop-web script helpers', () => {
	test('parses optional port override', () => {
		expect(parseStopWebArgs([])).toEqual({ force: false, port: null });
		expect(parseStopWebArgs(['--port', '4321'])).toEqual({ force: false, port: 4321 });
		expect(parseStopWebArgs(['-p', '4321'])).toEqual({ force: false, port: 4321 });
		expect(parseStopWebArgs(['--force'])).toEqual({ force: true, port: null });
		expect(parseStopWebArgs(['-f', '--port', '4321'])).toEqual({
			force: true,
			port: 4321,
		});
	});

	test('rejects invalid port override', () => {
		expect(() => parseStopWebArgs(['--port', '0'])).toThrow('--port must be between');
		expect(() => parseStopWebArgs(['--port', '70000'])).toThrow('--port must be between');
		expect(() => parseStopWebArgs(['--port', 'abc'])).toThrow('--port must be between');
	});

	test('extracts listening PIDs from Windows netstat output', () => {
		const output = [
			'  Proto  Local Address          Foreign Address        State           PID',
			'  TCP    127.0.0.1:3210         0.0.0.0:0              LISTENING       510460',
			'  TCP    127.0.0.1:3210         127.0.0.1:51532        ESTABLISHED     510460',
			'  TCP    [::1]:3210             [::]:0                 LISTENING       510460',
			'  TCP    0.0.0.0:443            0.0.0.0:0              LISTENING       1234',
		].join('\n');

		expect(parseNetstatListeningPids(output, 3210)).toEqual(['510460']);
		expect(parseNetstatListeningPids(output, 443)).toEqual(['1234']);
	});

	test('requires explicit force for Windows process termination fallback', () => {
		expect(forceStopAllowed({ force: false }, 'win32')).toBe(false);
		expect(forceStopAllowed({ force: true }, 'win32')).toBe(true);
		expect(forceStopAllowed({ force: false }, 'linux')).toBe(true);
	});

	test('orphaned socket report names active runs before reboot guidance', () => {
		const lines = captureConsole(() =>
			reportOrphanedSocket(
				3210,
				[38068],
				[{ id: 'run_live', pid: process.pid, projectPath: 'd:/applications/aidd' }],
			),
		);

		expect(lines.join('\n')).toContain('run_live');
		expect(lines.join('\n')).toContain(`PID ${process.pid}`);
		expect(lines.join('\n')).toContain('Wait for those runs to finish');
		expect(lines.join('\n')).not.toContain('netsh int ip reset');
	});

	test('lists only live running run PIDs for orphaned socket hints', async () => {
		const dataDir = await testTempDir('aidd-stop-web-runs-');
		try {
			const db = new Database(join(dataDir, 'aidd-panel.db'));
			db.exec(`
				create table runs (
					id text primary key,
					pid integer,
					project_path text not null,
					started_at integer not null,
					status text not null
				);
				insert into runs (id, pid, project_path, started_at, status)
				values
					('run_live', ${process.pid}, 'd:/applications/aidd', 2, 'running'),
					('run_dead', 99999999, 'd:/applications/aidd', 1, 'running'),
					('run_done', ${process.pid}, 'd:/applications/aidd', 3, 'completed');
			`);
			db.close();

			expect(listLiveRunningRuns(dataDir)).toEqual([
				{ id: 'run_live', pid: process.pid, projectPath: 'd:/applications/aidd' },
			]);
		} finally {
			await removeTempTree(dataDir);
		}
	});
});
