import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Button, Dialog, ErrorMessage, FeatherIcon, FormControl, TextInput } from 'frappe-ui'
import GlobalModals from '@/components/Modals/GlobalModals.vue'
import { getScript } from '@/data/script'
import { fieldLayoutDialogs } from '@/utils/renderFieldLayoutDialog'
import translationPlugin from '@/translation'

// Only external boot, network discovery and bundle loading are controlled.
// Form Script evaluation, GlobalModals, Vue exposure and Dialog are native.
const fixture = vi.hoisted(() => ({ requests: [], factories: [], approvals: [], releases: [], closed: 0, blocked: false, contexts: [], discovery: null }))
const descriptor = {
  key: 'demo:composer', id: 'composer', owner_app: 'demo', renderer: 'composer', version: 1,
  js: { url: '/assets/demo/dist/js/composer.ABC.js', revision: 'ABC' }, css: [],
  default_panel: 'Compose', panels: [{ id: 'Compose', name: 'demo:composer:Compose', label: 'Compose' }],
}
vi.mock('frappe-ui', async (original) => {
  const actual = await original()
  const { reactive } = await import('vue')
  return { ...actual, call: async (method, params) => {
    fixture.requests.push({ method, params })
    if (method === 'crm.api.record_page.get_panels') {
      if (fixture.discovery) return fixture.discovery(params)
      return { context: { doctype: params.doctype, name: params.name }, contributions: [descriptor], diagnostics: [] }
    }
    return actual.call(method, params)
  }, createListResource(options) {
    const data = options.doctype === 'CRM Form Script' ? [{ name: 'Installed app dialog action', script: `class CRMDeal {
      onRender() {
        this.actions = [{label: 'Open installed app dialog', onClick: async () => {
          const handle = await this.recordPanelDialog({key:'demo:composer', panel:'Compose'});
          await handle.component.newEmail();
          return handle;
        }}];
      }
    }` }] : []
    options.onSuccess?.(data)
    return reactive({ data, list: { promise: Promise.resolve() }, fetch: async () => data })
  } }
})
vi.mock('@/utils/recordPanelRegistry', () => ({ getPanelRegistry: () => ({
  approve(items, scope) { fixture.approvals.push({ items, scope }) },
  release(scope) { fixture.releases.push(scope) },
  async load(item) {
    fixture.factories.push(item)
    return runtime => ({ props: ['context'], setup(props, { expose }) {
      fixture.contexts.push(props.context)
      const draft = runtime.ref('Initial installed app draft')
      runtime.onUnmounted(() => { fixture.closed++ })
      props.context.registerCloseGuard(() => !fixture.blocked)
      expose({ newEmail() { draft.value = 'Public creation through the native exposed API' } })
      return () => runtime.h('section', { 'data-demo-renderer': '' }, [
        runtime.h('p', `${props.context.doctype}:${props.context.name}:${props.context.panel}`),
        runtime.h('textarea', { value: draft.value, onInput: event => { draft.value = event.target.value } }),
        runtime.h(runtime.native.Button, { label: 'Refresh native record', onClick: props.context.refreshRecord }),
      ])
    } })
  },
}) }))
vi.mock('@/stores/global', () => ({ globalStore: () => ({ $socket: { on() {}, off() {}, emit() {} }, $dialog() {} }) }))
vi.mock('@/stores/meta', () => ({ getMeta: () => ({ doctypesMeta: { 'CRM Deal': { fields: [] } }, doctypeMeta: { value: {} }, getFields: () => [], getField: () => ({}) }) }))
vi.mock('@/stores/users', () => ({ usersStore: () => ({ getUser: () => ({ full_name: 'Staff' }) }) }))
vi.mock('@/data/document', () => ({ useDocument: () => ({ document: { fieldPropertyOverrides: {} }, triggerOnChange: async () => {} }) }))
vi.mock('@/router', () => ({ default: { push() {} } }))
// These independent modal products are not the dialog under test.
vi.mock('@/components/Modals/AboutModal.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/Modals/CreateDocumentModal.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/Modals/QuickEntryModal.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/Modals/ChangePasswordModal.vue', () => ({ default: { render: () => null } }))

let app, element, controller, record
async function settle() { for (let i = 0; i < 8; i++) { await nextTick(); await new Promise(resolve => setTimeout(resolve, 0)) } }
async function open() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] })
  await router.push('/'); await router.isReady()
  record = reactive({ doc: { doctype: 'CRM Deal', name: 'Original native Deal' }, reload: vi.fn(async () => {}), actions: [] })
  element = document.createElement('div'); document.body.append(element)
  app = createApp({ render: () => h('div', [h(Button, { label: 'Existing native action' }), h(GlobalModals)]) })
  app.use(createPinia()); app.use(router); app.use(translationPlugin)
  for (const [name, component] of Object.entries({ Button, Dialog, ErrorMessage, FeatherIcon, FormControl, TextInput })) app.component(name, component)
  app.mount(element)
  ;[controller] = await getScript('CRM Deal').setupScript(record)
  controller.onRender()
  await settle()
}
afterEach(async () => {
  app?.unmount(); element?.remove(); fieldLayoutDialogs.value = []
  await window.happyDOM?.waitUntilComplete()
  document.body.innerHTML = ''
  fixture.requests = []; fixture.factories = []; fixture.approvals = []; fixture.releases = []
  fixture.contexts = []; fixture.closed = 0; fixture.blocked = false; fixture.discovery = null
  vi.restoreAllMocks()
})

describe('installed-app dialog from the production Sales Form Script', () => {
  it('preserves the existing native field dialog and form action', async () => {
    await open()
    expect(record.actions.map(action => action.label)).toEqual(['Open installed app dialog'])
    const result = controller.formDialog({ title: 'Unchanged native field dialog', fields: [{ fieldname: 'title', fieldtype: 'Data', label: 'Title', visible: true }], defaults: { title: 'Existing native field value' }, submitLabel: 'Keep native fields' })
    await vi.waitFor(() => expect(document.querySelector('input')?.value).toBe('Existing native field value'))
    const submit = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Keep native fields')
    expect(submit).toBeDefined(); submit.click()
    await expect(result).resolves.toEqual({ title: 'Existing native field value' })
    expect(fixture.factories).toHaveLength(0)
  })

  it('loads only the declared owner-qualified renderer in GlobalModals and exposes its public creation API', async () => {
    await open()
    expect(controller.recordPanelDialog, 'A native supported Form Script helper must host the registered rich renderer').toBeTypeOf('function')
    const handle = await record.actions[0].onClick()
    await vi.waitFor(() => expect(document.querySelector('[data-demo-renderer]')).not.toBeNull())
    const host = document.querySelector('[data-demo-renderer]')
    expect(host.closest('[role="dialog"]')).not.toBeNull()
    expect(host.textContent).toContain('CRM Deal:Original native Deal:Compose')
    expect(host.querySelector('textarea').value).toBe('Public creation through the native exposed API')
    expect(Object.keys(handle.component)).toEqual(['newEmail'])
    expect(fixture.factories).toEqual([descriptor])
    expect(fixture.contexts[0].presentation).toBe('dialog')
    expect(fixture.contexts[0].doc).toBe(record.doc)
    await fixture.contexts[0].refreshRecord()
    expect(record.reload).toHaveBeenCalledOnce()
    expect(fixture.requests[0]).toEqual({ method: 'crm.api.record_page.get_panels', params: { doctype: 'CRM Deal', name: 'Original native Deal' } })
    expect(fixture.approvals[0].scope).toBeTruthy()
    await handle.close()
    await vi.waitFor(() => expect(host.isConnected).toBe(false))
    expect(fixture.closed).toBe(1)
    expect(fixture.releases).toEqual([fixture.approvals[0].scope])
  })

  it('keeps the exact native renderer and draft mounted when caller or Escape close is guarded', async () => {
    await open()
    expect(controller.recordPanelDialog).toBeTypeOf('function')
    const handle = await record.actions[0].onClick()
    await vi.waitFor(() => expect(document.querySelector('[data-demo-renderer] textarea')).not.toBeNull())
    const draft = document.querySelector('[data-demo-renderer] textarea')
    draft.value = 'Pending upload or uncertain accepted action'; draft.dispatchEvent(new Event('input', { bubbles: true }))
    fixture.blocked = true
    expect(await handle.close()).toBe(false)
    draft.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(draft.isConnected).toBe(true)
    expect(draft.value).toBe('Pending upload or uncertain accepted action')
    expect(fixture.closed).toBe(0)
    expect(fixture.releases).toHaveLength(0)
    fixture.blocked = false
    expect(await handle.close()).toBe(true)
    await vi.waitFor(() => expect(draft.isConnected).toBe(false))
    expect(fixture.closed).toBe(1)
  })

  it('does not load a renderer when discovery denies the native record or returns a different typed context', async () => {
    await open()
    expect(controller.recordPanelDialog).toBeTypeOf('function')
    fixture.discovery = async () => { throw new Error('Native parent read denied') }
    await expect(record.actions[0].onClick()).rejects.toThrow('Native parent read denied')
    fixture.discovery = async () => ({ context: { doctype: 'CRM Lead', name: record.doc.name }, contributions: [descriptor] })
    await expect(record.actions[0].onClick()).rejects.toThrow(/context|record/i)
    fixture.discovery = null
    await expect(controller.recordPanelDialog({ key: 'other:composer', panel: 'Compose' })).rejects.toThrow(/declared|contribution/i)
    await expect(controller.recordPanelDialog({ key: descriptor.key, panel: 'Arbitrary component' })).rejects.toThrow(/panel/i)
    expect(fixture.factories).toHaveLength(0)
    expect(document.querySelector('[data-demo-renderer]')).toBeNull()
  })
})
