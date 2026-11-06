// Security-focused ESLint config used only by .github/workflows/security-scan.yml.
// It is copied to the repository root at scan time, so ignore paths are relative to the root.
import security from 'eslint-plugin-security';
import nounsanitized from 'eslint-plugin-no-unsanitized';
import sdl from '@microsoft/eslint-plugin-sdl';

export default [
  {
    ignores: [
      '.sectools/**', '**/node_modules/**', '**/vendor/**', '**/*.min.js', '**/dist/**',
      '**/src/chat-component/**', '**/svg-edit/**', '**/*.generated.js',
      '**/assets/js/core/*.js', '**/assets/js/plugins/**',
    ],
  },
  {
    files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    linterOptions: { reportUnusedDisableDirectives: false },
    plugins: { security, 'no-unsanitized': nounsanitized, '@microsoft/sdl': sdl },
    rules: {
      ...security.configs.recommended.rules,
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',
      '@microsoft/sdl/no-electron-node-integration': 'error',
      '@microsoft/sdl/no-insecure-url': 'warn',
      '@microsoft/sdl/no-inner-html': 'error',
      '@microsoft/sdl/no-html-method': 'error',
      '@microsoft/sdl/no-document-write': 'error',
      '@microsoft/sdl/no-postmessage-star-origin': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
];
