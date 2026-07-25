import { describe, expect, test } from 'bun:test';
import {
	classifyComplexity,
	complexitySignalsForFeature,
} from '../../shared/src/orchestrator/complexity.ts';

describe('classifyComplexity', () => {
	test('low when no deps and short text', () => {
		expect(classifyComplexity({ dependencyCount: 0, textLength: 50 })).toBe('low');
	});

	test('medium with one dependency', () => {
		expect(classifyComplexity({ dependencyCount: 1, textLength: 50 })).toBe('medium');
	});

	test('medium with a moderately long brief', () => {
		expect(classifyComplexity({ dependencyCount: 0, textLength: 500 })).toBe('medium');
	});

	test('high with many deps and a long brief', () => {
		expect(classifyComplexity({ dependencyCount: 3, textLength: 1500 })).toBe('high');
	});

	test('high when a single signal is extreme (3x threshold)', () => {
		expect(classifyComplexity({ dependencyCount: 3, textLength: 0 })).toBe('medium');
		expect(classifyComplexity({ dependencyCount: 0, textLength: 1200 })).toBe('medium');
		expect(classifyComplexity({ dependencyCount: 3, textLength: 1200 })).toBe('high');
	});

	test('respects custom thresholds', () => {
		expect(
			classifyComplexity(
				{ dependencyCount: 0, textLength: 100 },
				{ depsMedium: 5, textMedium: 50 },
			),
		).toBe('medium');
	});
});

describe('complexitySignalsForFeature', () => {
	test('derives signals from a feature record', () => {
		expect(
			complexitySignalsForFeature({
				dependencies: ['a', 'b'],
				description: 'x'.repeat(100),
				id: 'feature-1-thing',
				title: 'y'.repeat(20),
			}),
		).toEqual({ dependencyCount: 2, textLength: 120 });
	});

	test('treats missing fields as zero', () => {
		expect(complexitySignalsForFeature({ id: 'feature-1-thing' })).toEqual({
			dependencyCount: 0,
			textLength: 0,
		});
	});
});
