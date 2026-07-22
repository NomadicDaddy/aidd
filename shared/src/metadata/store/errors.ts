export class InvalidRoadmapError extends Error {
	readonly filePath: string;
	readonly position?: { column: number; line: number; offset: number };
	readonly snippet?: string;

	constructor(input: { cause: unknown; filePath: string; raw: string }) {
		const detail = parseJsonErrorDetail(input.cause, input.raw);
		const where = detail.position
			? ` at line ${detail.position.line} col ${detail.position.column}`
			: '';
		const original = input.cause instanceof Error ? input.cause.message : String(input.cause);
		super(`Invalid JSON in ${input.filePath}${where}: ${original}`);
		this.name = 'InvalidRoadmapError';
		this.filePath = input.filePath;
		if (detail.position) this.position = detail.position;
		if (detail.snippet) this.snippet = detail.snippet;
	}
}

function parseJsonErrorDetail(
	cause: unknown,
	raw: string
): {
	position?: { column: number; line: number; offset: number };
	snippet?: string;
} {
	const message = cause instanceof Error ? cause.message : '';
	const positionMatch = message.match(/position\s+(\d+)/i);
	if (!positionMatch?.[1]) return {};
	const offset = Number(positionMatch[1]);
	if (!Number.isFinite(offset) || offset < 0 || offset > raw.length) return {};
	const prefix = raw.slice(0, offset);
	const line = (prefix.match(/\n/g)?.length ?? 0) + 1;
	const lastNewline = prefix.lastIndexOf('\n');
	const column = offset - (lastNewline === -1 ? 0 : lastNewline + 1) + 1;
	const snippetStart = Math.max(0, offset - 30);
	const snippetEnd = Math.min(raw.length, offset + 30);
	return {
		position: { column, line, offset },
		snippet: raw.slice(snippetStart, snippetEnd),
	};
}
