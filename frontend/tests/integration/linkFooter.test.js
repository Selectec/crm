import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { Button } from 'frappe-ui'
import Link from '@/components/Controls/Link.vue'
const fixture = vi.hoisted(() => ({ resources: [] }))
vi.mock('@/utils', () => ({ isTranslatable: () => false }))
vi.mock('frappe-ui', async (original) => {
  const actual = await original()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createResource(options) {
      const resource = reactive({ data: [], update() {}, reload() {} })
      fixture.resources.push({ resource, options })
      return resource
    },
  }
})
let app, root
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
  fixture.resources = []
})
function visible(element) {
  for (let node = element; node; node = node.parentElement)
    if (node.style?.display === 'none') return false
  return document.contains(element)
}
async function open() {
  const value = ref('Current Contact')
  const create = vi.fn((_value, close) => close())
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () =>
      h(Link, {
        doctype: 'Contact',
        modelValue: value.value,
        'onUpdate:modelValue': (v) => (value.value = v),
        onCreate: create,
      }),
  })
  app.component('Button', Button)
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  await settle()
  root.querySelector('button').click()
  await settle()
  const input = document.querySelector('input[placeholder="Search"]')
  input.value = 'Unique missing person'
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await settle()
  // A real default-query reply can arrive while the text-query reply is pending.
  const { resource, options } = fixture.resources[0]
  resource.data = options.transform([
    { value: 'Older Contact', label: 'Older person', description: '' },
  ])
  await settle()
  return { value, create, input }
}
async function pressFooter(label) {
  const button = [...document.querySelectorAll('button')].find(
    (x) => x.textContent.trim() === label,
  )
  const down = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    button: 0,
  })
  button.dispatchEvent(down)
  // DOM emulators do not perform the browser's default mousedown focus action.
  if (!down.defaultPrevented) button.focus()
  await settle()
  if (visible(button)) {
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    button.click()
  }
  await settle()
}
it('Create New keeps the selected Contact until its callback runs, with pending search results', async () => {
  const { value, create } = await open()
  await pressFooter('Create New')
  expect.soft(value.value).toBe('Current Contact')
  expect(create).toHaveBeenCalledTimes(1)
})
it('Clear clears the Link instead of committing an active result on blur', async () => {
  const { value, create } = await open()
  await pressFooter('Clear')
  expect(value.value).toBe('')
  expect(create).not.toHaveBeenCalled()
})

it('ordinary option selection still uses the native mousedown handler', async () => {
  const { value, create } = await open()
  document
    .querySelector('[role="option"]')
    .dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    )
  await settle()
  expect(value.value).toBe('Older Contact')
  expect(create).not.toHaveBeenCalled()
})
it('ordinary keyboard selection still commits the active result', async () => {
  const { value, create, input } = await open()
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    }),
  )
  await settle()
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }),
  )
  await settle()
  expect(value.value).toBe('Older Contact')
  expect(create).not.toHaveBeenCalled()
})
