import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import path from 'path'

const benchApps = process.env.CRM_BENCH_APPS || path.resolve(import.meta.dirname, '../..')

export default defineConfig({
  server: { fs: { allow: [benchApps] } },
  plugins: [vue(), vueJsx()],
  test: {
    globals: true,
    environment: 'happy-dom',
    root: import.meta.dirname,
    setupFiles: [path.resolve(import.meta.dirname, 'tests/setup.js')],
    include: ['tests/**/*.test.js', 'src/**/*.test.js'],
    server: {
      deps: {
        inline: ['frappe-ui', '@framework/ui'],
      },
    },
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
    dedupe: ['vue', 'vue-router', 'frappe-ui', '@tiptap/core', '@tiptap/pm', 'prosemirror-model'],
    alias: [
      { find: '@framework/ui', replacement: path.resolve(benchApps, 'frappe/ui/src') },
      { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
      {
        find: /^~icons\/.*/,
        replacement: path.resolve(import.meta.dirname, 'tests/stubs/icon.js'),
      },
    ],
  },
})
