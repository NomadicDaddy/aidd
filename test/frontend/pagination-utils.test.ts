import { describe, expect, test } from 'bun:test';
import {
	clampPage,
	nextPage,
	previousPage,
	totalPageCount,
} from '../../frontend/src/pages/projects/detail/pagination-utils.ts';

describe('pagination-utils', () => {
	test('totalPageCount returns at least one page even for an empty list', () => {
		expect(totalPageCount(0, 15)).toBe(1);
	});

	test('totalPageCount rounds up partial pages', () => {
		expect(totalPageCount(87, 15)).toBe(6);
		expect(totalPageCount(30, 15)).toBe(2);
	});

	test('nextPage advances by one zero-based index when not on the last page', () => {
		const totalPages = totalPageCount(87, 15);
		expect(nextPage(0, totalPages)).toBe(1);
		expect(nextPage(1, totalPages)).toBe(2);
		expect(nextPage(4, totalPages)).toBe(5);
	});

	test('nextPage clamps at the last page when already at the end', () => {
		const totalPages = totalPageCount(87, 15);
		expect(nextPage(5, totalPages)).toBe(5);
		expect(nextPage(99, totalPages)).toBe(5);
	});

	test('previousPage decrements and never returns a negative index', () => {
		expect(previousPage(2)).toBe(1);
		expect(previousPage(1)).toBe(0);
		expect(previousPage(0)).toBe(0);
	});

	test('clampPage keeps the current page when the list shrinks below it', () => {
		expect(clampPage(5, 30, 15)).toBe(1);
		expect(clampPage(5, 0, 15)).toBe(0);
		expect(clampPage(2, 87, 15)).toBe(2);
	});
});
