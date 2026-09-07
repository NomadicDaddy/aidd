import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

interface RenderedSkillDetails {
	bundled: string;
	imported: string;
}

function renderSkillDetails(): RenderedSkillDetails {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { SkillDetailsCard } from './src/pages/skills/SkillDetailsCard.tsx';

function skill(overrides) {
	return {
		body: '# Demo Skill',
		category: 'general',
		description: 'Describes what the skill does.',
		extensions: {},
		id: 'demo-skill',
		metadata: {},
		origin: 'bundled',
		sourcePath: 'D:/applications/aidd/skills/demo-skill/SKILL.md',
		supportPaths: [],
		title: 'Demo Skill',
		usage: 'demo-skill',
		...overrides,
	};
}

function render(skillDefinition) {
	return renderToStaticMarkup(
		createElement(
			MemoryRouter,
			null,
			createElement(SkillDetailsCard, { onDelete: () => {}, skill: skillDefinition }),
		),
	);
}

console.log(JSON.stringify({
	bundled: render(skill({
		allowedTools: 'Read',
		compatibility: 'Codex',
	})),
	imported: render(skill({
		id: 'imported-skill',
		imported: {
			category: 'general',
			importedAt: '2026-08-31T12:00:00.000Z',
			sourcePath: 'D:/skill-sources/imported-skill',
			sourceSha256: '${'a'.repeat(64)}',
		},
		origin: 'imported',
		sourcePath: 'D:/applications/aidd/data/skills/imported-skill/SKILL.md',
		title: 'Imported Skill',
	})),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as RenderedSkillDetails;
}

const rendered = renderSkillDetails();

describe('skill source details', () => {
	test('a bundled skill exposes its definition source and advisory declarations', () => {
		expect(rendered.bundled).toContain('Source');
		expect(rendered.bundled).toContain('D:/applications/aidd/skills/demo-skill/SKILL.md');
		expect(rendered.bundled).toContain('Advisory declarations');
		expect(rendered.bundled).toContain('Compatibility: Codex');
		expect(rendered.bundled).toContain('Allowed tools: Read');
		expect(rendered.bundled).not.toContain('Imported:');
		expect(rendered.bundled).not.toContain('SHA-256:');
		expect(rendered.bundled).not.toContain('Delete imported skill');
	});

	test('an imported skill retains its complete import provenance and delete action', () => {
		expect(rendered.imported).toContain('Import source');
		expect(rendered.imported).toContain('Source: D:/skill-sources/imported-skill');
		expect(rendered.imported).toContain('Imported:');
		expect(rendered.imported).toContain(`SHA-256: ${'a'.repeat(64)}`);
		expect(rendered.imported).toContain('Delete imported skill');
		expect(rendered.imported).not.toContain(
			'D:/applications/aidd/data/skills/imported-skill/SKILL.md',
		);
	});
});
