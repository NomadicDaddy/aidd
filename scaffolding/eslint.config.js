import js from '@eslint/js';
import perfectionist from 'eslint-plugin-perfectionist';
import unusedImports from 'eslint-plugin-unused-imports';
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

// eslint-disable-next-line import/no-default-export
export default tseslint.config([
	{
		ignores: [
			'**/*.min.js',
			'**/dist/**',
			'**/node_modules/**',
			'artifacts/**',
			'backups/**',
			'logs/**',
		],
	},
	{
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		files: ['**/*.{ts,tsx,js,jsx}'],
		languageOptions: {
			ecmaVersion: 2020,
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
				'warn',
				{ fixStyle: 'inline-type-imports', prefer: 'type-imports' },
			],
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-unused-vars': 'off',
			eqeqeq: ['error', 'always'],
			'import/no-default-export': 'error',
			'no-useless-rename': 'error',
			'object-shorthand': ['error', 'always'],
			'perfectionist/sort-enums': [
				'warn',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-exports': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-imports': [
				'error',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-interfaces': [
				'warn',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-object-types': [
				'warn',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-objects': [
				'warn',
				{ ignoreCase: false, order: 'asc', type: 'alphabetical' },
			],
			'perfectionist/sort-switch-case': ['warn', { order: 'asc', type: 'alphabetical' }],
			'perfectionist/sort-union-types': [
				'warn',
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
		files: ['**/*.js'],
		languageOptions: {
			globals: globals.node,
		},
		rules: {
			'@typescript-eslint/no-require-imports': 'off',
		},
	},
	{
		files: ['backend/**/*.{ts,tsx}', 'scripts/**/*.ts'],
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
		files: ['**/vite.config.ts', '**/tailwind.config.js', '**/drizzle.config.ts'],
		rules: {
			'import/no-default-export': 'off',
		},
	},
]);
