import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The recipe editor used to be one component that inferred which of three editors it was from
 * which optional props had arrived: `setId` meant create, `onReload` meant edit, `nameReadOnly`
 * meant a system recipe. Both pages held identical copies of the draft and passed it down through
 * 21 props. The draft is owned once now, the parts read it from context, and each page renders the
 * variant it means.
 */
const read = (path: string): string =>
	readFileSync(resolve(process.cwd(), 'frontend', 'src', 'pages', 'recipes', path), 'utf8');

const PAGES = ['RecipeCreatePage.tsx', 'RecipeDetailPage.tsx'];

describe('recipe editor variants', () => {
	test('no part works out which editor it is from the props it was given', () => {
		for (const file of ['detail/RecipeEditMode.tsx', 'detail/RecipeMetadataCard.tsx']) {
			const source = read(file);
			for (const signal of [
				'setId !== undefined',
				'isCreate',
				'setId ?',
				'setId &&',
				'onReload ?',
				'nameReadOnly',
			])
				expect(source, `${file} still infers its variant from ${signal}`).not.toContain(
					signal,
				);
		}
	});

	test('the draft is owned once, not copied into each page', () => {
		for (const page of PAGES) {
			const source = read(page);
			expect(source).not.toContain('function updateStep');
			expect(source).not.toContain('const hasStepErrors');
			expect(source).not.toContain('collectStepErrors');
			expect(source).toContain('useRecipeDraft(');
			expect(source).toContain('<RecipeEditorProvider');
		}
		expect(read('detail/useRecipeDraft.ts')).toContain('function updateStep');
	});

	test('each page renders the editor it means', () => {
		const create = read('RecipeCreatePage.tsx');
		const detail = read('RecipeDetailPage.tsx');
		expect(create).toContain('<CreateRecipeEditor');
		expect(create).not.toContain('<EditRecipeEditor');
		expect(detail).toContain('<EditRecipeEditor');
		expect(detail).not.toContain('<CreateRecipeEditor');
		// The system recipe's reserved name is a field of its own, chosen where the fact is known.
		expect(detail).toContain(
			'recipe?.system === true ? <LockedRecipeNameField /> : <RecipeNameField />',
		);
	});

	test('the variants state their own header, labels and fields', () => {
		const create = read('detail/CreateRecipeEditor.tsx');
		const edit = read('detail/EditRecipeEditor.tsx');
		expect(create).toContain('title="New Recipe"');
		expect(create).toContain('pendingLabel="Creating…"');
		expect(create).toContain('saveLabel="Create"');
		expect(create).toContain('<RecipeMetadataCard columns={3}>');
		expect(create).toContain('<RecipeIdField');
		expect(edit).toContain('identifier={id}');
		expect(edit).toContain('pendingLabel="Saving…"');
		expect(edit).toContain('saveLabel="Save"');
		expect(edit).toContain('<RecipeMetadataCard columns={2}>');
		expect(edit).not.toContain('<RecipeIdField');
		expect(edit).toContain('Reload');
		expect(create).not.toContain('Reload');
	});

	test('the context is React 19 context read through use(), and refuses to render outside it', () => {
		const context = read('detail/recipeEditorContext.ts');
		const provider = read('detail/RecipeEditorProvider.tsx');
		expect(context).toContain('const value = use(RecipeEditorContext);');
		expect(context).toContain('throw new Error(');
		expect(context).toMatch(/actions:[\s\S]*meta:[\s\S]*state:/u);
		expect(provider).toContain('<RecipeEditorContext value={value}>');
		expect(provider).not.toContain('.Provider');
	});
});
