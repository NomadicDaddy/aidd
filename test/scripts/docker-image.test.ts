import { describe, expect, test } from 'bun:test';

import { buildArgs, imageTags, publishPlan } from '../../scripts/docker-image.ts';

// The publication path (docker:build / docker:push) is the one live surface that ships the image
// to a registry. The license gate exists to catch a Dockerfile regression — dropped COPY of the
// notices, an npm install that re-bakes the agent CLIs — before it reaches a public registry. The
// finding these tests close: the gate was never wired into that path, and the one caller it had
// inspected a different tag than build produces. These tests pin the gate to the front of the
// publish sequence and to the exact tag the built image carries, so a regression that moves it
// (or drops it) fails here instead of shipping.
describe('publishPlan wires the license gate ahead of every push', () => {
	const pkg = { name: 'aidd', version: '2.121.0' };
	const { image, tags } = imageTags(pkg);

	test('places the check-image-licenses command at index 0, ahead of every docker push', () => {
		const plan = publishPlan(image, pkg.version, tags);

		expect(plan[0]?.cmd).toBe('bun');
		expect(plan[0]?.args[0]).toBe('scripts/check-image-licenses.ts');
	});

	test('targets the {version} tag, not :latest and not the smoke aidd:dev tag', () => {
		const plan = publishPlan(image, pkg.version, tags);
		const gateImage = plan[0]?.args[2];

		expect(gateImage).toBe(`ghcr.io/nomadicdaddy/aidd:${pkg.version}`);
		expect(gateImage).not.toContain(':latest');
		expect(gateImage).not.toContain('aidd:dev');
	});

	test('emits one docker push entry per tag (latest and version)', () => {
		const plan = publishPlan(image, pkg.version, tags);
		const pushes = plan.slice(1);

		expect(pushes).toHaveLength(tags.length);
		expect(pushes.every((step) => step.cmd === 'docker')).toBe(true);
		expect(pushes.map((step) => step.args[1])).toEqual(tags.map((tag) => `${image}:${tag}`));
	});

	test('check-image-licenses runs before any push can execute', () => {
		// The gate is index 0; every push is at index >= 1. A non-compliant image exits non-zero
		// and the push loop returns on the first failure, so the first push never runs.
		const plan = publishPlan(image, pkg.version, tags);

		const gateIndex = plan.findIndex(
			(step) => step.cmd === 'bun' && step.args[0] === 'scripts/check-image-licenses.ts'
		);
		const firstPushIndex = plan.findIndex(
			(step) => step.cmd === 'docker' && step.args[0] === 'push'
		);

		expect(gateIndex).toBe(0);
		expect(firstPushIndex).toBeGreaterThan(gateIndex);
	});
});

describe('buildArgs still emits both -t tags', () => {
	const { image, tags } = imageTags({ name: 'aidd', version: '2.121.0' });
	const args = buildArgs(image, tags);

	test('includes -t for :latest and :{version}', () => {
		for (const tag of tags) {
			expect(args).toContain(`${image}:${tag}`);
		}
	});

	test('places both -t flags before the build context', () => {
		const tagCount = args.filter((arg) => arg === '-t').length;
		expect(tagCount).toBe(tags.length);
	});
});
