import { describe, expect, test } from 'bun:test';

import type { WebContext } from '../../backend/src/context.ts';

import { createSkillsRoutes } from '../../backend/src/routes/skills.ts';

// GET /api/v1/skills sent every SKILL.md body, 93% of a 727 KB response, to pages that read only
// ids and titles (frontend re-audit, 2026-10-03). The Skills page now reads one body at a time
// from GET /api/v1/skills/:id, so the catalog leaves the bodies out.
const skill = {
	body: '# Long instructions\n'.repeat(200),
	category: 'workflow',
	description: 'What it does',
	id: 'example',
	title: 'Example',
};
const context = {
	skillService: {
		listSkills: async () => [skill],
		readSkill: async (id: string) => ({ ...skill, id }),
	},
} as unknown as WebContext;

describe('the skills catalog', () => {
	const app = createSkillsRoutes(context);

	test('lists every field but the body', async () => {
		const response = await app.handle(new Request('http://localhost/api/v1/skills'));
		expect(response.status).toBe(200);
		const { skills } = (await response.json()) as { skills: Record<string, unknown>[] };
		expect(skills).toEqual([
			{ category: 'workflow', description: 'What it does', id: 'example', title: 'Example' },
		]);
	});

	test('still returns the body for one skill', async () => {
		const response = await app.handle(new Request('http://localhost/api/v1/skills/example'));
		expect(response.status).toBe(200);
		const { skill: one } = (await response.json()) as { skill: { body: string } };
		expect(one.body).toBe(skill.body);
	});
});
