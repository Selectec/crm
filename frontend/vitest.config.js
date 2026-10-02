import { defineConfig, mergeConfig } from 'vitest/config'
import path from 'path'
import nativeComponentConfig from './vitest.relationship.config.js'

export default mergeConfig(
  nativeComponentConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'happy-dom',
      root: __dirname,
      include: ['tests/**/*.test.js', 'src/**/*.test.js'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov', 'json-summary'],
        reportsDirectory: './coverage',
        include: [
          'src/utils/fieldTransforms.js',
          'src/utils/scriptHelpers.js',
          'src/utils/expressions.js',
          'src/utils/renderFieldLayoutDialog.js',
        ],
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  }),
)
