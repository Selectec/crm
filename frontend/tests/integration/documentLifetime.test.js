import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Button, Dialog, ErrorMessage, FeatherIcon, setConfig } from 'frappe-ui'
import DoctypeModals from '@/components/Modals/DoctypeModals.vue'
import { useDoctypeModal } from '@/composables/doctypeModal'
import translationPlugin from '@/translation'

// Control only external boot, socket delivery and public resource transport.
// The modal, useDocument, Form Script engine and document resources are native.
const fixture = vi.hoisted(() => ({ handlers: new Map(), requests: [] }))
const socket = {
  on(event, handler) {
    if (!fixture.handlers.has(event)) fixture.handlers.set(event, new Set())
    fixture.handlers.get(event).add(handler)
  },
  off(event, handler) { fixture.handlers.get(event)?.delete(handler) },
  emit() {},
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

let app, element
async function settle() {
  for (let i = 0; i < 12; i++) {
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}
async function mount() {
  setConfig('resourceFetcher', async ({ url, params }) => {
    fixture.requests.push({ url, params })
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
  app = createApp({ render: () => h(DoctypeModals) })
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
  fixture.handlers.clear(); fixture.requests = []
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
})
