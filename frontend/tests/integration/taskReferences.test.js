import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { Button } from 'frappe-ui'
import Tasks from '@/pages/Tasks.vue'
import translationPlugin from '@/translation'
import { useDoctypeModal } from '@/composables/doctypeModal'

// Only backend/bootstrap dependencies are fake. Render the actual Tasks page,
// native Kanban cards and buttons, and navigate through the genuine router.
const fixture = vi.hoisted(() => ({ rows: [] }))
vi.mock('@/components/ViewControls.vue', () => ({
  default: {
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      emit('update:modelValue', reactive({
        params: { column_field: 'status' },
        reload() {},
        data: {
          view_type: 'kanban', title_field: 'title',
          rows: ['name', 'title', 'reference_doctype', 'reference_docname'],
          fields: [], kanban_columns: [{ name: 'Todo' }],
          data: [{ column: { name: 'Todo', count: fixture.rows.length, all_count: fixture.rows.length }, fields: [], data: fixture.rows }],
        },
      }))
      return () => null
    },
  },
}))
vi.mock('@/stores/meta', () => ({ getMeta: () => ({
  getFormattedPercent() {}, getFormattedFloat() {}, getFormattedCurrency() {},
}) }))
vi.mock('@/stores/users', () => ({ usersStore: () => ({ getUser: () => ({}), isManager: () => false }) }))
vi.mock('@/utils', () => ({ formatDate: value => value, isTouchScreenDevice: () => false, colors: ['gray'], parseColor: () => '' }))
vi.mock('@/composables/useTimelinePreferences', () => ({ timestampCell: value => ({ label: value }) }))
vi.mock('frappe-ui/frappe', () => ({ useOnboarding: () => ({ updateOnboardingStep() {} }), useTelemetry: () => ({ capture() {} }) }))

let app, element
afterEach(() => {
  app?.unmount()
  element?.remove()
  document.body.innerHTML = ''
  useDoctypeModal().show.value = false
})

async function open(doctype, docname = 'SAME/& identity') {
  fixture.rows = [{ name: 17, title: 'Native Task', reference_doctype: doctype, reference_docname: docname }]
  const placeholder = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/tasks/view/:viewType?', alias: '/tasks', name: 'Tasks', component: Tasks },
      { path: '/leads/:leadId', name: 'Lead', component: placeholder },
      { path: '/deals/:dealId', name: 'Deal', component: placeholder },
      { path: '/organizations/:organizationId', name: 'Organization', component: placeholder },
      { path: '/contacts/:contactId', name: 'Contact', component: placeholder },
    ],
  })
  await router.push('/tasks/view/kanban')
  await router.isReady()
  const header = document.createElement('div')
  header.id = 'app-header'
  document.body.append(header)
  element = document.createElement('div')
  document.body.append(element)
  app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.use(translationPlugin)
  app.component('Button', Button)
  app.mount(element)
  for (let count = 0; count < 6; count++) {
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  return { router, card: element.querySelector('[data-name="17"]') }
}

describe('native Task Kanban typed references', () => {
  for (const [doctype, label, routeName, parameter] of [
    ['CRM Lead', 'Lead', 'Lead', 'leadId'],
    ['CRM Deal', 'Deal', 'Deal', 'dealId'],
    ['CRM Organization', 'Organization', 'Organization', 'organizationId'],
    ['Contact', 'Contact', 'Contact', 'contactId'],
  ]) {
    it(`labels and opens ${doctype} without triggering the Task editor`, async () => {
      const { router, card } = await open(doctype)
      expect(card).not.toBeNull()
      const shortcut = [...card.querySelectorAll('button')].find(button => button.textContent.trim() === label)
      expect(shortcut).toBeDefined()
      shortcut.click()
      await vi.waitFor(() => expect(router.currentRoute.value.name).toBe(routeName))
      expect(router.currentRoute.value.params).toEqual({ [parameter]: 'SAME/& identity' })
      expect(useDoctypeModal().show.value).toBe(false)
    })
  }

  for (const [doctype, name] of [['Customer', 'SAME/& identity'], ['Contact', '']]) {
    it(`omits unsupported or missing ${doctype} reference navigation`, async () => {
      const { router, card } = await open(doctype, name)
      expect(card).not.toBeNull()
      expect([...card.querySelectorAll('button')].some(button => ['Lead', 'Deal', 'Organization', 'Contact'].includes(button.textContent.trim()))).toBe(false)
      expect(router.currentRoute.value.name).toBe('Tasks')
    })
  }
})
