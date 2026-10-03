import { shallowRef } from 'vue'
import { call } from 'frappe-ui'

// GlobalModals owns native Vue/Dialog lifetime, just as it owns field dialogs.
export const recordPanelDialogs = shallowRef([])
const targets = new Set(['CRM Lead', 'CRM Deal'])

export async function renderRecordPanelDialog(options, record) {
  const doc = record?.doc
  if (!targets.has(doc?.doctype) || typeof doc?.name !== 'string' || !doc.name) {
    throw new Error('Record dialog requires a supported saved Sales record')
  }
  const context = { doctype: doc.doctype, name: doc.name }
  // The server checks native parent read before returning installed-app assets.
  const discovered = await call('crm.api.record_page.get_panels', context)
  if (discovered?.context?.doctype !== context.doctype || discovered?.context?.name !== context.name) {
    throw new Error('Record dialog discovery returned a different typed context')
  }
  const descriptor = discovered.contributions?.find(item => item.key === options?.key)
  if (!descriptor) throw new Error('Record dialog contribution is not declared')
  const panel = options.panel ?? descriptor.default_panel ?? descriptor.panels[0]?.id
  if (!descriptor.panels.some(item => item.id === panel)) throw new Error('Record dialog panel is not declared')

  return new Promise((resolve, reject) => {
    const guards = new Set()
    let settled = false, closed = false, closing = false
    const entry = {
      key: Symbol('record-dialog'), descriptor, panel, doc, context,
      refreshRecord: () => record.reload?.(),
      registerCloseGuard(guard) {
        if (typeof guard !== 'function') throw new TypeError('Dialog close guard must be a function')
        guards.add(guard)
        return () => guards.delete(guard)
      },
      ready(component) {
        if (settled || closed) return
        settled = true
        resolve({ component, close: entry.close })
      },
      fail(error) {
        if (!settled) { settled = true; reject(error) }
        closed = true
        recordPanelDialogs.value = recordPanelDialogs.value.filter(item => item !== entry)
      },
      async close() {
        if (closed) return true
        if (closing) return false
        closing = true
        try {
          for (const guard of guards) if (!(await guard())) return false
          entry.fail(new Error('Record dialog closed before its renderer was ready'))
          return true
        } finally { closing = false }
      },
    }
    recordPanelDialogs.value = [...recordPanelDialogs.value, entry]
  })
}
