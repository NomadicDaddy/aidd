import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const FRONTEND = join(import.meta.dir, '..', '..', 'frontend', 'src');

describe('shared table header separator', () => {
	test('pins every painted header-cell layer with a perceptible separator', async () => {
		const styles = await Bun.file(join(FRONTEND, 'lib', 'tableStyles.ts')).text();
		const tableHeadDeclaration = styles.slice(
			styles.indexOf('export const tableHeadClass'),
			styles.indexOf('/**\n * The default sizing contract'),
		);

		expect(tableHeadDeclaration).toContain('[&_th]:border-b');
		expect(tableHeadDeclaration).toContain('[&_th]:border-control-border');
		expect(tableHeadDeclaration).toContain('[&_th]:bg-muted');
		expect(tableHeadDeclaration).toContain("'sticky top-0 z-20 text-muted-foreground'");
		expect(tableHeadDeclaration).not.toContain("'border-b");
		expect(tableHeadDeclaration).not.toContain("'bg-muted");
	});
});
