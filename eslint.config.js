import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import perfectionist from 'eslint-plugin-perfectionist';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import unusedImports from 'eslint-plugin-unused-imports';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const noDefaultExportPlugin = {
	rules: {
		'no-default-export': {
			create(context) {
				return {
					ExportDefaultDeclaration(node) {
						context.report({ message: 'Prefer named exports.', node });
					},
				};
			},
			meta: { schema: [], type: 'suggestion' },
		},
	},
};

export default defineConfig([
	{
		ignores: [
			'**/*.min.js',
			'**/dist/**',
			'**/node_modules/**',
			'benchmarks/**',
			'data/**',
			'logs/**',
			'scaffolding/**',
		],
	},
	{
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		files: ['**/*.{ts,tsx,js,jsx}'],
		languageOptions: {
			ecmaVersion: 2022,
			globals: { ...globals.browser, ...globals.node },
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			import: noDefaultExportPlugin,
			perfectionist,
			'unused-imports': unusedImports,
		},
		rules: {
			'@typescript-eslint/array-type': ['error', { default: 'array' }],
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{ fixStyle: 'inline-type-imports', prefer: 'type-imports' },
			],
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-unused-vars': 'off',
			eqeqeq: ['error', 'always'],
			'import/no-default-export': 'error',
			'no-useless-rename': 'error',
			'object-shorthand': ['error', 'always'],
			'perfectionist/sort-array-includes': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-enums': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-exports': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-heritage-clauses': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-imports': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-interfaces': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-intersection-types': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-jsx-props': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-maps': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-named-exports': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-named-imports': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-object-types': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-objects': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-sets': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-switch-case': ['error', { order: 'asc', type: 'alphabetical' }],
			'perfectionist/sort-union-types': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'prefer-const': 'error',
			'prefer-template': 'error',
			'sort-imports': 'off',
			'sort-keys': 'off',
			'unused-imports/no-unused-imports': 'error',
			'unused-imports/no-unused-vars': [
				'warn',
				{
					args: 'after-used',
					argsIgnorePattern: '^_',
					vars: 'all',
					varsIgnorePattern: '^_',
				},
			],
		},
	},
	{
		files: ['frontend/**/*.{ts,tsx}'],
		plugins: {
			'react-hooks': reactHooks,
			'react-refresh': reactRefresh,
		},
		rules: {
			...reactHooks.configs.flat.recommended.rules,
			'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
		},
	},
	{
		files: [
			'backend/src/constants/**/*.ts',
			'backend/src/services/**/*.ts',
			'backend/src/utils/**/*.ts',
		],
		plugins: {
			jsdoc,
		},
		rules: {
			'@typescript-eslint/explicit-function-return-type': [
				'warn',
				{
					allowDirectConstAssertionInArrowFunctions: true,
					allowExpressions: true,
					allowHigherOrderFunctions: true,
					allowTypedFunctionExpressions: true,
				},
			],
			'jsdoc/require-description': 'warn',
			'jsdoc/require-param': 'warn',
			'jsdoc/require-returns': 'warn',
		},
	},
	{
		files: ['**/*.js'],
		languageOptions: {
			globals: globals.node,
		},
		rules: {
			'@typescript-eslint/no-require-imports': 'off',
		},
	},
	{
		files: ['backend/**/*.{ts,tsx}', 'cli/**/*.{ts,tsx}', 'scripts/**/*.ts'],
		languageOptions: {
			globals: globals.node,
		},
		rules: {
			'@typescript-eslint/no-require-imports': 'off',
			'no-console': 'off',
			'no-restricted-syntax': [
				'error',
				{
					message: "Catch variable must be named 'err' for consistency.",
					selector: "CatchClause > Identifier[name!='err']",
				},
			],
		},
	},
	{
		files: ['test/**/*.{ts,tsx}'],
		rules: {
			'perfectionist/sort-imports': 'off',
			'perfectionist/sort-interfaces': 'off',
			'perfectionist/sort-object-types': 'off',
			'perfectionist/sort-objects': 'off',
			'perfectionist/sort-union-types': 'off',
		},
	},
	{
		files: ['**/vite.config.ts'],
		rules: {
			'import/no-default-export': 'off',
		},
	},
]);
