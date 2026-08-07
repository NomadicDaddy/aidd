import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { useState } from 'react';

import { cn } from '../../lib/cn.ts';
import { toneText } from '../../lib/tones.ts';

// Hand-rolled collapsible JSON tree. Objects and arrays collapse; the top two levels start
// expanded so a typical artifact (roadmap.json, feature.json) is scannable on open.
const defaultExpandedDepth = 2;

type JsonValue = { [key: string]: JsonValue } | boolean | JsonValue[] | null | number | string;

function PrimitiveValue({ value }: { value: boolean | null | number | string }) {
	if (typeof value === 'string') {
		return <span className={cn('break-all', toneText.emerald)}>&quot;{value}&quot;</span>;
	}
	if (typeof value === 'number') {
		return <span className={toneText.teal}>{String(value)}</span>;
	}
	return <span className={toneText.amber}>{String(value)}</span>;
}

function entryCountLabel(value: { [key: string]: JsonValue } | JsonValue[]): string {
	const count = Array.isArray(value) ? value.length : Object.keys(value).length;
	const noun = Array.isArray(value)
		? count === 1
			? 'item'
			: 'items'
		: count === 1
			? 'key'
			: 'keys';
	return `${count} ${noun}`;
}

function JsonNode({
	depth,
	label,
	value,
}: {
	depth: number;
	label: null | string;
	value: JsonValue;
}) {
	const [expanded, setExpanded] = useState(depth < defaultExpandedDepth);
	const keyPrefix =
		label !== null ? <span className="text-foreground">&quot;{label}&quot;: </span> : null;

	if (value === null || typeof value !== 'object') {
		return (
			<div className="pl-4">
				{keyPrefix}
				<PrimitiveValue value={value} />
			</div>
		);
	}

	const isArray = Array.isArray(value);
	const entries: [string, JsonValue][] = isArray
		? value.map((item, index) => [String(index), item] as [string, JsonValue])
		: Object.entries(value);
	const brackets = isArray ? '[…]' : '{…}';
	const Chevron = expanded ? ChevronDown : ChevronRight;

	return (
		<div className={depth === 0 ? '' : 'pl-4'}>
			<button
				className="inline-flex items-center gap-1 rounded text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:min-h-11"
				onClick={() => setExpanded((previous) => !previous)}
				type="button">
				<Chevron aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground" />
				{keyPrefix}
				<span className="text-muted-foreground">{brackets}</span>
				<span className="text-[0.65rem] text-muted-foreground">
					{entryCountLabel(value)}
				</span>
			</button>
			{expanded
				? entries.map(([key, child]) => (
						<JsonNode
							depth={depth + 1}
							key={key}
							label={isArray ? null : key}
							value={child}
						/>
					))
				: null}
		</div>
	);
}

export function JsonTree({ value }: { value: unknown }) {
	return (
		<div className="font-mono text-xs leading-relaxed">
			<JsonNode depth={0} label={null} value={value as JsonValue} />
		</div>
	);
}
