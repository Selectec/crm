import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { createPinia } from 'pinia'
import { Badge, Button, Dialog, ErrorMessage, FeatherIcon, FormControl, TextInput } from 'frappe-ui'
import { useRecordPanelRuntime } from '@/components/Activities/recordPanelRuntime'
import translationPlugin from '@/translation'

const fixture = vi.hoisted(() => ({ nativeUploads: [], xhrUploads: [] }))
const uploaded = {
  name: 'Synthetic native uploaded File',
  file_name: 'native-composer.txt',
  file_url: '/private/files/native-composer.txt',
  is_private: 1,
}
// Boot resources and the two upload transports are fake. The actual native
// CommentBox, rich editor and attachment-input components remain mounted.
vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return { useDocument: () => ({ document: reactive({ doc: {
    user_emails: [{ email_account: 'Synthetic configured account', email_id: 'sender@example.test' }],
  } }) }) }
})
vi.mock('@/stores/settings', async () => {
  const { reactive, ref } = await import('vue')
  return { getSettings: () => ({ brand: reactive({}), settings: ref({}), _settings: reactive({ doc: {} }) }) }
})
vi.mock('@/stores/users', () => ({ usersStore: () => ({
  users: { data: { crmUsers: [] } },
  getUser: () => ({ email: 'author@example.test', full_name: 'Native author' }),
}) }))
vi.mock('frappe-ui/frappe', () => ({ useTelemetry: () => ({ capture() {} }) }))
vi.mock('frappe-ui', async (original) => {
  const actual = await original()
  const { reactive } = await import('vue')
  return { ...actual,
    useFileUpload: () => ({ upload: async (file, options) => {
      fixture.nativeUploads.push({ file, options })
      return { name: 'Native transport result', file_name: file.name, file_url: '/private/files/native-composer.txt' }
    } }),
    createResource: () => reactive({ data: [], loading: false, submit: async () => [], update() {}, reload() {} }),
    createListResource: () => reactive({ data: [], fetch: async () => [], reload() {} }),
  }
})

window.sysdefaults = {
  ...window.sysdefaults,
  date_format: 'yyyy-mm-dd',
  time_format: 'HH:mm:ss',
}

let app, element
// Complete native iframe loading before removing its browsing context.
// happy-dom otherwise dispatches an already queued load event after unmount.
afterEach(async () => {
  await window.happyDOM.waitUntilComplete()
  app?.unmount()
  element?.remove()
  document.body.innerHTML = ''
  fixture.nativeUploads = []
  fixture.xhrUploads = []
  vi.unstubAllGlobals()
})

async function settle() {
  for (let i = 0; i < 8; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('native Comment record-panel upload contract', () => {
  for (const entry of ['inline', 'attachment']) {
    it(`forwards a supplied uploader from the actual native Comment ${entry} control`, async () => {
      class SyntheticXHR extends EventTarget {
        static DONE = 4
        upload = new EventTarget()
        readyState = 0
        status = 200
        responseText = JSON.stringify({ message: uploaded })
        open() {}
        setRequestHeader() {}
        send(body) {
          fixture.xhrUploads.push(body)
          this.readyState = SyntheticXHR.DONE
          this.onreadystatechange?.()
        }
      }
      vi.stubGlobal('XMLHttpRequest', SyntheticXHR)
      const uploadFunction = vi.fn(async () => uploaded)
      const editor = ref(null)
      const content = ref('<p>Keep this <strong>native internal remark draft</strong>.</p>')
      const attachments = ref([])
      element = document.createElement('div')
      document.body.append(element)
      app = createApp({ setup() {
        const ui = useRecordPanelRuntime({ push() {} }, { on() {}, off() {}, emit() {} })
        return () => h(ui.native.CommentBox, {
          ref: editor,
          doctype: 'Contact',
          modelValue: { name: 'Native Comment parent' },
          content: content.value,
          'onUpdate:content': value => { content.value = value },
          attachments: attachments.value,
          'onUpdate:attachments': value => { attachments.value = value },
          uploadFunction,
        })
      } })
      app.use(createPinia())
      app.use(translationPlugin)
      for (const [name, component] of Object.entries({ Badge, Button, Dialog, ErrorMessage, FeatherIcon, FormControl, TextInput })) app.component(name, component)
      app.mount(element)
      await vi.waitFor(() => {
        expect(element.querySelector('[contenteditable="true"]')).not.toBeNull()
        expect(editor.value?.editor?.commands?.dropFiles).toBeTypeOf('function')
        expect(element.querySelector('input[type="file"]')).not.toBeNull()
      }, { timeout: 10000 })
      expect(element.textContent).toContain('Comment')
      expect(element.textContent).toContain('Discard')
      const file = new File(['Synthetic selected bytes'], uploaded.file_name, { type: 'text/plain' })
      if (entry === 'inline') expect(editor.value.editor.commands.dropFiles([file])).toBe(true)
      else {
        const input = element.querySelector('input[type="file"]')
        Object.defineProperty(input, 'files', { configurable: true, value: [file] })
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
      await vi.waitFor(() => {
        expect(uploadFunction.mock.calls.length + fixture.nativeUploads.length + fixture.xhrUploads.length).toBeGreaterThan(0)
      }, { timeout: 10000 })
      await settle()
      expect(uploadFunction).toHaveBeenCalledTimes(1)
      expect(uploadFunction.mock.calls[0][0]).toBe(file)
      if (entry === 'inline') {
        expect(uploadFunction.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
        expect(uploadFunction.mock.calls[0][1].onProgress).toBeTypeOf('function')
      }
      expect(fixture.nativeUploads).toEqual([])
      expect(fixture.xhrUploads).toEqual([])
      expect(content.value).toContain('native internal remark draft')
      if (entry === 'attachment') expect(attachments.value).toEqual([uploaded])
      else expect(content.value).toContain(uploaded.file_url)
    }, 25000)
  }
})
