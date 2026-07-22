import { normalizeCoverageFile } from '../smoke-cache/coverage.ts';
import { type FileCoverageMetrics, isProductionSourcePath } from './contracts.ts';

interface MutableLcovRecord {
	functions: { covered: number; total: number };
	lines: { covered: number; total: number };
	path: string;
}

function emptyRecord(path: string): MutableLcovRecord {
	return {
		functions: { covered: 0, total: 0 },
		lines: { covered: 0, total: 0 },
		path,
	};
}

function parseCount(line: string, prefix: string): number | undefined {
	if (!line.startsWith(prefix)) return undefined;
	const value = Number.parseInt(line.slice(prefix.length), 10);
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`Invalid LCOV count: ${line}`);
	}
	return value;
}

export function parseProductionLcov(
	projectRoot: string,
	lcov: string
): Map<string, FileCoverageMetrics> {
	const files = new Map<string, FileCoverageMetrics>();
	let current: MutableLcovRecord | undefined;

	function finishRecord(): void {
		if (current === undefined || !isProductionSourcePath(current.path)) return;
		files.set(current.path, {
			functions: current.functions,
			lines: current.lines,
			path: current.path,
		});
	}

	for (const line of lcov.split(/\r?\n/)) {
		if (line.startsWith('SF:')) {
			finishRecord();
			current = emptyRecord(normalizeCoverageFile(projectRoot, line.slice(3)));
			continue;
		}
		if (line === 'end_of_record') {
			finishRecord();
			current = undefined;
			continue;
		}
		if (current === undefined) continue;

		const functionTotal = parseCount(line, 'FNF:');
		if (functionTotal !== undefined) current.functions.total = functionTotal;
		const functionCovered = parseCount(line, 'FNH:');
		if (functionCovered !== undefined) current.functions.covered = functionCovered;
		const lineTotal = parseCount(line, 'LF:');
		if (lineTotal !== undefined) current.lines.total = lineTotal;
		const lineCovered = parseCount(line, 'LH:');
		if (lineCovered !== undefined) current.lines.covered = lineCovered;
	}

	finishRecord();
	return files;
}
