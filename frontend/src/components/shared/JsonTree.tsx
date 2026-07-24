import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { useState } from 'react';

// Hand-rolled collapsible JSON tree. Objects and arrays collapse; the top two levels start
// expanded so a typical artifact (roadmap.json, feature.json) is scannable on open.
const defaultExpandedDepth = 2;

type JsonValue = { [key: string]: JsonValue } | boolean | JsonValue[] | null | number | string;

function PrimitiveValue({ value }: { value: boolean | null | number | string }) {
	if (typeof value === 'string') {
		return (
			<span className="break-all text-emerald-700 dark:text-emerald-400">
				&quot;{value}&quot;
			</span>
		);
	}
	if (typeof value === 'number') {
		return <span className="text-teal-700 dark:text-teal-400">{String(value)}</span>;
	}
	return <span className="text-amber-700 dark:text-amber-400">{String(value)}</span>;
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
		label !== null ? (
			<span className="text-neutral-700 dark:text-neutral-300">&quot;{label}&quot;: </span>
		) : null;

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
				className="inline-flex items-center gap-1 rounded text-left hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none dark:hover:bg-neutral-800/70"
				onClick={() => setExpanded((previous) => !previous)}
				type="button">
				<Chevron aria-hidden="true" className="h-3 w-3 shrink-0 text-neutral-500" />
				{keyPrefix}
				<span className="text-neutral-500 dark:text-neutral-400">{brackets}</span>
				<span className="text-[0.65rem] text-neutral-400 dark:text-neutral-500">
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
