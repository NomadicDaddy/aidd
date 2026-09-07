import { type ReactNode, useId, useRef, useState } from 'react';

import type { BackendDefaultSettings, BackendName } from '../../api/types.ts';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { backendLabel } from '../../lib/backends.ts';
import { toneText } from '../../lib/tones.ts';
import {
	backendDefaultsEqual,
	backendHasLocalDefaults,
	effectiveBackendModel,
	focusBackendDisclosureTrigger,
	nextBackendDisclosureExpanded,
} from './backendDefaultDisclosure.ts';
import { BackendDefaultFields } from './BackendDefaultFields.tsx';

interface DisclosureState {
	dirty: boolean;
	expanded: boolean;
}

export function BackendDefaultsDisclosureRow({
	backend,
	defaults,
	identity,
	savedDefaults,
	setBackendDefault,
	shadowedSharedModel,
	sharedIdleNudgeTimeoutSeconds,
	sharedIdleTimeoutSeconds,
	sharedModel,
}: {
	backend: BackendName;
	defaults: BackendDefaultSettings;
	identity: ReactNode;
	savedDefaults: BackendDefaultSettings;
	setBackendDefault: (
		backend: BackendName,
		key: keyof BackendDefaultSettings,
		value: null | number | string,
	) => void;
	shadowedSharedModel: null | string;
	sharedIdleNudgeTimeoutSeconds: null | number;
	sharedIdleTimeoutSeconds: null | number;
	sharedModel: null | string | undefined;
}) {
	const panelId = useId();
	const dirtyMessageId = `${panelId}-dirty`;
	const triggerRef = useRef<HTMLButtonElement>(null);
	const dirty = !backendDefaultsEqual(defaults, savedDefaults);
	const [disclosure, setDisclosure] = useState<DisclosureState>(() => ({
		dirty,
		expanded: dirty,
	}));
	// A row edited in the two-column or table layout may already be dirty when the viewport narrows.
	// Latching that state keeps the focused field mounted when an edit is reverted; the operator
	// explicitly collapses the now-clean row and focus returns to the disclosure trigger.
	if (disclosure.dirty !== dirty) {
		setDisclosure({ dirty, expanded: dirty || disclosure.expanded });
	}
	const expanded = dirty || disclosure.expanded;
	const hasLocalDefaults = backendHasLocalDefaults(defaults);
	const effectiveModel = effectiveBackendModel(defaults, sharedModel);
	const cliLabel = backendLabel(backend);

	function toggleDisclosure(): void {
		const nextExpanded = nextBackendDisclosureExpanded(expanded, dirty);
		if (nextExpanded === expanded) return;
		setDisclosure({ dirty, expanded: nextExpanded });
		if (!nextExpanded) {
			requestAnimationFrame(() => focusBackendDisclosureTrigger(triggerRef.current));
		}
	}

	return (
		<Card className="p-0">
			<button
				aria-controls={panelId}
				aria-describedby={dirty ? dirtyMessageId : undefined}
				aria-expanded={expanded}
				aria-label={`${expanded ? 'Collapse' : 'Expand'} ${cliLabel} CLI defaults`}
				className="grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 px-3 py-2 text-left transition-colors duration-150 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:outline-none focus-visible:ring-inset"
				onClick={toggleDisclosure}
				ref={triggerRef}
				type="button">
				<span className="text-muted-foreground">
					<DisclosureMarker open={expanded} />
				</span>
				<div className="min-w-0">{identity}</div>
				<div className="col-start-2 flex min-w-0 flex-col items-start gap-1">
					<span
						className="font-mono text-xs break-words text-muted-foreground"
						title={effectiveModel}>
						Model: {effectiveModel}
					</span>
					<Badge tone="neutral">
						{hasLocalDefaults ? 'Local defaults' : 'Shared defaults'}
					</Badge>
				</div>
			</button>

			{expanded ? (
				<div
					aria-label={`${cliLabel} CLI default controls`}
					className="border-t border-border px-3 py-3"
					id={panelId}
					role="region">
					<div className="grid gap-2">
						<BackendDefaultFields
							backend={backend}
							defaults={defaults}
							setBackendDefault={setBackendDefault}
							shadowedSharedModel={shadowedSharedModel}
							sharedIdleNudgeTimeoutSeconds={sharedIdleNudgeTimeoutSeconds}
							sharedIdleTimeoutSeconds={sharedIdleTimeoutSeconds}
							showLabels
						/>
					</div>
					{dirty ? (
						<p
							className={`mt-2 text-xs ${toneText.amber}`}
							id={dirtyMessageId}
							role="status">
							Unsaved changes keep this CLI open. Save or discard them before
							collapsing.
						</p>
					) : null}
				</div>
			) : null}
		</Card>
	);
}
