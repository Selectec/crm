import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { Badge, Button, FeatherIcon } from 'frappe-ui'
import { useRecordPanelRuntime } from '@/components/Activities/recordPanelRuntime'
import translationPlugin from '@/translation'

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
    for (const [name, component] of Object.entries({ Badge, Button, FeatherIcon })) {
      app.component(name, component)
    }
    app.mount(element)
    await settle()
    expect(element.textContent).toContain('Native complete recorded subject')
    expect(element.textContent).toContain('selected-recipient@example.test')
    expect(element.textContent).toContain('selected-copy@example.test')
    expect(element.textContent).toContain('selected-blind-copy@example.test')
    // EmailContent intentionally isolates rich message HTML in an iframe.
    const content = element.querySelector('iframe')?.srcdoc || ''
    const rendered = new DOMParser().parseFromString(content, 'text/html')
    expect(rendered.querySelector('strong')?.textContent).toBe('recorded Email body')
  })
})
