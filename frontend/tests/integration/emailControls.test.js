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
// EmailEditor, rich editor and attachment-input components remain mounted.
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
afterEach(() => {
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

describe('native Email record-panel facade', () => {
  it('renders complete native Email history through the public runtime component registry', async () => {
    const activity = {
      name: 'Native complete Email identity',
      activity_type: 'communication',
      communication_type: 'Communication',
      communication_date: '2026-10-03 12:00:00',
      data: {
        sender: 'synthetic-sender@example.test',
        sender_full_name: 'Native configured sender',
        recipients: 'selected-recipient@example.test',
        cc: 'selected-copy@example.test',
        bcc: 'selected-blind-copy@example.test',
        subject: 'Native complete recorded subject',
        content: '<p>Complete native <strong>recorded Email body</strong></p>',
        delivery_status: 'Sent',
        attachments: [],
      },
    }
    element = document.createElement('div')
    document.body.append(element)
    app = createApp({
      setup() {
        const ui = useRecordPanelRuntime(
          { push() {} },
          { on() {}, off() {}, emit() {} },
        )
        return () => ui.native.EmailArea
          ? h(ui.native.EmailArea, { activity })
          : h('p', 'Native Email renderer unavailable')
      },
    })
    app.use(translationPlugin)
    app.use(createPinia())
    for (const [name, component] of Object.entries({ Badge, Button, FeatherIcon })) {
      app.component(name, component)
    }
    app.mount(element)
    // Public registry components are async imports; wait for the native view,
    // rather than assuming a fixed number of ticks loads the module graph.
    await vi.waitFor(() => {
      expect(element.textContent).toContain('Native complete recorded subject')
      expect(element.querySelector('iframe')).not.toBeNull()
    }, { timeout: 10000 })
    expect(element.textContent).toContain('Native complete recorded subject')
    expect(element.textContent).toContain('selected-recipient@example.test')
    expect(element.textContent).toContain('selected-copy@example.test')
    expect(element.textContent).toContain('selected-blind-copy@example.test')
    // EmailContent intentionally isolates rich message HTML in an iframe.
    const content = element.querySelector('iframe')?.srcdoc || ''
    const rendered = new DOMParser().parseFromString(content, 'text/html')
    expect(rendered.querySelector('strong')?.textContent).toBe('recorded Email body')
  }, 15000)

  for (const entry of ['inline', 'attachment', 'attachment failure']) {
    it(`forwards a supplied uploader from the actual native Email ${entry} control`, async () => {
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
      const failure = entry === 'attachment failure'
      const uploadFunction = vi.fn(async () => uploaded)
      if (failure) uploadFunction.mockRejectedValueOnce(undefined)
      const editor = ref(null)
      const content = ref('<p>Keep this <strong>native draft</strong>.</p>')
      const prior = { name: 'Prior native attachment', file_name: 'prior.txt', file_url: '/private/files/prior.txt' }
      const attachments = ref(failure ? [prior] : [])
      element = document.createElement('div')
      document.body.append(element)
      app = createApp({ setup() {
        const ui = useRecordPanelRuntime({ push() {} }, { on() {}, off() {}, emit() {} })
        return () => h(ui.native.EmailEditor, {
          ref: editor,
          doctype: 'Contact',
          modelValue: { name: 'Native Email parent', email: 'recipient@example.test' },
          content: content.value,
          'onUpdate:content': (value) => { content.value = value },
          attachments: attachments.value,
          'onUpdate:attachments': (value) => { attachments.value = value },
          uploadFunction,
        })
      } })
      app.use(createPinia())
      app.use(translationPlugin)
      app.provide('session', { user: 'author@example.test' })
      for (const [name, component] of Object.entries({ Badge, Button, Dialog, ErrorMessage, FeatherIcon, FormControl, TextInput })) {
        app.component(name, component)
      }
      app.mount(element)
      await vi.waitFor(() => {
        expect(element.querySelector('[contenteditable="true"]')).not.toBeNull()
        expect(editor.value?.editor?.commands?.dropFiles).toBeTypeOf('function')
        expect(element.querySelector('input[type="file"]')).not.toBeNull()
      }, { timeout: 10000 })
      const file = new File(['Synthetic selected bytes'], uploaded.file_name, { type: 'text/plain' })
      expect(element.querySelector('[contenteditable="true"]')).not.toBeNull()
      if (entry === 'inline') {
        expect(editor.value.editor.commands.dropFiles([file])).toBe(true)
      } else {
        const input = element.querySelector('input[type="file"]')
        expect(input).not.toBeNull()
        Object.defineProperty(input, 'files', { configurable: true, value: [file] })
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
      await vi.waitFor(() => {
        // Wait for either actual transport to finish before checking which
        // public uploader the native control selected.
        expect(uploadFunction.mock.calls.length + fixture.nativeUploads.length + fixture.xhrUploads.length).toBeGreaterThan(0)
      }, { timeout: 10000 })
      await settle()
      expect(uploadFunction).toHaveBeenCalledTimes(1)
      expect(uploadFunction.mock.calls[0][0]).toBe(file)
      if (entry === 'inline') {
        // Native media uploads also provide progress/cancellation options.
        expect(uploadFunction.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
        expect(uploadFunction.mock.calls[0][1].onProgress).toBeTypeOf('function')
      }
      expect(fixture.nativeUploads).toEqual([])
      expect(fixture.xhrUploads).toEqual([])
      expect(content.value).toContain('native draft')
      if (failure) {
        expect(element.textContent).toContain('Could not upload attachment')
        expect(attachments.value).toEqual([prior])
        // A second native selection proves the busy state resets after failure.
        const input = element.querySelector('input[type="file"]')
        input.dispatchEvent(new Event('change', { bubbles: true }))
        await vi.waitFor(() => expect(attachments.value).toEqual([prior, uploaded]))
        expect(uploadFunction).toHaveBeenCalledTimes(2)
      } else if (entry === 'attachment') expect(attachments.value).toEqual([uploaded])
      else expect(content.value).toContain(uploaded.file_url)
    }, 25000)
  }
})
