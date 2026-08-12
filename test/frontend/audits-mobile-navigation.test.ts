import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import { auditCatalogCardId } from '../../frontend/src/pages/audits/auditsUtils.ts';

const ROOT = resolve(import.meta.dir, '../..');
const TABS = join(ROOT, 'frontend/src/pages/audits/tabs');

function read(file: string): Promise<string> {
	return Bun.file(join(TABS, file)).text();
}

describe('the mobile audit catalog is a reversible master-detail flow', () => {
	test('selecting a card replaces the list with the editor only below the desktop table', async () => {
		const tab = await read('CatalogTab.tsx');

		expect(tab).toContain("showEditor ? 'hidden xl:block' : undefined");
		expect(tab).toContain("showEditor ? undefined : 'hidden xl:block'");
		expect(tab).toContain('onSelect={selectAudit}');
	});

	test('the editor starts with a labelled mobile-only return control', async () => {
		const editor = await read('AuditDefinitionEditor.tsx');
		const backAt = editor.indexOf('Back to audit list');
		const cardAt = editor.indexOf('<Card className=');

		expect(backAt).toBeGreaterThan(-1);
		expect(cardAt).toBeGreaterThan(backAt);
		expect(editor.slice(0, backAt)).toContain('className="xl:hidden"');
		expect(editor.slice(0, backAt)).toContain('size="toolbar"');
	});

	test('return restores the catalog anchor and selected-card focus', async () => {
		const cards = await read('CatalogCards.tsx');
		const navigation = await read('useCatalogMobileNavigation.ts');

		expect(auditCatalogCardId('WEB DESIGN/GUIDELINES')).toBe(
			'audit-catalog-card-WEB%20DESIGN%2FGUIDELINES',
		);
		expect(cards).toContain('id={auditCatalogCardId(item.name)}');
		expect(navigation).toContain("catalog?.scrollIntoView({ block: 'start' })");
		expect(navigation).toContain('(selectedCard ?? catalog)?.focus({ preventScroll: true })');
		expect(navigation).toContain('restoreFocusRef.current = true');
	});
});

describe('mobile navigation preserves definition editing state', () => {
	test('returning hides rather than unmounts both panes', async () => {
		const tab = await read('CatalogTab.tsx');

		expect(tab).toContain('<CatalogTable');
		expect(tab).toContain('<AuditDefinitionEditor');
		expect(tab).not.toContain('showEditor ? <AuditDefinitionEditor');
		expect(tab).toContain('onContentChange={setContent}');
	});

	test('a second selection protects dirty definition content', async () => {
		const dialog = await read('CatalogSelectionDialog.tsx');
		const navigation = await read('useCatalogMobileNavigation.ts');
		const tab = await read('CatalogTab.tsx');

		expect(tab).toContain(
			'definition.data?.name === selectedAudit ? definition.data : undefined',
		);
		expect(tab).toContain('activeDefinition?.content !== undefined');
		expect(tab).toContain('selectionInitializedRef.current = true');
		expect(tab).toContain(
			'if (selectionInitializedRef.current || selectedAudit !== null) return',
		);
		expect(navigation).toContain('if (name !== selectedAudit && dirty)');
		expect(navigation).toContain('setPendingAudit(name)');
		expect(navigation).toContain('activateAudit(pendingAudit)');
		expect(dialog).toContain('You have unsaved changes to this audit definition.');
		expect(dialog).toContain('confirmLabel="Discard changes"');
	});
});
