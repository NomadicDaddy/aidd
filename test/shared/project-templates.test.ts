import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { ResolvedProjectTemplateConfig } from 'aidd-shared/config';

import { resolveMergedConfig } from 'aidd-shared/config';

const BASE = resolve('/base');

function templatesOf(config: { web?: { templates: ResolvedProjectTemplateConfig[] } }) {
	if (!config.web) throw new Error('expected resolved web config');
	return config.web.templates;
}

describe('project template registry resolution', () => {
	test('always offers a spernakit template with the golden-path defaults', () => {
		const config = resolveMergedConfig(
			{ web: { allowedRoots: ['/base'], allowRemote: false } },
			{ baseDir: BASE }
		);
		const spernakit = templatesOf(config).find((template) => template.name === 'spernakit');
		expect(spernakit).toBeDefined();
		expect(spernakit?.postCreate).toBe('coding-run');
		expect(spernakit?.requiresDescription).toBe(true);
		// create.ts owns spernakit execution now (clone-then-init), so it is not bound to an init-dir.
		expect(spernakit?.rootMustBeInitDir).toBe(false);
	});

	test('offers only the spernakit template when nothing else is configured', () => {
		const config = resolveMergedConfig(
			{ web: { allowedRoots: ['/base'], allowRemote: false } },
			{ baseDir: BASE }
		);
		expect(templatesOf(config).map((template) => template.name)).toEqual(['spernakit']);
	});

	test('explicit templates default third-party postCreate to ingest and fill defaults', () => {
		const config = resolveMergedConfig(
			{
				web: {
					allowedRoots: ['/base'],
					allowRemote: false,
					templates: [
						{
							description: 'T3 stack',
							initCommand: ['bunx', 'create-t3-app@latest', '{name}'],
							name: 't3',
						},
					],
				},
			},
			{ baseDir: BASE }
		);
		const t3 = templatesOf(config).find((template) => template.name === 't3');
		expect(t3).toEqual({
			cwd: 'root',
			description: 'T3 stack',
			initCommand: ['bunx', 'create-t3-app@latest', '{name}'],
			name: 't3',
			postCreate: 'ingest',
			requiresDescription: false,
			rootMustBeInitDir: false,
			validationCommand: null,
		});
	});

	test('an explicit spernakit entry overrides the synthesized one', () => {
		const config = resolveMergedConfig(
			{
				web: {
					allowedRoots: ['/base'],
					allowRemote: false,
					spernakitInitScript: 'spernakit_init.ps1',
					templates: [
						{
							initCommand: ['custom-spernakit', '{name}'],
							name: 'spernakit',
							postCreate: 'ingest',
						},
					],
				},
			},
			{ baseDir: BASE }
		);
		const spernakitEntries = templatesOf(config).filter(
			(template) => template.name === 'spernakit'
		);
		expect(spernakitEntries).toHaveLength(1);
		expect(spernakitEntries[0]?.initCommand).toEqual(['custom-spernakit', '{name}']);
		expect(spernakitEntries[0]?.postCreate).toBe('ingest');
	});
});
