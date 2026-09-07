import { useLayoutEffect, useSyncExternalStore } from 'react';

type DialogStackListener = () => void;
type DialogStackMembership = 'active' | 'present';

export interface DialogStackLayer {
	depth: number;
	ownsScrim: boolean;
}

export interface DialogStackSnapshot {
	activeDialogIds: readonly string[];
	presentDialogIds: readonly string[];
}

let stackSnapshot: DialogStackSnapshot = {
	activeDialogIds: [],
	presentDialogIds: [],
};
const listeners = new Set<DialogStackListener>();

function notifyListeners(): void {
	for (const listener of listeners) listener();
}

export function acquireDialogLayer(
	dialogId: string,
	membership: DialogStackMembership,
): () => void {
	const key = membership === 'active' ? 'activeDialogIds' : 'presentDialogIds';
	if (!stackSnapshot[key].includes(dialogId)) {
		stackSnapshot = { ...stackSnapshot, [key]: [...stackSnapshot[key], dialogId] };
		notifyListeners();
	}

	let released = false;
	return () => {
		if (released) return;
		released = true;
		if (!stackSnapshot[key].includes(dialogId)) return;
		stackSnapshot = {
			...stackSnapshot,
			[key]: stackSnapshot[key].filter((candidate) => candidate !== dialogId),
		};
		notifyListeners();
	};
}

export function getDialogStackSnapshot(): DialogStackSnapshot {
	return stackSnapshot;
}

export function resolveDialogStackLayer(
	dialogId: string,
	snapshot: DialogStackSnapshot,
): DialogStackLayer {
	const presentDepth = snapshot.presentDialogIds.indexOf(dialogId);
	const scrimOwner = snapshot.activeDialogIds[0] ?? snapshot.presentDialogIds[0];
	return {
		depth: presentDepth === -1 ? snapshot.presentDialogIds.length : presentDepth,
		ownsScrim: scrimOwner === undefined || scrimOwner === dialogId,
	};
}

function subscribe(listener: DialogStackListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useDialogStackLayer(
	dialogId: string,
	active: boolean,
	present: boolean,
	participates: boolean,
): DialogStackLayer {
	const snapshot = useSyncExternalStore(
		subscribe,
		getDialogStackSnapshot,
		getDialogStackSnapshot,
	);

	useLayoutEffect(() => {
		if (!participates || !present) return;
		return acquireDialogLayer(dialogId, 'present');
	}, [dialogId, participates, present]);

	useLayoutEffect(() => {
		if (!active || !participates) return;
		return acquireDialogLayer(dialogId, 'active');
	}, [active, dialogId, participates]);

	return resolveDialogStackLayer(dialogId, snapshot);
}
