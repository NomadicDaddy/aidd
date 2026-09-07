import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const TABLE = resolve(import.meta.dir, '../../frontend/src/pages/audits/tabs/CatalogTable.tsx');

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

describe('audit catalog rows are keyboard reachable', () => {
	test('a native audit control owns activation while the row remains a pointer shortcut', async () => {
		const source = stripComments(await Bun.file(TABLE).text());
		const rowStart = source.indexOf('<tr\n\t\t\t\t\t\t\t\t\tclassName={`cursor-pointer');
		const firstCellStart = source.indexOf('<td', rowStart + 1);
		const rowOpen = source.slice(rowStart, firstCellStart);
		const auditControlStart = source.indexOf('<button', firstCellStart);
		const auditControl = source.slice(
			auditControlStart,
			source.indexOf('</button>', auditControlStart),
		);

		expect(rowStart).toBeGreaterThan(-1);
		expect(rowOpen).toContain('onClick={() => onSelect(item.name)}');
		expect(rowOpen).not.toContain('role="button"');
		expect(rowOpen).not.toContain('tabIndex');
		expect(auditControlStart).toBeGreaterThan(firstCellStart);
		expect(auditControl).toContain('aria-pressed={selectedAudit === item.name}');
		expect(auditControl).toContain('event.stopPropagation();');
		expect(auditControl).toContain('onSelect(item.name);');
		expect(auditControl).toContain('type="button"');
	});

	test('the audit control uses the standard visible focus treatment', async () => {
		const source = stripComments(await Bun.file(TABLE).text());
		const auditControl = source.slice(
			source.indexOf('<button\n', source.indexOf('{definitions.map')),
			source.indexOf('</button>', source.indexOf('{definitions.map')),
		);

		expect(auditControl).toContain('focus-visible:ring-2');
		expect(auditControl).toContain('focus-visible:ring-ring/80');
		expect(auditControl).toContain('focus-visible:ring-offset-2');
		expect(auditControl).toContain('focus-visible:ring-offset-background');
		expect(auditControl).toContain('focus-visible:outline-none');
	});
});
