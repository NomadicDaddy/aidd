import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useState } from 'react';

import { JsonTree } from '../../../components/shared/JsonTree.tsx';
import { MarkdownContent } from '../../../components/shared/MarkdownContent.tsx';
import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { IconButton } from '../../../components/ui/button.tsx';
import { Dialog, DialogPanel } from '../../../components/ui/dialog.tsx';
import { SegmentedControl } from '../../../components/ui/segmented-control.tsx';
import { useProjectFile } from '../../../hooks/useProjectFile.ts';
import { cn } from '../../../lib/cn.ts';
import { toneBorder, toneSurface, toneText } from '../../../lib/tones.ts';
import { type ArtifactViewerTarget, formatBytes, labelAddsNothing } from './artifactsUtils.ts';

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
	const parsedJson =
		data?.state === 'ok' && data.kind === 'json' && !data.truncated
			? parsedJsonOrNull(data.content)
			: null;
	const displaySize = data?.state === 'ok' ? data.totalBytes : target.sizeBytes;

	const body = (() => {
		if (query.isLoading) {
			return <p className="text-xs text-muted-foreground">Loading…</p>;
		}
		if (query.isError || !data) {
			return (
				<p className={cn('text-xs', toneText.red)}>
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
			return <MarkdownContent markdown={data.content} measure="prose" />;
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
							{data.content}
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
			onClose={onClose}
			open
			overlayClassName="focus:outline-none"
			role="dialog">
			<DialogPanel className="flex max-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col overflow-hidden">
				<div className="flex items-start justify-between gap-3 border-b border-border p-4">
					<div className="min-w-0">
						<h2
							className="text-lg font-semibold text-foreground"
							id="artifact-viewer-title">
							{target.label}
						</h2>
						{labelAddsNothing(target.path, target.label) ? null : (
							<p className="mt-0.5 font-mono text-xs break-all text-muted-foreground">
								{target.path}
							</p>
						)}
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
						<p
							className={cn(
								'rounded-md border px-3 py-2 text-xs',
								toneBorder.amber,
								toneSurface.amber,
								toneText.amber,
							)}>
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
