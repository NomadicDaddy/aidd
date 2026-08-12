import { useEffect, useRef, useState } from 'react';

import { auditCatalogCardId, auditDefinitionEditorId } from '../auditsUtils.ts';

interface CatalogMobileNavigationOptions {
	dirty: boolean;
	onSelectAudit: (name: string) => void;
	selectedAudit: null | string;
}

export function useCatalogMobileNavigation({
	dirty,
	onSelectAudit,
	selectedAudit,
}: CatalogMobileNavigationOptions) {
	const catalogRef = useRef<HTMLDivElement>(null);
	const restoreFocusRef = useRef(false);
	const [pendingAudit, setPendingAudit] = useState<null | string>(null);
	const [showEditor, setShowEditor] = useState(false);

	useEffect(() => {
		if (showEditor || !restoreFocusRef.current) return;
		restoreFocusRef.current = false;
		const catalog = catalogRef.current;
		catalog?.scrollIntoView({ block: 'start' });
		const selectedCard = selectedAudit
			? document.getElementById(auditCatalogCardId(selectedAudit))
			: null;
		(selectedCard ?? catalog)?.focus({ preventScroll: true });
	}, [selectedAudit, showEditor]);

	useEffect(() => {
		if (!showEditor) return;
		document
			.getElementById(auditDefinitionEditorId)
			?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}, [selectedAudit, showEditor]);

	function activateAudit(name: string): void {
		onSelectAudit(name);
		setShowEditor(true);
	}

	function selectAudit(name: string): void {
		if (name !== selectedAudit && dirty) {
			setPendingAudit(name);
			return;
		}
		activateAudit(name);
	}

	function confirmSelection(): void {
		if (!pendingAudit) return;
		activateAudit(pendingAudit);
		setPendingAudit(null);
	}

	function returnToCatalog(): void {
		restoreFocusRef.current = true;
		setShowEditor(false);
	}

	return {
		cancelSelection: () => setPendingAudit(null),
		catalogRef,
		confirmSelection,
		pendingAudit,
		returnToCatalog,
		selectAudit,
		showEditor,
	};
}
