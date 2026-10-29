import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { createPinia } from 'pinia'
import { Button, ErrorMessage } from 'frappe-ui'
import EmailEditor from '@/components/EmailEditor.vue'
import translationPlugin from '@/translation'

interface RecipientFixture {
  lookup: (() => Promise<string[]>) | null
}
const fixture = vi.hoisted<RecipientFixture>(() => ({ lookup: null }))
vi.mock('@/data/document', () => ({
  useDocument: () => ({ document: { doc: { user_emails: [] } } }),
}))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    users: { data: { crmUsers: [] } },
    getUser: () => ({}),
  }),
}))
vi.mock('@/stores/settings', () => ({
  getSettings: () => ({ brand: {}, settings: {}, _settings: { doc: {} } }),
}))
vi.mock('@framework/ui/telemetry', () => ({
  useTelemetry: () => ({ capture() {} }),
}))
vi.mock('frappe-ui', async (original) => {
  const actual = await original<typeof import('frappe-ui')>()
  const { reactive } = await import('vue')
  return {
    ...actual,
    call: async (method: string) => {
      if (method === 'crm.api.get_unsubscribed_emails')
        return fixture.lookup?.() || []
      throw new Error(`Unexpected native recipient lookup: ${method}`)
    },
    createResource: () =>
      reactive({ data: [], loading: false, update() {}, reload() {} }),
    createListResource: () =>
      reactive({ data: [], fetch: async () => [], reload() {} }),
  }
})

let app: App | undefined
let element: HTMLDivElement | undefined
afterEach(() => {
  app?.unmount()
  element?.remove()
  fixture.lookup = null
})
async function settle() {
  for (let i = 0; i < 5; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

it('exposes pending and unsubscribed recipient blocking until the native lookup clears', async () => {
  let finish: (recipients: string[]) => void = () => {
    throw new Error('Lookup not started')
  }
  fixture.lookup = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const editor = ref<{ sendBlocked: boolean; toEmails: string[] } | null>(null)
  const target = document.createElement('div')
  element = target
  document.body.append(target)
  app = createApp(() =>
    h(EmailEditor, {
      ref: editor,
      doctype: 'Contact',
      modelValue: {
        name: 'Synthetic recipient parent',
        email: 'blocked@example.test',
      },
      submitButtonProps: { disabled: false },
    }),
  )
  app.use(createPinia())
  app.use(translationPlugin)
  app.provide('session', { user: 'author@example.test' })
  // This native component is globally registered under its production name.
  // eslint-disable-next-line vue/no-reserved-component-names
  app.component('Button', Button)
  app.component('ErrorMessage', ErrorMessage)
  app.mount(element)
  await settle()
  const send = () =>
    [...target.querySelectorAll('button')].find((button) =>
      button.textContent?.startsWith('Send'),
    )
  expect(editor.value?.sendBlocked).toBe(true)
  expect(send()?.disabled).toBe(true)

  finish(['blocked@example.test'])
  await settle()
  expect(editor.value?.sendBlocked).toBe(true)
  expect(send()?.disabled).toBe(true)
  expect(element.textContent).toContain('unsubscribed')

  fixture.lookup = async () => []
  expect(editor.value).not.toBeNull()
  if (editor.value) editor.value.toEmails = ['allowed@example.test']
  await settle()
  expect(editor.value?.sendBlocked).toBe(false)
  expect(send()?.disabled).toBe(false)
})
