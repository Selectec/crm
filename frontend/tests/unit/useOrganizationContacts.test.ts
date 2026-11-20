import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { useOrganizationContacts } from '@/composables/useOrganizationContacts'

const transport = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: transport.call }))
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  transport.call.mockReset()
})

function mount() {
  const organization = ref('org-a')
  let contacts: ReturnType<typeof useOrganizationContacts> | undefined
  const app = createApp({
    setup() {
      contacts = useOrganizationContacts(() => organization.value)
      return () => h('div')
    },
  })
  const target = document.createElement('div')
  document.body.append(target)
  app.mount(target)
  cleanup.push(() => {
    app.unmount()
    target.remove()
  })
  if (!contacts) throw new Error('Contacts composable was not mounted')
  return { contacts, organization }
}

it('loads permission-filtered totals and appends the next bounded native page', async () => {
  transport.call.mockResolvedValue({
    data: Array.from({ length: 20 }, (_, i) => ({ name: `contact-${i}` })),
    total_count: 23,
  })
  const { contacts } = mount()
  await nextTick()
  expect(contacts.totalCount).toBe(23)
  expect(contacts.data).toHaveLength(20)
  expect(contacts.hasMore).toBe(true)
  transport.call.mockResolvedValue({
    data: [{ name: 'last-1' }, { name: 'last-2' }, { name: 'last-3' }],
    total_count: 23,
  })
  await contacts.loadMore()
  expect(transport.call).toHaveBeenLastCalledWith(expect.any(String), {
    organization: 'org-a',
    start: 20,
    page_length: 20,
  })
  expect(contacts.data).toHaveLength(23)
  expect(contacts.hasMore).toBe(false)
  transport.call.mockRejectedValue(new Error('Permission denied'))
  await contacts.reload()
  expect(contacts.data).toEqual([])
  expect(contacts.totalCount).toBe(0)
  expect(contacts.error).toBeTruthy()
})

it('discards an old page after native Organization navigation or unmount', async () => {
  const resolves: ((value: unknown) => void)[] = []
  transport.call.mockImplementation(
    () => new Promise((resolve) => resolves.push(resolve)),
  )
  const { contacts, organization } = mount()
  organization.value = 'org-b'
  await nextTick()
  resolves[1]?.({ data: [{ name: 'current-contact' }], total_count: 1 })
  await nextTick()
  resolves[0]?.({ data: [{ name: 'old-contact' }], total_count: 1 })
  await nextTick()
  expect(contacts.data.map((row) => row.name)).toEqual(['current-contact'])
  const pending = contacts.reload()
  cleanup.splice(0).forEach((fn) => fn())
  resolves[2]?.({ data: [{ name: 'late-contact' }], total_count: 1 })
  await pending
  expect(contacts.data).toEqual([])
})

it('rejects malformed row fields and count responses', async () => {
  transport.call.mockResolvedValue({
    data: [{ name: 'contact', company_name: { secret: true } }],
    total_count: 1,
  })
  const { contacts } = mount()
  await nextTick()
  expect(contacts.error).toBeTruthy()
  transport.call.mockResolvedValue({ data: [], total_count: -1 })
  await contacts.reload()
  expect(contacts.error).toBeTruthy()
})
