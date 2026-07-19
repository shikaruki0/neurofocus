module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'prettier',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'warn',
    'no-var': 'error',
    eqeqeq: ['error', 'always'],
    'no-implicit-globals': 'error',
    'no-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
  },
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/', 'src/**/*.ts'],
};