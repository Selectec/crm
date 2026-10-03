import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Button, Dialog, ErrorMessage, FeatherIcon, setConfig } from 'frappe-ui'
import DoctypeModals from '@/components/Modals/DoctypeModals.vue'
import { useDoctypeModal } from '@/composables/doctypeModal'
import translationPlugin from '@/translation'
import { useDocument } from '@/data/document'

// Control only external boot, socket delivery and public resource transport.
// The modal, useDocument, Form Script engine and document resources are native.
const fixture = vi.hoisted(() => ({ handlers: new Map(), requests: [], missing: new Set(), subscriptions: [] }))
const socket = {
  on(event, handler) {
    if (!fixture.handlers.has(event)) fixture.handlers.set(event, new Set())
    fixture.handlers.get(event).add(handler)
  },
  off(event, handler) { fixture.handlers.get(event)?.delete(handler) },
  emit(...args) { fixture.subscriptions.push(args) },
}
vi.mock('@/stores/global', () => ({ globalStore: () => ({
  $socket: socket, $dialog() {}, makeCall() {},
}) }))
vi.mock('@/stores/meta', () => ({ getMeta: () => ({
  doctypeMeta: { value: { fields: [] } },
  doctypesMeta: { 'FCRM Note': { fields: [] } },
  getFields: () => [], getField: () => ({}),
}) }))
vi.mock('@/stores/users', () => ({ usersStore: () => ({
  isManager: () => false, getUser: () => ({ full_name: 'Staff' }),
}) }))
vi.mock('@/router', () => ({ default: { push() {} } }))

let app, element, secondDocument
const secondVisible = ref(false)
let secondName
const SecondOwner = { setup() {
  secondDocument = useDocument('FCRM Note', secondName).document
  return () => h('span', 'Another native document consumer')
} }
async function settle() {
  for (let i = 0; i < 12; i++) {
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}
async function mount() {
  setConfig('resourceFetcher', async ({ url, params }) => {
    fixture.requests.push({ url, params })
    if (url === 'frappe.client.get' && fixture.missing.has(params.name)) {
      throw Object.assign(new Error('Document does not exist'), {
        exc_type: 'DoesNotExistError', messages: ['Document does not exist'],
      })
    }
    if (url === 'frappe.client.get') return {
      doctype: params.doctype, name: params.name, title: 'Loaded native Note',
      content: '<p>Native content</p>', modified: '2026-10-03 10:00:00',
    }
    if (url === 'frappe.client.get_list') return []
    if (url === 'frappe.client.get_doc_permissions') return { permissions: { read: 1, write: 1 } }
    if (url === 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout') {
      return [{ name: 'main', label: 'Note', sections: [] }]
    }
    return []
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] })
  await router.push('/'); await router.isReady()
  element = document.createElement('div'); document.body.append(element)
  app = createApp({ render: () => h('div', [h(DoctypeModals), secondVisible.value ? h(SecondOwner) : null]) })
  app.config.globalProperties.$socket = socket
  app.use(createPinia()); app.use(router); app.use(translationPlugin)
  for (const [name, component] of Object.entries({ Button, Dialog, ErrorMessage, FeatherIcon })) app.component(name, component)
  app.mount(element)
}
async function update(doctype, name) {
  for (const handler of fixture.handlers.get('list_update') || []) handler({ doctype, name })
  await settle()
}
const gets = name => fixture.requests.filter(request => request.url === 'frappe.client.get' && request.params?.name === name).length
afterEach(async () => {
  useDoctypeModal().show.value = false
  app?.unmount(); element?.remove(); document.body.innerHTML = ''
  await settle()
  setConfig('resourceFetcher', undefined)
  secondVisible.value = false
  fixture.handlers.clear(); fixture.requests = []; fixture.missing.clear(); fixture.subscriptions = []
})

describe('native modal document lifetime', () => {
  it('stops closed modal reloads and restores realtime when the same cached Note reopens', async () => {
    await mount()
    const modal = useDoctypeModal()
    const name = 'Document lifetime native Note'
    modal.showModal({ doctype: 'FCRM Note', name, title: 'Note', fullDocumentSave: true })
    await settle()
    expect(document.body.textContent).toContain('Edit Note')
    const loaded = gets(name)
    expect(loaded).toBeGreaterThan(0)
    await update('FCRM Note', name)
    expect(gets(name)).toBeGreaterThan(loaded)

    modal.show.value = false
    await settle()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    const closed = gets(name)
    // Native deletion sends list_update after the source is gone. A closed
    // editor must not issue a doomed get, rather than suppressing its error.
    await update('FCRM Note', name)
    expect(gets(name)).toBe(closed)

    modal.showModal({ doctype: 'FCRM Note', name, title: 'Note', fullDocumentSave: true })
    await settle()
    const reopened = gets(name)
    await update('FCRM Note', name)
    expect(gets(name)).toBeGreaterThan(reopened)
  })

  it('keeps another owner active, rejoins on reconnect and retains genuine active fetch errors', async () => {
    secondName = 'Shared native document lifetime Note'
    await mount()
    const modal = useDoctypeModal()
    modal.showModal({ doctype: 'FCRM Note', name: secondName, title: 'Note', fullDocumentSave: true })
    secondVisible.value = true
    await settle()
    const active = gets(secondName)
    await update('Contact', secondName)
    expect(gets(secondName)).toBe(active)
    await update('FCRM Note', secondName)
    expect(gets(secondName)).toBe(active + 1)
    modal.show.value = false
    await settle()
    const remaining = gets(secondName)
    await update('FCRM Note', secondName)
    expect(gets(secondName)).toBe(remaining + 1)
    const subscriptions = fixture.subscriptions.length
    for (const handler of fixture.handlers.get('connect') || []) handler()
    expect(fixture.subscriptions.slice(subscriptions)).toEqual([['doctype_subscribe', 'FCRM Note']])

    fixture.missing.add(secondName)
    await update('FCRM Note', secondName)
    expect(secondDocument.get.error).toMatchObject({ exc_type: 'DoesNotExistError' })
    const final = gets(secondName)
    secondVisible.value = false
    await settle()
    await update('FCRM Note', secondName)
    expect(gets(secondName)).toBe(final)
    expect(fixture.handlers.get('list_update')?.size || 0).toBe(0)
  })
})
