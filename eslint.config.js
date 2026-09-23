import baseConfig from '@glampro/eslint-config/base';
import reactConfig from '@glampro/eslint-config/react';

export default [
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/src/generated/**'] },
  ...baseConfig,
  ...reactConfig,
];
