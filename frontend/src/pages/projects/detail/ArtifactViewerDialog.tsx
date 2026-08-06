import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { JsonTree } from '../../../components/shared/JsonTree.tsx';
import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { IconButton } from '../../../components/ui/button.tsx';
import { Dialog, DialogPanel } from '../../../components/ui/dialog.tsx';
import { SegmentedControl } from '../../../components/ui/segmented-control.tsx';
import { useProjectFile } from '../../../hooks/useProjectFile.ts';
import { type ArtifactViewerTarget, formatBytes } from './artifactsUtils.ts';

// Element styling for rendered markdown; the app does not ship a typography plugin, so the
// few elements artifacts actually use are styled here.
const markdownComponents = {
	a: (props: React.ComponentProps<'a'>) => (
		<a
			{...props}
			className="text-teal-700 underline dark:text-teal-400"
			rel="noreferrer"
			target="_blank"
		/>
	),
	code: (props: React.ComponentProps<'code'>) => (
		<code {...props} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" />
	),
	h1: (props: React.ComponentProps<'h1'>) => (
		<h1 {...props} className="mt-4 mb-2 text-lg font-semibold first:mt-0" />
	),
	h2: (props: React.ComponentProps<'h2'>) => (
		<h2 {...props} className="mt-4 mb-2 text-base font-semibold first:mt-0" />
	),
	h3: (props: React.ComponentProps<'h3'>) => (
		<h3 {...props} className="mt-3 mb-1.5 text-sm font-semibold first:mt-0" />
	),
	h4: (props: React.ComponentProps<'h4'>) => (
		<h4 {...props} className="mt-3 mb-1 text-sm font-medium first:mt-0" />
	),
	hr: (props: React.ComponentProps<'hr'>) => <hr {...props} className="my-4 border-border" />,
	li: (props: React.ComponentProps<'li'>) => <li {...props} className="my-0.5" />,
	ol: (props: React.ComponentProps<'ol'>) => <ol {...props} className="my-2 list-decimal pl-6" />,
	p: (props: React.ComponentProps<'p'>) => <p {...props} className="my-2 leading-6" />,
	pre: (props: React.ComponentProps<'pre'>) => (
		<pre
			{...props}
			className="my-2 overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs"
		/>
	),
	table: (props: React.ComponentProps<'table'>) => (
		<table {...props} className="my-2 border-collapse text-xs" />
	),
	td: (props: React.ComponentProps<'td'>) => (
		<td {...props} className="border border-border px-2 py-1" />
	),
	th: (props: React.ComponentProps<'th'>) => (
		<th {...props} className="border border-border bg-muted px-2 py-1 text-left font-medium" />
	),
	ul: (props: React.ComponentProps<'ul'>) => <ul {...props} className="my-2 list-disc pl-6" />,
};

function parsedJsonOrNull(content: string): unknown {
	try {
		return JSON.parse(content) as unknown;
	} catch {
		return null;
	}
}

export function ArtifactViewerDialog({
	onClose,
	projectId,
	target,
}: {
	onClose: () => void;
	projectId: string;
	target: ArtifactViewerTarget;
}) {
	const query = useProjectFile(projectId, target.path);
	const [jsonView, setJsonView] = useState<'raw' | 'tree'>('tree');
	const data = query.data;
	// A truncated JSON head is unparseable by construction; the raw fallback still shows it.
	const parsedJson = useMemo(
		() =>
			data?.state === 'ok' && data.kind === 'json' && !data.truncated
				? parsedJsonOrNull(data.content)
				: null,
		[data],
	);
	const displaySize = data?.state === 'ok' ? data.totalBytes : target.sizeBytes;

	const body = (() => {
		if (query.isLoading) {
			return <p className="text-xs text-muted-foreground">Loading…</p>;
		}
		if (query.isError || !data) {
			return (
				<p className="text-xs text-red-600 dark:text-red-400">
					Failed to load the artifact. Try again.
				</p>
			);
		}
		if (data.state !== 'ok') {
			return (
				<p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
					{data.state === 'missing'
						? 'The file no longer exists on disk.'
						: (data.reason ?? 'The file could not be read.')}
				</p>
			);
		}
		if (data.kind === 'markdown' && !data.truncated) {
			return (
				<div className="text-sm text-foreground">
					<ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
						{data.content}
					</ReactMarkdown>
				</div>
			);
		}
		if (data.kind === 'json' && parsedJson !== null) {
			return (
				<div className="space-y-2">
					<SegmentedControl<'raw' | 'tree'>
						ariaLabel="Switch between tree and raw JSON view"
						onChange={setJsonView}
						options={[
							{ label: 'Tree', value: 'tree' },
							{ label: 'Raw', value: 'raw' },
						]}
						value={jsonView}
					/>
					{jsonView === 'tree' ? (
						<JsonTree value={parsedJson} />
					) : (
						<pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs whitespace-pre text-foreground">
							{JSON.stringify(parsedJson, null, 2)}
						</pre>
					)}
				</div>
			);
		}
		return (
			<pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs whitespace-pre-wrap text-foreground">
				{data.content}
			</pre>
		);
	})();

	return (
		<Dialog
			aria-labelledby="artifact-viewer-title"
			initialFocus="container"
			lockScroll
			onClose={onClose}
			open
			overlayClassName="focus:outline-none"
			role="dialog">
			<DialogPanel className="flex max-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col overflow-hidden">
				<div className="flex items-start justify-between gap-3 border-b border-border p-4">
					<div className="min-w-0">
						<h2
							className="text-sm font-semibold text-foreground"
							id="artifact-viewer-title">
							{target.label}
						</h2>
						<p className="mt-0.5 font-mono text-xs break-all text-muted-foreground">
							{target.path}
						</p>
						{displaySize !== null || target.mtime ? (
							<p className="mt-0.5 text-xs text-muted-foreground">
								{displaySize === null ? '—' : formatBytes(displaySize)}
								{target.mtime ? (
									<>
										{' · '}
										<RelativeAge value={target.mtime} />
									</>
								) : null}
							</p>
						) : null}
					</div>
					<IconButton ariaLabel="Close artifact viewer" onClick={onClose} variant="ghost">
						<X className="h-4 w-4" />
					</IconButton>
				</div>
				<div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
					{data?.state === 'ok' && data.truncated ? (
						<p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
							Showing the first {formatBytes(data.content.length)} of{' '}
							{formatBytes(data.totalBytes)} — the file was capped by the server.
						</p>
					) : null}
					{body}
				</div>
			</DialogPanel>
		</Dialog>
	);
}
