import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPanelRegistry } from '@/utils/recordPanelRegistry'

const declaration = app => ({ owner_app: app, renderer: 'summary', version: 1, js: { url: `/assets/${app}/dist/js/summary.ABC.js`, revision: 'ABC' }, css: [] })
let nodes = []
afterEach(() => { vi.restoreAllMocks(); nodes = []; delete document.currentScript })

describe('record-page and native dialog registry ownership', () => {
  it('adds and retires a dialog approval without withdrawing another native record host', async () => {
    vi.spyOn(document.head, 'appendChild').mockImplementation(node => { nodes.push(node); return node })
    const registry = createPanelRegistry(window)
    const page = declaration('page'), dialog = declaration('dialog')
    registry.approve([page])
    registry.approve([dialog], 'native-dialog-owner')
    const pageLoad = registry.load(page)
    // Observe the native public load before awaiting so an unsupported scope
    // produces an intentional assertion, without an unhandled rejection.
    const pageResult = pageLoad.then(value => ({ value }), error => ({ error }))
    await Promise.resolve()
    expect(nodes.length, 'Adding a dialog must preserve the existing page declaration').toBe(1)
    Object.defineProperty(document, 'currentScript', { configurable: true, value: nodes[0] })
    const pageFactory = () => ({})
    window.crmRecordPagePanels.register({ app: 'page', renderer: 'summary', version: 1, create: pageFactory })
    nodes[0].dispatchEvent(new Event('load'))
    expect(await pageResult).toEqual({ value: pageFactory })
    const dialogLoad = registry.load(dialog)
    Object.defineProperty(document, 'currentScript', { configurable: true, value: nodes[1] })
    window.crmRecordPagePanels.register({ app: 'dialog', renderer: 'summary', version: 1, create: () => ({}) })
    nodes[1].dispatchEvent(new Event('load'))
    await dialogLoad
    expect(registry.release).toBeTypeOf('function')
    registry.release('native-dialog-owner')
    await expect(registry.load(dialog)).rejects.toThrow('no longer declared')
    await expect(registry.load(page)).resolves.toBe(pageFactory)
  })
})
