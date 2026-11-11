import { call } from 'frappe-ui'
import { onUnmounted, reactive, watch } from 'vue'

interface ContactRow {
  name: string
  full_name?: string
  image?: string | null
  email_id?: string | null
  mobile_no?: string | null
  company_name?: string | null
  company_logo?: string | null
  modified?: string
}

function parsePage(value: unknown): {
  data: ContactRow[]
  total_count: number
} {
  if (
    !value ||
    typeof value !== 'object' ||
    !('data' in value) ||
    !('total_count' in value)
  ) {
    throw new Error('Invalid Organization Contacts response')
  }
  if (
    !Array.isArray(value.data) ||
    !Number.isInteger(value.total_count) ||
    Number(value.total_count) < 0
  ) {
    throw new Error('Invalid Organization Contacts response')
  }
  const data: ContactRow[] = value.data.map((row: unknown) => {
    if (
      !row ||
      typeof row !== 'object' ||
      !('name' in row) ||
      typeof row.name !== 'string'
    ) {
      throw new Error('Invalid Organization Contact')
    }
    for (const key of [
      'full_name',
      'image',
      'email_id',
      'mobile_no',
      'company_name',
      'company_logo',
      'modified',
    ]) {
      if (
        key in row &&
        row[key as keyof typeof row] != null &&
        typeof row[key as keyof typeof row] !== 'string'
      ) {
        throw new Error('Invalid Organization Contact field')
      }
    }
    // Every consumed optional field was validated above; no external values are executed.
    return row as ContactRow
  })
  return { data, total_count: Number(value.total_count) }
}

/** Shared only by the native desktop/mobile Organization Contacts tab. */
export function useOrganizationContacts(organization: () => string) {
  let generation = 0
  let disposed = false
  const contacts = reactive({
    data: [] as ContactRow[],
    totalCount: 0,
    loading: false,
    error: '',
    get hasMore() {
      return this.data.length < this.totalCount
    },
    reload: () => load(false),
    loadMore: () => load(true),
  })

  async function load(append: boolean) {
    if (append && contacts.loading) return
    const current = ++generation
    const name = organization()
    const start = append ? contacts.data.length : 0
    if (!append) {
      contacts.data = []
      contacts.totalCount = 0
    }
    contacts.loading = true
    contacts.error = ''
    const isCurrent = () =>
      !disposed && current === generation && name === organization()
    try {
      const page = parsePage(
        await call(
          'crm.fcrm.doctype.crm_organization.crm_organization.get_contacts',
          {
            organization: name,
            start,
            page_length: 20,
          },
        ),
      )
      if (!isCurrent()) return
      contacts.data = append ? [...contacts.data, ...page.data] : page.data
      contacts.totalCount = page.total_count
    } catch {
      if (!isCurrent()) return
      // A permission change must not leave previously readable rows/count visible.
      contacts.data = []
      contacts.totalCount = 0
      contacts.error = 'Contacts could not be loaded.'
    } finally {
      if (isCurrent()) contacts.loading = false
    }
  }

  // load owns transport/validation failures, including detached lifecycle requests.
  watch(
    organization,
    () => {
      void contacts.reload()
    },
    { immediate: true },
  )
  onUnmounted(() => {
    disposed = true
    generation++
  })
  return contacts
}
