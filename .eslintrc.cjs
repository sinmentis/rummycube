module.exports = {
  root: true,
  env: {browser: true, node: true, es2022: true, jest: true},
  parserOptions: {ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: {jsx: true}},
  settings: {react: {version: 'detect'}},
  plugins: ['react', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  rules: {
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'no-unused-vars': 'warn',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    // Downgraded to keep this a non-blocking baseline: these fired as noise,
    // cosmetic findings, or intentional patterns rather than real bugs.
    'react/display-name': 'warn',
    'react/no-unescaped-entities': 'warn',
    'no-empty': 'warn',
    'no-extra-semi': 'warn',
    'no-constant-condition': 'warn',
  },
};
