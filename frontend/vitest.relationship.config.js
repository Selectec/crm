import { mergeConfig, defineConfig } from 'vitest/config'
import config from './vitest.config.js'

export default mergeConfig(config, defineConfig({
  test: { include: ['tests/integration/relationshipPages.test.js'] },
}))
