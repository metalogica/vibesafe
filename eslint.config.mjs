import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import sortPlugin from 'eslint-plugin-sort';
import storybookPlugin from 'eslint-plugin-storybook';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      '.storybook/**',
      'storybook-static/**',
      'coverage/**',
      'postcss.config.mjs',
      'out/**',
      'build/**',
      'prototype/**',
      'infra/**',
      'supabase/**',
      '.orchestrator',
      'convex/**',
      'prototype/**',
    ],
  },

  ...nextVitals,
  ...nextTypescript,

  // Storybook ESLint config - using the official recommended flat config
  ...storybookPlugin.configs['flat/recommended'],

  // Custom overrides for Storybook files
  {
    files: ['**/*.stories.@(ts|tsx|js|jsx|mjs|cjs)'],
    rules: {
      // You can add specific storybook rules here, for example:
      'storybook/hierarchy-separator': 'error',
      'storybook/default-exports': 'error',
      // Disable no-renderer-packages - types must come from @storybook/react
      'storybook/no-renderer-packages': 'off',
    },
  },

  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    plugins: {
      '@typescript-eslint': typescriptEslint,
      sort: sortPlugin,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // Import/Export Sorting
      'sort/exports': [
        'error',
        {
          order: [
            { type: 'default', order: 'asc' },
            { type: 'named', order: 'asc' },
          ],
        },
      ],

      // TypeScript Rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // Custom Consistency Rules
      'import/no-unused-modules': 'error',
      'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
      'csstools/value-no-property-ignored': 'off',

      // NO BARREL EXPORTS
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportAllDeclaration',
          message:
            "Barrel exports (export * from '...') are forbidden. Import and export specifically to keep the dependency graph clean and optimize build performance.",
        },
      ],

      // PREVENT COMMITTING .ONLY
      'no-restricted-properties': [
        'error',
        {
          object: 'describe',
          property: 'only',
          message: 'describe.only should not be committed',
        },
        {
          object: 'it',
          property: 'only',
          message: 'it.only should not be committed',
        },
        {
          object: 'test',
          property: 'only',
          message: 'test.only should not be committed',
        },
        {
          object: 'context',
          property: 'only',
          message: 'context.only should not be committed',
        },
      ],
    },
  },
];

export default eslintConfig;
