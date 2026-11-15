import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
    globalIgnores(['**/dist', '**/coverage', 'data', 'models', 'examples']),
    {
        files: ['**/*.{js,ts,tsx}'],
        extends: [js.configs.recommended],
    },
    {
        files: ['**/*.{ts,tsx}'],
        extends: [tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': 'error',
        },
    },
    {
        files: ['apps/web/**/*.{ts,tsx}'],
        extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
        languageOptions: { globals: globals.browser },
    },
    {
        files: ['apps/api/**/*.ts', 'packages/**/*.ts', '*.{js,ts}'],
        languageOptions: { globals: globals.node },
    },
    prettier,
])
