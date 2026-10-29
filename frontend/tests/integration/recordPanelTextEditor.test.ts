import { afterEach, expect, it } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import RecordPanelTextEditor from '@/components/Activities/RecordPanelTextEditor.vue'

let app: App | undefined
let element: HTMLDivElement | undefined

afterEach(() => {
  app?.unmount()
  element?.remove()
})

it('renders and refreshes rich native source content without editing controls', async () => {
  const content = ref(
    '<h3>Native source</h3><p><strong>Complete note</strong></p>',
  )
  element = document.createElement('div')
  document.body.append(element)
  app = createApp(() =>
    h(RecordPanelTextEditor, {
      content: content.value,
      editable: false,
      editorClass: 'source-content',
    }),
  )
  app.mount(element)
  await nextTick()
  expect(
    element.querySelector('[contenteditable="false"] strong')?.textContent,
  ).toBe('Complete note')
  expect(element.querySelector('[contenteditable="true"]')).toBeNull()
  expect(element.querySelector('button')).toBeNull()

  content.value = '<p><em>Fresh source revision</em></p>'
  await nextTick()
  expect(
    element.querySelector('[contenteditable="false"] em')?.textContent,
  ).toBe('Fresh source revision')
  expect(element.querySelector('.source-content')).not.toBeNull()
})
