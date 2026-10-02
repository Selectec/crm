import { describe, it, expect, vi, afterEach } from 'vitest'
import { createPanelRegistry } from '@/utils/recordPanelRegistry'

const contribution = (app='demo') => ({owner_app:app,renderer:'summary',version:1,js:{url:`/assets/${app}/dist/js/summary.ABC.js`,revision:'ABC'},css:[]})

let nodes=[]
afterEach(()=>{vi.restoreAllMocks();nodes=[];delete document.currentScript})
function transport() { vi.spyOn(document.head,'appendChild').mockImplementation(node=>{nodes.push(node);return node}) }
function executing(script) { Object.defineProperty(document,'currentScript',{configurable:true,value:script}) }
describe('approved IIFE renderer loading', () => {
  it('shares pending loads and creates the declared renderer from the hosting runtime', async () => {
    transport()
    const registry=createPanelRegistry(window)
    const descriptor=contribution()
    registry.approve([descriptor])
    const pending=registry.load(descriptor)
    const second=registry.load(descriptor)
    const script=nodes[0]
    executing(script)
    const factory=vi.fn(runtime=>({render:()=>runtime.vue.h('p','Summary')}))
    window.crmRecordPagePanels.register({app:'demo',renderer:'summary',version:1,create:factory})
    script.dispatchEvent(new Event('load'))
    expect(await pending).toBe(await second)
    expect((await pending)({vue:{h(){}}})).toHaveProperty('render')
    expect(factory).toHaveBeenCalledOnce()
    script.remove()
    expect(nodes).toHaveLength(1)
  })
  it('rejects undeclared ownership and duplicate factories as contributor load failures', async () => {
    transport()
    const registry=createPanelRegistry(window), descriptor=contribution()
    registry.approve([descriptor])
    const pending=registry.load(descriptor)
    executing(nodes[0])
    expect(()=>window.crmRecordPagePanels.register({app:'other',renderer:'summary',version:1,create(){}})).toThrow('undeclared')
    window.crmRecordPagePanels.register({app:'demo',renderer:'summary',version:1,create(){return {}}})
    expect(()=>window.crmRecordPagePanels.register({app:'demo',renderer:'summary',version:1,create(){return {}}})).toThrow('duplicate')
    nodes[0].dispatchEvent(new Event('load'))
    await expect(pending).rejects.toThrow('duplicate')
  })
  it('removes failed asset loads so retry can register normally', async () => {
    transport()
    const registry=createPanelRegistry(window), descriptor=contribution()
    registry.approve([descriptor])
    const failed=registry.load(descriptor)
    const rejected=expect(failed).rejects.toThrow('Could not load')
    nodes[0].dispatchEvent(new Event('error'))
    await rejected
    const retried=registry.load(descriptor)
    expect(nodes).toHaveLength(2)
    executing(nodes[1])
    window.crmRecordPagePanels.register({app:'demo',renderer:'summary',version:1,create(){return {}}})
    nodes[1].dispatchEvent(new Event('load'))
    expect(await retried).toBeTypeOf('function')
  })

})
