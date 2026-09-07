import { describe, expect, test } from 'bun:test';

import { compileSkillDirective, parseSkillDefinition } from '../../shared/src/skills/catalog.ts';
import {
	renderSkillPathContext,
	resolveSkillRootPlaceholders,
} from '../../shared/src/skills/roots.ts';

const BODY = [
	'---',
	'name: demo-skill',
	'description: demo',
	'metadata:',
	'  aidd-category: runtime',
	'---',
	'',
	'# Demo',
	'',
	'Run from `<aidd-root>`: `bun run start -- --project-dir <app-dir> --check-features`.',
	'Read `<applications-root>/AGENTS.md` and `<spernakit-root>/docs/template/STACK.md`.',
	'',
].join('\n');

function skill() {
	return parseSkillDefinition({
		body: BODY,
		id: 'demo-skill',
		origin: 'bundled',
		sourcePath: 'D:/applications/aidd/skills/demo-skill/SKILL.md',
		supportPaths: [],
	});
}

describe('skill root placeholder resolution', () => {
	test('substitutes every root that resolves on this machine', () => {
		const resolved = resolveSkillRootPlaceholders(
			'<aidd-root>/cli <applications-root>/x <spernakit-root>/y',
			{
				aidd: 'D:/applications/aidd',
				applications: 'D:/applications',
				spernakit: 'D:/applications/spernakit',
			},
		);
		expect(resolved).toBe(
			'D:/applications/aidd/cli D:/applications/x D:/applications/spernakit/y',
		);
	});

	test('leaves an unconfigured root as its placeholder rather than guessing', () => {
		const resolved = resolveSkillRootPlaceholders('<aidd-root> <spernakit-root>', {
			aidd: 'D:/applications/aidd',
		});
		expect(resolved).toBe('D:/applications/aidd <spernakit-root>');
	});

	test('the path context names known roots and flags the unresolved ones', () => {
		const lines = renderSkillPathContext({
			aidd: 'D:/applications/aidd',
			project: 'D:/applications/agentwatch',
		}).join('\n');
		expect(lines).toContain(
			'Project workspace (your working directory): D:/applications/agentwatch',
		);
		expect(lines).toContain('aidd installation: D:/applications/aidd');
		expect(lines).toContain('<applications-root>');
		expect(lines).toContain('<spernakit-root>');
		expect(lines).toContain('report it as unavailable');
	});

	test('no path context is emitted when no root is known', () => {
		expect(renderSkillPathContext({})).toEqual([]);
	});
});

describe('compileSkillDirective root handling', () => {
	test('resolves the roots inside the inlined skill body', () => {
		const directive = compileSkillDirective(skill(), '', {
			aidd: 'D:/applications/aidd',
			applications: 'D:/applications',
			project: 'D:/applications/agentwatch',
		});
		expect(directive).toContain('Run from `D:/applications/aidd`');
		expect(directive).toContain('Read `D:/applications/AGENTS.md`');
		expect(directive).toContain('Path context (resolved by aidd for this run):');
		// Unconfigured, so it must survive as a placeholder and be named as unresolved.
		expect(directive).toContain('<spernakit-root>/docs/template/STACK.md');
	});

	test('omitting roots preserves the previous literal behavior', () => {
		const directive = compileSkillDirective(skill(), '');
		expect(directive).toContain('Run from `<aidd-root>`');
		expect(directive).not.toContain('Path context');
	});

	test('the skill definition path is marked as already inlined', () => {
		const directive = compileSkillDirective(skill(), '');
		expect(directive).toContain(
			'Skill definition: D:/applications/aidd/skills/demo-skill/SKILL.md (its full text is inlined below; do not read it from disk)',
		);
	});
});
