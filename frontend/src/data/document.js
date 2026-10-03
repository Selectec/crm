import { getScript } from '@/data/script'
import { globalStore } from '@/stores/global'
import { getMeta } from '@/stores/meta'
import { useAttachments } from '@/composables/useAttachments'
import { showSettings, activeSettingsPage } from '@/composables/settings'
import { runSequentially, parseAssignees, sanitizeText } from '@/utils'
import { findMissingMandatory } from '@/utils/fieldTransforms'
import { createDocumentResource, createResource, toast } from 'frappe-ui'
import { ref, reactive, getCurrentInstance, onScopeDispose } from 'vue'

const documentsCache = {}
const controllersCache = {}
const controllerSetupCache = {}
const assigneesCache = {}
const permissionsCache = {}
const realtimeOwners = new WeakMap()

function ownDocumentRealtime(socket, resource, doctype, name) {
  let state = realtimeOwners.get(socket)
  if (!state) {
    const records = new Map()
    const update = ({ doctype, name }) => {
      const record = records.get(JSON.stringify([doctype, String(name)]))
      // Native resources retain the error and invoke their onError hook. The
      // event dispatcher has no caller to consume a rejected fetch promise.
      record?.resource.reload().catch(() => {})
    }
    const reconnect = () => {
      for (const doctype of new Set([...records.values()].map(record => record.doctype))) {
        socket.emit('doctype_subscribe', doctype)
      }
    }
    state = { records, update, reconnect }
    realtimeOwners.set(socket, state)
    socket.on('list_update', update)
    socket.on('connect', reconnect)
  }
  const key = JSON.stringify([doctype, name])
  let record = state.records.get(key)
  if (!record) {
    record = { resource, doctype, owners: 0 }
    state.records.set(key, record)
    socket.emit('doctype_subscribe', doctype)
  }
  record.owners++
  onScopeDispose(() => {
    if (--record.owners) return
    state.records.delete(key)
    if (state.records.size) return
    socket.off('list_update', state.update)
    socket.off('connect', state.reconnect)
    realtimeOwners.delete(socket)
    // Doctype rooms are shared with native list resources. Releasing this
    // listener must not unsubscribe those independent consumers.
  })
}

export function useDocument(
  doctype,
  docname,
  resourceOverrides = {},
  editorDocument = null,
) {
  if (typeof docname === 'number') docname = String(docname)
  // An editor can own its working document and controllers while assignee and
  // permission resources retain their native shared identity.
  const documentStore = editorDocument
    ? { [doctype]: { [docname || '']: editorDocument } }
    : documentsCache
  const controllerStore = editorDocument ? {} : controllersCache
  const controllerSetupStore = editorDocument ? {} : controllerSetupCache
  const { setupScript, scripts } = getScript(doctype)
  const meta = getMeta(doctype)
  const { trackOldFile, processPendingDeletions } = useAttachments(
    doctype,
    docname,
  )

  const vm = getCurrentInstance()?.proxy
  documentStore[doctype] = documentStore[doctype] || {}

  const error = ref('')

  if (!documentStore[doctype][docname || '']) {
    if (docname) {
      documentStore[doctype][docname] = createDocumentResource(
        {
          doctype: doctype,
          name: docname,
          onSuccess: async () => await setupFormScript(),
          onError: (err) => {
            error.value = err
            if (err.exc_type === 'DoesNotExistError') {
              toast.error(__(err.messages[0] || 'Document does not exist'))
            }
            if (err.exc_type === 'PermissionError') {
              toast.error(
                __(
                  err.messages[0] ||
                    'You do not have permission to access this document',
                ),
              )
            }
          },
          setValue: {
            onSuccess: () => {
              triggerOnSave()
              toast.success(__('Document updated successfully'))
              processPendingDeletions()
            },
            onError: (err) => {
              triggerOnError(err)

              if (err.exc_type == 'MandatoryError') {
                const fieldName = err.messages
                  .map((msg) => {
                    let arr = msg.split(': ')
                    return arr[arr.length - 1].trim()
                  })
                  .join(', ')
                toast.error(__('Mandatory field error: {0}', [fieldName]))
                return
              }

              err.messages?.forEach((msg) => {
                toast.error(msg)
              })

              if (err.messages?.length === 0) {
                toast.error(__('An error occurred while updating the document'))
              }

              console.error(err)
            },
          },
          ...resourceOverrides,
          // The native cached resource does not dispose its realtime handler.
          // Own that handler in the calling Vue scope instead of its cache.
          realtime: false,
        },
        vm,
      )
      if (!documentStore[doctype][docname].fieldHtmlMap) {
        documentStore[doctype][docname].fieldHtmlMap = {}
      }
      if (!documentStore[doctype][docname].fieldPropertyOverrides) {
        documentStore[doctype][docname].fieldPropertyOverrides = {}
      }

      // Override the submit function to trigger validation before submitting
      // TODO: fix validate function to return error message instead of throwing error in frappe-ui and remove try-catch block here
      const _save = documentStore[doctype][docname].save
      const _originalSubmit = _save.submit
      _save.submit = async function (...args) {
        try {
          await triggerOnValidate()
        } catch (err) {
          console.error(err)
          return
        }
        const mandatory = checkMandatory(documentStore[doctype][docname].doc)
        if (mandatory) return
        return _originalSubmit.apply(_save, args)
      }
    } else {
      documentStore[doctype][''] = reactive({
        doc: { __newDocument: true, doctype },
        fieldPropertyOverrides: {},
      })
      setupFormScript()
    }
  }

  if (docname && !editorDocument && vm?.$socket && resourceOverrides.realtime !== false) {
    ownDocumentRealtime(vm.$socket, documentStore[doctype][docname], doctype, docname)
  }

  assigneesCache[doctype] = assigneesCache[doctype] || {}

  if (!assigneesCache[doctype][docname || '']) {
    assigneesCache[doctype][docname || ''] = createResource({
      url: 'crm.api.doc.get_assigned_users',
      cache: `assignees:${doctype}:${docname}`,
      auto: docname ? true : false,
      params: {
        doctype: doctype,
        name: docname,
      },
      transform: (data) => parseAssignees(data),
    })
  }

  permissionsCache[doctype] = permissionsCache[doctype] || {}

  if (!permissionsCache[doctype][docname || '']) {
    permissionsCache[doctype][docname || ''] = createResource({
      url: 'frappe.client.get_doc_permissions',
      cache: `permissions:${doctype}:${docname}`,
      auto: docname ? true : false,
      params: {
        doctype: doctype,
        docname: docname,
      },
      initialData: { permissions: {} },
    })
  }

  async function setupFormScript() {
    controllerSetupStore[doctype] = controllerSetupStore[doctype] || {}
    const key = docname || ''
    if (controllerSetupStore[doctype][key]) {
      return controllerSetupStore[doctype][key]
    }
    const pending = setupFormControllers()
    controllerSetupStore[doctype][key] = pending
    try {
      return await pending
    } finally {
      delete controllerSetupStore[doctype][key]
    }
  }

  async function setupFormControllers() {
    if (
      controllerStore[doctype] &&
      typeof controllerStore[doctype][docname || ''] === 'object'
    ) {
      return
    }

    if (!controllerStore[doctype]) {
      controllerStore[doctype] = {}
    }

    controllerStore[doctype][docname || ''] = {}

    const { makeCall } = globalStore()

    let helpers = {}

    helpers.crm = {
      makePhoneCall: makeCall,
      openSettings: (page) => {
        showSettings.value = true
        activeSettingsPage.value = page
      },
    }

    const controllersArray = await setupScript(
      documentStore[doctype][docname || ''],
      helpers,
    )

    if (!controllersArray || controllersArray.length === 0) return

    const organizedControllers = {}
    for (const controller of controllersArray) {
      const controllerKey = controller._className || controller.constructor.name
      if (!organizedControllers[controllerKey]) {
        organizedControllers[controllerKey] = []
      }
      organizedControllers[controllerKey].push(controller)
    }
    controllerStore[doctype][docname || ''] = organizedControllers

    triggerOnLoad()
    triggerOnRender()
  }

  function getControllers(row = null) {
    const _doctype = row?.doctype || doctype
    const controllerKey = _doctype.replace(/\s+/g, '')

    const docControllers = controllerStore[doctype]?.[docname || '']

    if (
      typeof docControllers === 'object' &&
      docControllers !== null &&
      !Array.isArray(docControllers)
    ) {
      return docControllers[controllerKey] || []
    }
    return []
  }

  function checkMandatory(doc) {
    let fields = meta?.doctypesMeta?.[doctype]?.fields || []

    if (!fields || fields.length === 0) return

    const overrides =
      documentStore[doctype][docname || '']?.fieldPropertyOverrides || {}

    const missingFields = findMissingMandatory(fields, doc, {
      propertyOverrides: overrides,
      doctypesMeta: meta?.doctypesMeta || {},
    })

    if (missingFields.length > 0) {
      toast.error(
        __('Mandatory fields required: {0}', [missingFields.join(', ')]),
      )
      return __('Mandatory fields required: {0}', [missingFields.join(', ')])
    }
  }

  async function triggerOnLoad() {
    const handler = async function () {
      await (this.onLoad?.() || this.on_load?.() || this.onload?.())
    }
    await trigger(handler)
  }

  async function triggerOnRender() {
    const handler = async function () {
      await (this.onRender?.() || this.on_render?.() || this.refresh?.())
    }
    await trigger(handler)
  }

  async function triggerOnBeforeCreate() {
    const args = Array.from(arguments)
    const handler = async function () {
      await (this.onBeforeCreate?.(...args) || this.on_before_create?.(...args))
    }
    await trigger(handler)
  }

  async function triggerOnValidate() {
    const handler = async function () {
      await (this.onValidate?.() || this.on_validate?.() || this.validate?.())
    }
    await trigger(handler)
  }

  async function triggerOnSave() {
    const handler = async function () {
      await (this.onSave?.() || this.on_save?.())
    }
    await trigger(handler)
  }

  async function triggerOnError() {
    const handler = async function () {
      await (this.onError?.() || this.on_error?.())
    }
    await trigger(handler)
  }

  async function triggerOnChange(fieldname, _value, row) {
    const value = sanitizeText(_value)
    let oldValue = null
    if (row) {
      oldValue = row[fieldname]
      row[fieldname] = value
    } else {
      oldValue = documentStore[doctype][docname || ''].doc[fieldname]
      documentStore[doctype][docname || ''].doc[fieldname] = value
      trackOldFile(oldValue, value)
    }

    const handler = async function () {
      this.value = value
      this.oldValue = oldValue
      if (row) {
        this.currentRowIdx = row.idx
      }
      await this[fieldname]?.()
    }

    try {
      await trigger(handler, row)
    } catch (error) {
      console.error(handler)
      throw error
    }
  }

  async function triggerButton(fieldname, row) {
    const handler = async function () {
      if (row) {
        this.currentRowIdx = row.idx
      }
      await this[fieldname]?.()
    }
    await trigger(handler, row)
  }

  async function triggerOnRowAdd(row) {
    const handler = async function () {
      this.currentRowIdx = row.idx
      this.value = row
      await this[row.parentfield + '_add']?.()
    }

    await trigger(handler, row)
  }

  async function triggerOnRowRemove(selectedRows, rows) {
    const handler = async function () {
      if (selectedRows.size === 1) {
        const selectedRow = Array.from(selectedRows)[0]
        this.currentRowIdx = rows.find((r) => r.name === selectedRow).idx
      } else {
        delete this.currentRowIdx
      }

      this.selectedRows = Array.from(selectedRows)
      this.rows = rows

      await this[rows[0].parentfield + '_remove']?.()
    }

    await trigger(handler, rows[0])
  }

  async function triggerOnCreateLead() {
    const args = Array.from(arguments)
    const handler = async function () {
      await (this.onCreateLead?.(...args) || this.on_create_lead?.(...args))
    }
    await trigger(handler)
  }

  async function triggerConvertToDeal() {
    const args = Array.from(arguments)
    const handler = async function () {
      await (this.convertToDeal?.(...args) || this.convert_to_deal?.(...args))
    }
    await trigger(handler)
  }

  function setFieldHtml(fieldname, html) {
    const cache = documentStore[doctype][docname || '']
    if (!cache.fieldHtmlMap) cache.fieldHtmlMap = {}
    cache.fieldHtmlMap[fieldname] = html
  }

  async function trigger(taskFn, row = null) {
    const controllers = getControllers(row)
    if (!controllers.length) return

    const tasks = controllers.map(
      (controller) => async () => await taskFn.call(controller),
    )

    await runSequentially(tasks)
  }

  return {
    document: documentStore[doctype][docname || ''],
    assignees: assigneesCache[doctype][docname || ''],
    permissions: permissionsCache[doctype][docname || ''],
    scripts,
    error,
    getControllers,
    triggerOnLoad,
    triggerOnRender,
    triggerOnBeforeCreate,
    triggerOnValidate,
    triggerOnSave,
    triggerOnError,
    triggerOnChange,
    triggerButton,
    triggerOnRowAdd,
    triggerOnRowRemove,
    setupFormScript,
    triggerOnCreateLead,
    triggerConvertToDeal,
    setFieldHtml,
  }
}
