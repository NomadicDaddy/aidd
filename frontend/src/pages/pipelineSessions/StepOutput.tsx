/* eslint-disable react-refresh/only-export-components */
import { default as Copy } from 'lucide-react/dist/esm/icons/copy';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import type { PipelineStepResultRecord } from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';

export function stepTone(status: PipelineStepResultRecord['status']) {
	if (status === 'completed') return 'emerald';
	if (status === 'failed') return 'red';
	if (status === 'running' || status === 'queued') return 'cyan';
	return 'amber';
}

const STEP_OUTPUT_COLLAPSE_THRESHOLD = 2000;
const STEP_OUTPUT_COLLAPSED_LINES = 40;

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
			<pre
				aria-label="Step output"
				className="overflow-auto rounded-md bg-neutral-100 p-3 text-xs text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
				id={outputId}>
				{displayed}
				{collapsed ? '\n…' : ''}
			</pre>
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
