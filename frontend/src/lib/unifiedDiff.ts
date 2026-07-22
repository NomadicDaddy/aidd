// Parses `git show --stat --patch` output (produced with --no-color and core.quotepath=false)
// into per-file sections for rendering. Pure string processing — no git semantics beyond the
// unified diff format.

export type DiffLineKind = 'add' | 'context' | 'del' | 'hunk' | 'meta';

export interface DiffLine {
	kind: DiffLineKind;
	text: string;
}

export interface DiffFile {
	additions: number;
	deletions: number;
	/** File path for display; "old → new" for renames. */
	displayPath: string;
	isBinary: boolean;
	lines: DiffLine[];
}

export interface ParsedCommitDiff {
	files: DiffFile[];
	/** Commit message plus the --stat block — everything before the first `diff --git`. */
	header: string;
}

function lineKind(line: string): DiffLineKind {
	if (line.startsWith('@@')) return 'hunk';
	if (line.startsWith('+++') || line.startsWith('---')) return 'meta';
	if (line.startsWith('+')) return 'add';
	if (line.startsWith('-')) return 'del';
	if (
		line.startsWith('index ') ||
		line.startsWith('new file') ||
		line.startsWith('deleted file') ||
		line.startsWith('old mode') ||
		line.startsWith('new mode') ||
		line.startsWith('similarity index') ||
		line.startsWith('dissimilarity index') ||
		line.startsWith('rename from') ||
		line.startsWith('rename to') ||
		line.startsWith('copy from') ||
		line.startsWith('copy to')
	) {
		return 'meta';
	}
	return 'context';
}

// `diff --git a/<old> b/<new>`. With core.quotepath=false paths are literal (not escaped), but
// they can contain spaces — when old and new are equal (the common case) split the remainder
// evenly; renames are recovered from the explicit `rename from`/`rename to` lines instead.
function pathFromDiffGitLine(line: string): string {
	const remainder = line.slice('diff --git '.length);
	if (remainder.startsWith('a/')) {
		const stripped = remainder.slice(2);
		const middle = stripped.indexOf(' b/');
		if (middle !== -1) {
			const left = stripped.slice(0, middle);
			const right = stripped.slice(middle + 3);
			if (left === right) return left;
			// Paths with spaces can make this split ambiguous; prefer the right side, which is
			// the post-change path.
			return right;
		}
	}
	return remainder;
}

function parseFileSection(sectionLines: string[]): DiffFile {
	const file: DiffFile = {
		additions: 0,
		deletions: 0,
		displayPath: pathFromDiffGitLine(sectionLines[0] ?? ''),
		isBinary: false,
		lines: [],
	};
	let renameFrom: null | string = null;
	let renameTo: null | string = null;
	let inHunks = false;
	for (const [index, line] of sectionLines.entries()) {
		if (index === 0) {
			file.lines.push({ kind: 'meta', text: line });
			continue;
		}
		if (line.startsWith('Binary files ') && line.endsWith(' differ')) {
			file.isBinary = true;
			file.lines.push({ kind: 'meta', text: line });
			continue;
		}
		if (line.startsWith('rename from ')) renameFrom = line.slice('rename from '.length);
		if (line.startsWith('rename to ')) renameTo = line.slice('rename to '.length);
		if (line.startsWith('@@')) inHunks = true;
		const kind = inHunks ? hunkLineKind(line) : lineKind(line);
		if (kind === 'add') file.additions += 1;
		if (kind === 'del') file.deletions += 1;
		file.lines.push({ kind, text: line });
	}
	if (renameFrom !== null && renameTo !== null) {
		file.displayPath = `${renameFrom} → ${renameTo}`;
	}
	return file;
}

// Inside hunks the leading character is authoritative: a content line that happens to start
// with "index " or "rename to" must not be reclassified as meta.
function hunkLineKind(line: string): DiffLineKind {
	if (line.startsWith('@@')) return 'hunk';
	if (line.startsWith('+')) return 'add';
	if (line.startsWith('-')) return 'del';
	// `\ No newline at end of file`
	if (line.startsWith('\\')) return 'meta';
	return 'context';
}

export function parseGitShow(text: string): ParsedCommitDiff {
	if (!text) return { files: [], header: '' };
	const lines = text.split('\n');
	const headerLines: string[] = [];
	const sections: string[][] = [];
	let current: null | string[] = null;
	for (const line of lines) {
		if (line.startsWith('diff --git ')) {
			current = [line];
			sections.push(current);
			continue;
		}
		if (current === null) {
			headerLines.push(line);
		} else {
			current.push(line);
		}
	}
	// Drop a single trailing blank produced by the final newline of each section.
	for (const section of sections) {
		if (section.length > 1 && section[section.length - 1] === '') section.pop();
	}
	return {
		files: sections.map(parseFileSection),
		header: headerLines.join('\n').trimEnd(),
	};
}
