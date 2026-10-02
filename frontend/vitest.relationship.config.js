import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { realpathSync } from 'node:fs'

const benchApps = process.env.CRM_BENCH_APPS || path.resolve(realpathSync(path.join(__dirname, 'node_modules')), '../../..')

export default defineConfig({
  server: { fs: { allow: [benchApps] } },
  plugins: [
    vue(),
    {
      name: 'test-icon-sprite',
      resolveId(id) { if (id.startsWith('~icons/')) return '\0' + id },
      load(id) {
        if (id.startsWith('\0~icons/')) return 'export default { render() { return null } }'
      },
    },
  ],
  resolve: {
    alias: {
      ...(process.env.RELATIONSHIP_BASELINE ? {
        '@/pages/Organization.vue': path.join(benchApps, 'crm/frontend/src/pages/Organization.vue'),
        '@/pages/Contact.vue': path.join(benchApps, 'crm/frontend/src/pages/Contact.vue'),
      } : {}),
      '@': path.resolve(__dirname, 'src'),
      '@framework/ui': path.join(benchApps, 'frappe/ui/src'),
    },
    dedupe: ['vue', 'vue-router', 'frappe-ui', '@tiptap/core', '@tiptap/pm', 'prosemirror-model'],
  },
  test: {
    root: __dirname,
    globals: true,
    server: { deps: { inline: ['frappe-ui', '@framework/ui'] } },
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/integration/relationshipPages.test.js'],
  },
})
