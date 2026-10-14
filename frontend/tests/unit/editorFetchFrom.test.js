import { describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ values: {}, request: null }))
vi.mock('@/data/script', () => ({ getScript: () => ({ setupScript: vi.fn(), scripts: {} }) }))
vi.mock('@/stores/global', () => ({ globalStore: () => ({}) }))
vi.mock('@/stores/meta', () => ({ getMeta: () => ({ doctypeMeta: { value: { fields: [
  { fieldname: 'organization', fieldtype: 'Link', options: 'CRM Organization' },
  { fieldname: 'organization_name', fetch_from: 'organization.organization_name' },
] } } }) }))
vi.mock('@/composables/useAttachments', () => ({ useAttachments: () => ({ trackOldFile() {}, processPendingDeletions() {} }) }))
vi.mock('@/composables/settings', () => ({ showSettings: {}, activeSettingsPage: {} }))
vi.mock('@/utils', () => ({ runSequentially() {}, parseAssignees: value => value, sanitizeText: value => value }))
vi.mock('frappe-ui', () => ({
  call: vi.fn(async () => fixture.request ? await fixture.request : fixture.values),
  toast: { error() {}, success() {} },
  createResource: () => ({}),
  createDocumentResource: ({ doctype, name }) => ({ doc: { doctype, name }, save: { submit() {} } }),
}))

import { useDocument } from '@/data/document'

describe('upstream linked-field previews in independent editor documents', () => {
  it('updates the editing copy, retains the cached document and ignores a delayed obsolete link', async () => {
    const native = useDocument('FCRM Note', 'Linked preview').document
    native.doc.organization = 'Saved organization'
    native.doc.organization_name = 'Saved label'
    const working = { doc: { ...native.doc } }
    const editor = useDocument('FCRM Note', 'Linked preview', {}, working)
    fixture.values = { organization_name: 'New label' }
    await editor.triggerOnChange('organization', 'New organization')
    expect(working.doc.organization_name).toBe('New label')
    expect(native.doc.organization_name).toBe('Saved label')
    expect(native.doc.organization).toBe('Saved organization')

    let release
    fixture.request = new Promise(resolve => { release = resolve })
    const pending = editor.triggerOnChange('organization', 'Slow organization')
    await editor.triggerOnChange('organization', '')
    release({ organization_name: 'Obsolete label' })
    await pending
    fixture.request = null
    expect(working.doc.organization_name).toBeNull()
    expect(native.doc.organization_name).toBe('Saved label')

    fixture.values = { organization_name: 'Native new label' }
    await useDocument('FCRM Note', 'Linked preview').triggerOnChange('organization', 'Native new organization')
    expect(native.doc.organization_name).toBe('Native new label')
    expect(working.doc.organization).toBe('')
  })
})
