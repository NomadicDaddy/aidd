import { useEffect, useRef, useState } from 'react';

/** Floating find widget for one tab; search state is local, results live in the search addon. */
export function TerminalFindBar({
	onClose,
	onFind,
}: {
	onClose: () => void;
	onFind: (query: string, direction: 'incremental' | 'next' | 'previous') => void;
}) {
	const [query, setQuery] = useState('');
	const inputRef = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		inputRef.current?.focus();
	}, []);
	return (
		<div className="absolute top-1.5 right-4 z-10 flex items-center gap-1 rounded border border-neutral-200 bg-white p-1 shadow-md dark:border-teal-950/50 dark:bg-slate-900">
			<input
				aria-label="Find in terminal"
				className="h-6 w-44 rounded border border-neutral-200 bg-transparent px-1.5 text-xs text-neutral-800 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none dark:border-teal-950/50 dark:text-neutral-200"
				onChange={(event) => {
					setQuery(event.target.value);
					onFind(event.target.value, 'incremental');
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						onFind(query, event.shiftKey ? 'previous' : 'next');
					} else if (event.key === 'Escape') {
						event.preventDefault();
						onClose();
					}
				}}
				placeholder="Find"
				ref={inputRef}
				value={query}
			/>
			<button
				aria-label="Previous match"
				className="rounded px-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
				onClick={() => onFind(query, 'previous')}
				type="button">
				↑
			</button>
			<button
				aria-label="Next match"
				className="rounded px-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
				onClick={() => onFind(query, 'next')}
				type="button">
				↓
			</button>
			<button
				aria-label="Close find"
				className="rounded px-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
				onClick={onClose}
				type="button">
				✕
			</button>
		</div>
	);
}
