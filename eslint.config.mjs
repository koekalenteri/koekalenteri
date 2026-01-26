import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import muiPathImports from 'eslint-plugin-mui-path-imports'
// import _import from "eslint-plugin-import";
import prettier from 'eslint-plugin-prettier'
import react from 'eslint-plugin-react'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
// import reactHooks from "eslint-plugin-react-hooks";
import unusedImports from 'eslint-plugin-unused-imports'
// import { fixupPluginRules } from "@eslint/compat";
import globals from 'globals'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default [
  {
    ignores: [
      'build/**/*',
      'dist/**/*',
      // These YAML fragments are indentation-sensitive CloudFormation/SAM snippets.
      // ESLint shouldn't try to lint them (and some editor integrations may apply
      // formatting via ESLint fixes).
      'template/**/*',
    ],
  },
  ...compat.extends(
    'eslint:recommended',
    'plugin:react/jsx-runtime',
    'plugin:@typescript-eslint/recommended',
    'prettier'
  ),
  {
    plugins: {
      react,
      // "react-hooks": fixupPluginRules(reactHooks),
      'unused-imports': unusedImports,
      'simple-import-sort': simpleImportSort,
      'mui-path-imports': muiPathImports,
      //import: fixupPluginRules(_import),
      prettier,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },

      parser: tsParser,
    },

    rules: {
      /*"react-hooks/rules-of-hooks": "error",

        "react-hooks/exhaustive-deps": ["warn", {
            additionalHooks: "(useRecoilCallback)",
        }],
        */

      'prettier/prettier': 'error',
      'arrow-body-style': 'off',
      'prefer-arrow-callback': 'off',
      semi: ['error', 'never'],

      quotes: [
        'error',
        'single',
        {
          avoidEscape: true,
          allowTemplateLiterals: true,
        },
      ],

      'comma-spacing': [
        'error',
        {
          before: false,
          after: true,
        },
      ],

      'mui-path-imports/mui-path-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/indent': 'off',

      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
        },
      ],

      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            ['^@?\\w.*\\u0000$', '^[^.].*\\u0000$', '^\\..*\\u0000$'],
            ['^react', '^@?\\w'],
            ['^(@|components)(/.*|$)'],
            ['^\\u0000'],
            ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
            ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
            ['^.+\\.?(css)$'],
          ],
        },
      ],

      'unused-imports/no-unused-imports': 'error',
      // "import/no-duplicates": "error",
      // "import/consistent-type-specifier-style": "error",
    },
  },
  {
    files: ['**/*.test.ts?(x)', 'config/*', 'scripts/*'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]
