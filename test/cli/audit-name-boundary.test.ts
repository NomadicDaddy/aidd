import { expect, test } from 'bun:test';
import { loadAuditPromptDefinition } from '../../cli/src/prompts/compile/audit/definitions.ts';

test.each([
	'../README',
	'../../spernakit/README',
	'SECURITY/OTHER',
	'SECURITY\\OTHER',
	'security',
	'',
])('audit loader rejects %s before reading', async (name) => {
	await expect(loadAuditPromptDefinition(process.cwd(), name)).rejects.toThrow(
		'Invalid audit name',
	);
});

test('audit loader still reads the shipped catalog', async () => {
	const definition = await loadAuditPromptDefinition(process.cwd(), 'SECURITY');
	expect(definition.name).toBe('SECURITY');
	expect(definition.body.length).toBeGreaterThan(100);
});
