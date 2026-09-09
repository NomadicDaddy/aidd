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
	lcov: string,
): Map<string, FileCoverageMetrics> {
	const files = new Map<string, FileCoverageMetrics>();
	let current: MutableLcovRecord | undefined;

	function finishRecord(): void {
		if (current === undefined || !isProductionSourcePath(current.path)) return;
		// One source file can appear under more than one `SF:` record: when the runtime resolves
		// the same module through two spellings of its path — a package alias that lands on the
		// real path while a relative import keeps the launched one, which is what a Windows
		// `subst` drive, a symlink or a junction produces — it instruments an instance per
		// spelling, and each gets its own record. Overwriting would let a barely-exercised
		// duplicate erase the real measurement. Keep the fuller observation instead: whole, so
		// the covered counts stay paired with the totals they were measured against, and by
		// max rather than union so the number can never overstate what actually ran.
		const previous = files.get(current.path);
		if (
			previous !== undefined &&
			(previous.lines.covered > current.lines.covered ||
				(previous.lines.covered === current.lines.covered &&
					previous.functions.covered >= current.functions.covered))
		) {
			return;
		}
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
