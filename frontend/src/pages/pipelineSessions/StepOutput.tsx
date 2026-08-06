import { default as Copy } from 'lucide-react/dist/esm/icons/copy';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../../components/ui/button.tsx';
import { LogPre } from './LogPre.tsx';

const STEP_OUTPUT_COLLAPSE_THRESHOLD = 2000;
const STEP_OUTPUT_COLLAPSED_LINES = 40;

/**
 * What the backend keeps of a step's output: `formatOutputSummary` in
 * backend/src/services/pipeline/helpers.ts stores the LAST 4000 characters and nothing else.
 *
 * So a long step's summary is a tail cut at a byte, not at a line — the first visible characters are
 * the middle of whatever token the cut landed in, which on an NDJSON transcript is the inside of a
 * JSON string, escape debris and all. That is not a rendering bug to fix here; it is what was
 * persisted. The surface has to say so instead of presenting a mid-token fragment as the beginning
 * of the output. test/frontend/session-report-step-detail.test.ts reads the backend constant so the
 * two cannot drift.
 */
const STEP_OUTPUT_TAIL_CHARS = 4000;

/** Decode one layer of JSON string escaping and normalize literal \n / \r\n into real line breaks. */
function normalizeOutputNewlines(text: string): string {
	return text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

function formatStepOutput(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed === '') return raw;
	// Try JSON parse: handles JSON-encoded strings, objects, and arrays.
	if (trimmed[0] === '"' || trimmed[0] === '{' || trimmed[0] === '[') {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (typeof parsed === 'string') {
				// Decode the JSON string layer, then normalize any remaining escaped newlines.
				return normalizeOutputNewlines(parsed);
			}
			if (parsed !== null && typeof parsed === 'object') {
				return JSON.stringify(parsed, null, 2);
			}
			// JSON primitives (number, boolean, null) — return raw with newline normalization.
			return normalizeOutputNewlines(raw);
		} catch {
			// Not valid JSON — fall through to newline normalization.
		}
	}
	// For non-JSON text, normalize literal escaped newline sequences into real line breaks.
	return normalizeOutputNewlines(raw);
}

export function StepOutput({ output }: { output: string }) {
	const [expanded, setExpanded] = useState(false);
	const outputId = useId();
	const formatted = formatStepOutput(output);
	const lines = formatted.split('\n');
	const needsCollapse =
		formatted.length > STEP_OUTPUT_COLLAPSE_THRESHOLD ||
		lines.length > STEP_OUTPUT_COLLAPSED_LINES;
	const collapsed = needsCollapse && !expanded;
	const truncatedByLines = lines.slice(0, STEP_OUTPUT_COLLAPSED_LINES).join('\n');
	const truncatedByChars =
		truncatedByLines.length > STEP_OUTPUT_COLLAPSE_THRESHOLD
			? truncatedByLines.slice(0, STEP_OUTPUT_COLLAPSE_THRESHOLD)
			: truncatedByLines;
	const displayed = collapsed ? truncatedByChars : formatted;
	const hasOutput = formatted.length > 0;
	// The raw summary, not the formatted one: formatting can decode a JSON string layer and change
	// the length, but the cut happened before any of that.
	const isTail = output.length >= STEP_OUTPUT_TAIL_CHARS;

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(formatted);
			toast.success('Step output copied');
		} catch {
			toast.error('Could not copy step output');
		}
	};

	return (
		<div className="mt-3 space-y-2">
			<LogPre
				caption="Step output"
				// Expanding releases the cap instead of only flipping the button label. It was pinned
				// at `max-h-[520px]` in both states while the content went 648px to 1311px, so
				// "Show full output" scrolled a little further inside the same box and looked
				// completely inert.
				className={expanded ? 'max-h-none' : ''}
				id={outputId}
				{...(isTail
					? {
							meta: `last ${STEP_OUTPUT_TAIL_CHARS.toLocaleString()} characters of the run output`,
						}
					: {})}>
				{/* A leading ellipsis on its own line, so the first characters read as a resumption
				    rather than as a start. The cut is mid-token by construction — see
				    STEP_OUTPUT_TAIL_CHARS — and without this the slab opens on the inside of a
				    string literal with nothing saying anything is missing. */}
				{isTail ? '…\n' : ''}
				{displayed}
				{collapsed ? '\n…' : ''}
			</LogPre>
			{(needsCollapse || hasOutput) && (
				<div className="flex flex-wrap gap-2">
					{needsCollapse && (
						<Button
							aria-controls={outputId}
							aria-expanded={expanded}
							onClick={() => setExpanded((prev) => !prev)}
							variant="secondary">
							{expanded ? 'Collapse output' : 'Show full output'}
						</Button>
					)}
					{hasOutput && (
						<Button onClick={() => void handleCopy()} variant="secondary">
							<Copy className="h-4 w-4" />
							Copy
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
